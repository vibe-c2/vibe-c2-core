package auth

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// Redis layout for active sessions.
//
//   refresh:<user_id>:<token_hash>   STRING — "<session_id>|<last_activity_unix>"
//   session_index:<user_id>          SET    — all live token keys for one user
//
// Both expire via native Redis TTL. There is no expiry queue, no sweeper,
// no full meta — the device fields (IP, UA, browser, OS) live exclusively
// in the Mongo creation log.
//
// All multi-key writes go through Lua scripts so concurrent rotations from
// multiple API pods are linearizable on the Redis side.

const (
	refreshKeyPrefix   = "refresh"
	userIndexKeyPrefix = "session_index"
	graceKeyPrefix     = "refresh_grace"

	// rotateSweepLimit caps how many index members the rotate Lua script
	// will check-and-prune per call. Stale members (index entries whose
	// token key has TTL'd out) are cleaned opportunistically during every
	// rotation. The cap keeps worst-case script runtime predictable even
	// for pathological users with many abandoned devices — anything not
	// swept in one rotate is picked up by the next one.
	rotateSweepLimit = 64
)

type RedisTokenStoreConfig struct {
	Host               string
	Port               string
	Password           string
	DB                 int
	Logger             *zap.Logger
	GraceEncryptionKey []byte // 32-byte AES-256 key from DeriveGraceKey
}

type redisTokenStore struct {
	client   *redis.Client
	logger   *zap.Logger
	graceKey []byte // AES-256 key for grace shadow encryption

	createScript *redis.Script
	rotateScript *redis.Script
	deleteScript *redis.Script
}

// createScriptSrc atomically writes a new active session.
//
//	KEYS[1] — token key  refresh:<uid>:<hash>
//	KEYS[2] — user index session_index:<uid>
//	ARGV[1] — value      "<session_id>|<last_activity_unix>"
//	ARGV[2] — TTL seconds
const createScriptSrc = `
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SADD', KEYS[2], KEYS[1])
redis.call('EXPIRE', KEYS[2], ARGV[2])
return 1
`

// rotateScriptSrc atomically swaps the token key for a session, preserving
// the embedded session_id.
//
//	KEYS[1] — old token key  refresh:<uid>:<oldHash>
//	KEYS[2] — new token key  refresh:<uid>:<newHash>
//	KEYS[3] — user index     session_index:<uid>
//	ARGV[1] — new last_activity_unix
//	ARGV[2] — TTL seconds
//	ARGV[3] — sweep limit (max stale index members to check-and-prune)
//
// Returns the old value (so the Go side can parse out the session_id), or
// the NOTFOUND error if the old key is gone (replay or loser-of-race).
//
// After the core rotation completes, the script opportunistically sweeps
// stale members from the user's index SET. A member is "stale" when it
// names a token key that no longer exists (TTL'd out without being rotated
// or explicitly deleted — i.e. an abandoned device). Sweep is bounded by
// ARGV[3] so worst-case script runtime stays predictable; anything not
// cleaned here is caught by the next rotate.
const rotateScriptSrc = `
local old = redis.call('GET', KEYS[1])
if not old then
  return redis.error_reply('NOTFOUND')
end
local sep = string.find(old, '|', 1, true)
if not sep then
  return redis.error_reply('CORRUPT')
end
local sid = string.sub(old, 1, sep - 1)
local newval = sid .. '|' .. ARGV[1]
redis.call('SET', KEYS[2], newval, 'EX', ARGV[2])
redis.call('SADD', KEYS[3], KEYS[2])
redis.call('SREM', KEYS[3], KEYS[1])
redis.call('EXPIRE', KEYS[3], ARGV[2])
redis.call('DEL', KEYS[1])

local sweepLimit = tonumber(ARGV[3])
if sweepLimit and sweepLimit > 0 then
  local members = redis.call('SMEMBERS', KEYS[3])
  local checked = 0
  for i = 1, #members do
    if checked >= sweepLimit then break end
    if members[i] ~= KEYS[2] then
      if redis.call('EXISTS', members[i]) == 0 then
        redis.call('SREM', KEYS[3], members[i])
      end
      checked = checked + 1
    end
  end
end

return old
`

// deleteScriptSrc atomically removes a single session and returns its old
// value. Returns NOTFOUND if the key is gone.
//
//	KEYS[1] — token key   refresh:<uid>:<hash>
//	KEYS[2] — user index  session_index:<uid>
const deleteScriptSrc = `
local v = redis.call('GET', KEYS[1])
if not v then
  redis.call('SREM', KEYS[2], KEYS[1])
  return redis.error_reply('NOTFOUND')
end
redis.call('DEL', KEYS[1])
redis.call('SREM', KEYS[2], KEYS[1])
return v
`

func NewRedisTokenStore(ctx context.Context, cfg RedisTokenStoreConfig) (TokenStore, error) {
	addr := fmt.Sprintf("%s:%s", cfg.Host, cfg.Port)

	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	var err error
	for i := 1; i <= 3; i++ {
		err = client.Ping(ctx).Err()
		if err == nil {
			break
		}
		cfg.Logger.Warn("Failed to connect to Redis token store",
			zap.Int("attempt", i),
			zap.Error(err),
		)
		if i < 3 {
			time.Sleep(3 * time.Second)
		}
	}
	if err != nil {
		client.Close()
		return nil, fmt.Errorf("failed to connect to Redis token store after 3 attempts: %w", err)
	}

	cfg.Logger.Info("Redis token store connection established", zap.Int("db", cfg.DB))

	return &redisTokenStore{
		client:       client,
		logger:       cfg.Logger,
		graceKey:     cfg.GraceEncryptionKey,
		createScript: redis.NewScript(createScriptSrc),
		rotateScript: redis.NewScript(rotateScriptSrc),
		deleteScript: redis.NewScript(deleteScriptSrc),
	}, nil
}

func tokenKey(userID uuid.UUID, tokenHash string) string {
	return fmt.Sprintf("%s:%s:%s", refreshKeyPrefix, userID.String(), tokenHash)
}

func indexKey(userID uuid.UUID) string {
	return fmt.Sprintf("%s:%s", userIndexKeyPrefix, userID.String())
}

// encodeValue produces the canonical Redis value: "<session_id>|<unix>".
func encodeValue(sessionID uuid.UUID, lastActivity time.Time) string {
	return sessionID.String() + "|" + strconv.FormatInt(lastActivity.Unix(), 10)
}

// parseValue is the inverse: extract session_id + last_activity from the
// stored string. Returns ErrTokenCorrupted on malformed input.
func parseValue(raw string) (uuid.UUID, time.Time, error) {
	idx := strings.IndexByte(raw, '|')
	if idx <= 0 || idx == len(raw)-1 {
		return uuid.Nil, time.Time{}, fmt.Errorf("%w: missing separator", ErrTokenCorrupted)
	}
	sid, err := uuid.Parse(raw[:idx])
	if err != nil {
		return uuid.Nil, time.Time{}, fmt.Errorf("%w: bad session id: %v", ErrTokenCorrupted, err)
	}
	unix, err := strconv.ParseInt(raw[idx+1:], 10, 64)
	if err != nil {
		return uuid.Nil, time.Time{}, fmt.Errorf("%w: bad last_activity: %v", ErrTokenCorrupted, err)
	}
	return sid, time.Unix(unix, 0).UTC(), nil
}

func (s *redisTokenStore) Create(ctx context.Context, userID, sessionID uuid.UUID, tokenHash string, ttl time.Duration) error {
	if tokenHash == "" {
		return fmt.Errorf("missing token hash")
	}
	key := tokenKey(userID, tokenHash)
	idx := indexKey(userID)
	value := encodeValue(sessionID, time.Now().UTC())
	ttlSec := int64(ttl.Seconds())

	_, err := s.createScript.Run(
		ctx, s.client,
		[]string{key, idx},
		value, ttlSec,
	).Result()
	if err != nil && !errors.Is(err, redis.Nil) {
		return fmt.Errorf("create session: %w", err)
	}
	return nil
}

func (s *redisTokenStore) Rotate(ctx context.Context, userID uuid.UUID, oldHash, newHash string, ttl time.Duration) (uuid.UUID, error) {
	if oldHash == "" || newHash == "" {
		return uuid.Nil, fmt.Errorf("missing token hash")
	}
	oldKey := tokenKey(userID, oldHash)
	newKey := tokenKey(userID, newHash)
	idx := indexKey(userID)
	now := strconv.FormatInt(time.Now().UTC().Unix(), 10)
	ttlSec := int64(ttl.Seconds())

	res, err := s.rotateScript.Run(
		ctx, s.client,
		[]string{oldKey, newKey, idx},
		now, ttlSec, rotateSweepLimit,
	).Result()
	if err != nil {
		if isLuaError(err, "NOTFOUND") {
			return uuid.Nil, ErrTokenInvalid
		}
		if isLuaError(err, "CORRUPT") {
			return uuid.Nil, ErrTokenCorrupted
		}
		return uuid.Nil, fmt.Errorf("rotate session: %w", err)
	}

	raw, ok := res.(string)
	if !ok {
		return uuid.Nil, fmt.Errorf("rotate: unexpected redis return type %T", res)
	}
	sid, _, err := parseValue(raw)
	if err != nil {
		return uuid.Nil, err
	}
	return sid, nil
}

func (s *redisTokenStore) Lookup(ctx context.Context, userID uuid.UUID, tokenHash string) (*ActiveSession, error) {
	raw, err := s.client.Get(ctx, tokenKey(userID, tokenHash)).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return nil, ErrTokenInvalid
		}
		return nil, fmt.Errorf("lookup session: %w", err)
	}
	sid, last, err := parseValue(raw)
	if err != nil {
		return nil, err
	}
	return &ActiveSession{SessionID: sid, LastActivityAt: last}, nil
}

func (s *redisTokenStore) DeleteBySessionID(ctx context.Context, userID, sessionID uuid.UUID) (*ActiveSession, error) {
	idx := indexKey(userID)
	keys, err := s.client.SMembers(ctx, idx).Result()
	if err != nil {
		return nil, fmt.Errorf("delete by session id: index: %w", err)
	}
	if len(keys) == 0 {
		return nil, ErrTokenInvalid
	}
	values, err := s.client.MGet(ctx, keys...).Result()
	if err != nil {
		return nil, fmt.Errorf("delete by session id: mget: %w", err)
	}

	var matchedKey string
	var matchedSession ActiveSession
	staleKeys := make([]interface{}, 0)
	for i, v := range values {
		if v == nil {
			staleKeys = append(staleKeys, keys[i])
			continue
		}
		raw, ok := v.(string)
		if !ok {
			continue
		}
		sid, last, perr := parseValue(raw)
		if perr != nil {
			continue
		}
		if sid == sessionID {
			matchedKey = keys[i]
			matchedSession = ActiveSession{SessionID: sid, LastActivityAt: last}
			break
		}
	}
	if len(staleKeys) > 0 {
		_ = s.client.SRem(ctx, idx, staleKeys...).Err()
	}
	if matchedKey == "" {
		return nil, ErrTokenInvalid
	}

	_, err = s.deleteScript.Run(
		ctx, s.client,
		[]string{matchedKey, idx},
	).Result()
	if err != nil {
		if isLuaError(err, "NOTFOUND") {
			return nil, ErrTokenInvalid
		}
		return nil, fmt.Errorf("delete by session id: delete: %w", err)
	}
	return &matchedSession, nil
}

func (s *redisTokenStore) ListByUser(ctx context.Context, userID uuid.UUID) ([]ActiveSession, error) {
	idx := indexKey(userID)
	keys, err := s.client.SMembers(ctx, idx).Result()
	if err != nil {
		return nil, fmt.Errorf("list user sessions: %w", err)
	}
	if len(keys) == 0 {
		return nil, nil
	}
	values, err := s.client.MGet(ctx, keys...).Result()
	if err != nil {
		return nil, fmt.Errorf("list user sessions: mget: %w", err)
	}

	out := make([]ActiveSession, 0, len(values))
	staleKeys := make([]interface{}, 0)
	for i, v := range values {
		if v == nil {
			// Stale index entry — the underlying key TTL'd out but the
			// index member wasn't cleaned. Schedule cleanup below.
			staleKeys = append(staleKeys, keys[i])
			continue
		}
		raw, ok := v.(string)
		if !ok {
			continue
		}
		sid, last, perr := parseValue(raw)
		if perr != nil {
			s.logger.Warn("list: corrupted session value", zap.String("key", keys[i]), zap.Error(perr))
			continue
		}
		out = append(out, ActiveSession{SessionID: sid, LastActivityAt: last})
	}
	if len(staleKeys) > 0 {
		_ = s.client.SRem(ctx, idx, staleKeys...).Err()
	}
	return out, nil
}

// ListAllActive returns all live sessions across every user by SCANning
// for session_index:* keys, then pipelining SMEMBERS + MGET to collect
// session IDs. This is O(total Redis keys) for the SCAN phase — fine for
// infrequent admin queries, but not suited for high-frequency polling.
// If this becomes a bottleneck, replace with a global active-users SET
// maintained on login/logout.
func (s *redisTokenStore) ListAllActive(ctx context.Context) ([]ActiveSession, error) {
	// Phase 1: SCAN for all session_index:* keys.
	pattern := userIndexKeyPrefix + ":*"
	var indexKeys []string
	var cursor uint64
	for {
		keys, next, err := s.client.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return nil, fmt.Errorf("list all active: scan: %w", err)
		}
		indexKeys = append(indexKeys, keys...)
		cursor = next
		if cursor == 0 {
			break
		}
	}
	if len(indexKeys) == 0 {
		return nil, nil
	}

	// Phase 2: pipeline SMEMBERS for each index key to get all token keys.
	pipe := s.client.Pipeline()
	smembersCmds := make([]*redis.StringSliceCmd, len(indexKeys))
	for i, ik := range indexKeys {
		smembersCmds[i] = pipe.SMembers(ctx, ik)
	}
	if _, err := pipe.Exec(ctx); err != nil {
		return nil, fmt.Errorf("list all active: smembers pipeline: %w", err)
	}

	var allTokenKeys []string
	for _, cmd := range smembersCmds {
		tokenKeys, err := cmd.Result()
		if err != nil {
			continue // best-effort: skip users whose index read failed
		}
		allTokenKeys = append(allTokenKeys, tokenKeys...)
	}
	if len(allTokenKeys) == 0 {
		return nil, nil
	}

	// Phase 3: MGET all token values in one round-trip.
	values, err := s.client.MGet(ctx, allTokenKeys...).Result()
	if err != nil {
		return nil, fmt.Errorf("list all active: mget: %w", err)
	}

	out := make([]ActiveSession, 0, len(values))
	for i, v := range values {
		if v == nil {
			continue // TTL'd out between SMEMBERS and MGET — stale, skip
		}
		raw, ok := v.(string)
		if !ok {
			continue
		}
		sid, last, perr := parseValue(raw)
		if perr != nil {
			s.logger.Warn("listAllActive: corrupted session value",
				zap.String("key", allTokenKeys[i]), zap.Error(perr))
			continue
		}
		out = append(out, ActiveSession{SessionID: sid, LastActivityAt: last})
	}
	return out, nil
}

func (s *redisTokenStore) DeleteAllForUser(ctx context.Context, userID uuid.UUID) error {
	idx := indexKey(userID)
	keys, err := s.client.SMembers(ctx, idx).Result()
	if err != nil {
		return fmt.Errorf("delete all for user: index: %w", err)
	}
	pipe := s.client.Pipeline()
	if len(keys) > 0 {
		pipe.Del(ctx, keys...)
	}
	pipe.Del(ctx, idx)
	if _, err := pipe.Exec(ctx); err != nil {
		return fmt.Errorf("delete all for user: %w", err)
	}
	return nil
}

func (s *redisTokenStore) Close() error {
	return s.client.Close()
}

func graceKey(userID uuid.UUID, oldHash string) string {
	return fmt.Sprintf("%s:%s:%s", graceKeyPrefix, userID.String(), oldHash)
}

// encodeGracePayload serialises a GracePayload into the pipe-delimited
// format stored in Redis: "<encrypted_new_raw>|<new_hash>|<session_id>".
func encodeGracePayload(p GracePayload) string {
	return p.NewRawEncrypted + "|" + p.NewHash + "|" + p.SessionID.String()
}

// parseGracePayload is the inverse of encodeGracePayload.
func parseGracePayload(raw string) (*GracePayload, error) {
	parts := strings.SplitN(raw, "|", 3)
	if len(parts) != 3 {
		return nil, fmt.Errorf("%w: grace payload: wrong field count", ErrTokenCorrupted)
	}
	sid, err := uuid.Parse(parts[2])
	if err != nil {
		return nil, fmt.Errorf("%w: grace payload: bad session id: %v", ErrTokenCorrupted, err)
	}
	return &GracePayload{
		NewRawEncrypted: parts[0],
		NewHash:         parts[1],
		SessionID:       sid,
	}, nil
}

func (s *redisTokenStore) SaveGrace(ctx context.Context, userID uuid.UUID, oldHash string, payload GracePayload, ttl time.Duration) error {
	key := graceKey(userID, oldHash)
	value := encodeGracePayload(payload)
	return s.client.Set(ctx, key, value, ttl).Err()
}

func (s *redisTokenStore) LookupGrace(ctx context.Context, userID uuid.UUID, oldHash string) (*GracePayload, error) {
	raw, err := s.client.Get(ctx, graceKey(userID, oldHash)).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return nil, ErrTokenInvalid
		}
		return nil, fmt.Errorf("lookup grace: %w", err)
	}
	return parseGracePayload(raw)
}

// isLuaError matches the named error returned via redis.error_reply from
// our Lua scripts. The go-redis client surfaces them as plain errors whose
// string is exactly the reply text.
func isLuaError(err error, name string) bool {
	if err == nil {
		return false
	}
	return err.Error() == name
}
