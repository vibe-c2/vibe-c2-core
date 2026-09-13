package middleware

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/cache"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/logger"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
	"go.uber.org/zap"
)

// APIKeyAuthFlag is the gin.Context key set by AuthN when a request was
// authenticated via API key (rather than the JWT cookie). The CSRF middleware
// consults this to skip CSRF enforcement — API key callers are scripts, not
// browsers, so there's no cookie surface to defend.
const APIKeyAuthFlag = "apiKeyAuth"

// AgentAuthFlag is the gin.Context key set by AuthN when a request was
// authenticated via a delegated agent key. Like API keys, agent callers are
// not browsers, so CSRF does not apply. Unlike API keys, agent callers are
// confined to the MCP endpoint — see RequireHuman.
const AgentAuthFlag = "agentAuth"

// AgentInfoKey is the gin.Context key holding the *models.AgentKey the request
// authenticated with. The MCP layer reads it to resolve scope; nothing else
// should need it.
const AgentInfoKey = "agentKey"

// touchDebounceTTL caps last_used_at write frequency to once per minute per
// key. Cache key is per-key_id; a SET-with-TTL returning "already exists"
// suppresses the write.
const touchDebounceTTL = 60 * time.Second

// agentAuthCacheTTL bounds how long a resolved (agent key, owner) pair is
// reused without going back to Mongo. Key changes evict immediately through
// repository.NewAgentKeyRepositoryWithAuthCache; this TTL is the backstop for
// changes to the owner (deactivation, role edits), which reach agent traffic
// within this window.
const agentAuthCacheTTL = 30 * time.Second

// AuthN returns middleware that authenticates the request via either:
//
//   - Authorization: Bearer vc2_... (API key) — resolves to the owning user,
//     loads roles from the user record, bypasses CSRF;
//   - Authorization: Bearer vca_... (agent key) — resolves to the owning user
//     too, but additionally carries the key's scope so downstream layers can
//     narrow authority below the owner's;
//   - access_token cookie (JWT) — existing behavior, delegated to JWTAuth.
//
// Programmatic auth fails closed: a malformed `vc2_`/`vca_` token or a
// disabled/missing key returns 401 immediately without falling back to cookie
// auth. This avoids the "I sent the wrong key and got logged in as my browser
// session" foot-gun.
func AuthN(
	provider auth.IAuthProvider,
	apiKeys repository.IAPIKeyRepository,
	agentKeys repository.IAgentKeyRepository,
	users repository.IUserRepository,
	c cache.Cache,
) gin.HandlerFunc {
	jwtNext := JWTAuth(provider)

	return func(ctx *gin.Context) {
		header := ctx.GetHeader("Authorization")
		if strings.HasPrefix(header, "Bearer ") {
			raw := strings.TrimPrefix(header, "Bearer ")
			if strings.HasPrefix(raw, auth.APIKeyPrefix) {
				authenticateAPIKey(ctx, raw, apiKeys, users, c)
				return
			}
			if strings.HasPrefix(raw, auth.AgentKeyPrefix) {
				authenticateAgentKey(ctx, raw, agentKeys, users, c)
				return
			}
		}
		jwtNext(ctx)
	}
}

func authenticateAPIKey(
	ctx *gin.Context,
	raw string,
	apiKeys repository.IAPIKeyRepository,
	users repository.IUserRepository,
	c cache.Cache,
) {
	log := logger.From(ctx.Request.Context())

	keyID, secretHash, ok := auth.ParseAPIKey(raw)
	if !ok {
		ctx.AbortWithStatusJSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}

	key, err := apiKeys.FindByKeyID(ctx.Request.Context(), keyID)
	if err != nil {
		ctx.AbortWithStatusJSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}

	// Constant-time hash compare — both sides are hex strings of identical
	// length, so a length mismatch here means a corrupted DB row, not a
	// timing oracle. Treat it as a 401 either way.
	if subtle.ConstantTimeCompare([]byte(key.SecretHash), []byte(secretHash)) != 1 {
		ctx.AbortWithStatusJSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}
	if !key.Enabled {
		ctx.AbortWithStatusJSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}

	// Resolve current user state. We always re-read so role changes /
	// deactivations take effect on the next request — no per-key role
	// snapshot, no separate revocation path.
	user, err := users.FindByID(ctx.Request.Context(), key.UserID)
	if err != nil {
		ctx.AbortWithStatusJSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}
	if !user.Active {
		ctx.AbortWithStatusJSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}

	ctx.Set("userID", user.UserID.String())
	ctx.Set("username", user.Username)
	ctx.Set("roles", user.Roles)
	// No session_id — API key auth is sessionless. Resolvers that key off
	// AuthInfo.CurrentSessionID (e.g. isCurrent on Session) will see "".
	ctx.Set(APIKeyAuthFlag, true)

	// Fire-and-forget last_used_at touch, debounced per key_id so a chatty
	// script doesn't write-amplify the api_keys collection. Failures here
	// are non-fatal and logged at debug only.
	go touchLastUsed(c, apiKeys, "apikey", keyID, log)

	ctx.Next()
}

// authenticateAgentKey mirrors authenticateAPIKey and then attaches the key's
// scope to the request. The identity resolved is the OWNER's — the agent is a
// delegate, not an account — so roles, active state and (downstream) operation
// membership are all the owner's, re-read per request. What the agent key adds
// is a ceiling on that authority, never an addition to it.
func authenticateAgentKey(
	ctx *gin.Context,
	raw string,
	agentKeys repository.IAgentKeyRepository,
	users repository.IUserRepository,
	c cache.Cache,
) {
	log := logger.From(ctx.Request.Context())

	keyID, secretHash, ok := auth.ParseKey(auth.AgentKeyPrefix, raw)
	if !ok {
		ctx.AbortWithStatusJSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}

	// One cache read stands in for the two Mongo reads below on every MCP
	// call. The secret is still compared on every request — the cache holds
	// the hash, not a decision — so a wrong token is refused whether or not
	// the key is cached.
	entry, cached := readAgentAuthCache(ctx.Request.Context(), c, keyID)
	if !cached {
		key, err := agentKeys.FindByKeyID(ctx.Request.Context(), keyID)
		if err != nil {
			ctx.AbortWithStatusJSON(http.StatusUnauthorized, responses.ErrUnauthorized)
			return
		}
		user, err := users.FindByID(ctx.Request.Context(), key.UserID)
		if err != nil {
			ctx.AbortWithStatusJSON(http.StatusUnauthorized, responses.ErrUnauthorized)
			return
		}
		entry = repository.NewAgentAuthEntry(key, user)
		writeAgentAuthCache(ctx.Request.Context(), c, keyID, entry)
	}
	key, user := entry.Key, entry.User

	if subtle.ConstantTimeCompare([]byte(key.SecretHash), []byte(secretHash)) != 1 {
		ctx.AbortWithStatusJSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}
	if !key.Enabled {
		ctx.AbortWithStatusJSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}
	if !user.Active {
		ctx.AbortWithStatusJSON(http.StatusUnauthorized, responses.ErrUnauthorized)
		return
	}

	ctx.Set("userID", user.UserID.String())
	ctx.Set("username", user.Username)
	ctx.Set("roles", user.Roles)
	ctx.Set(AgentAuthFlag, true)
	ctx.Set(AgentInfoKey, &key)

	go touchLastUsed(c, agentKeys, "agentkey", keyID, log)

	ctx.Next()
}

// readAgentAuthCache returns the cached (key, owner) pair for a key id.
func readAgentAuthCache(ctx context.Context, c cache.Cache, keyID string) (repository.AgentAuthEntry, bool) {
	var entry repository.AgentAuthEntry
	if c == nil || !c.IsEnabled() {
		return entry, false
	}
	raw, err := c.Get(ctx, repository.AgentAuthCacheKey(keyID))
	if err != nil || raw == "" {
		return entry, false
	}
	if err := json.Unmarshal([]byte(raw), &entry); err != nil {
		return entry, false
	}
	entry.Restore()
	return entry, true
}

// writeAgentAuthCache stores the pair. Best-effort: a miss costs two reads.
func writeAgentAuthCache(ctx context.Context, c cache.Cache, keyID string, entry repository.AgentAuthEntry) {
	if c == nil || !c.IsEnabled() {
		return
	}
	encoded, err := json.Marshal(entry)
	if err != nil {
		return
	}
	_ = c.Set(ctx, repository.AgentAuthCacheKey(keyID), string(encoded), agentAuthCacheTTL)
}

// lastUsedToucher is the one method both key repositories share. Declared here,
// where it is consumed, rather than in package repository.
type lastUsedToucher interface {
	TouchLastUsed(ctx context.Context, keyID string, at time.Time) error
}

func touchLastUsed(c cache.Cache, keys lastUsedToucher, kind, keyID string, log *zap.Logger) {
	// Detach from request lifetime — touch must outlive the response write.
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	debounceKey := kind + ":touched:" + keyID
	if c != nil && c.IsEnabled() {
		// SETNX: only the request that wins the race writes. Get-then-Set let
		// a burst of concurrent requests all observe an empty key and each
		// issue a write.
		fresh, err := c.SetNX(ctx, debounceKey, "1", touchDebounceTTL)
		if err == nil && !fresh {
			return
		}
	}

	if err := keys.TouchLastUsed(ctx, keyID, time.Now().UTC()); err != nil {
		log.Debug("failed to touch last_used_at", zap.String("kind", kind), zap.Error(err))
	}
}

// HasAPIKeyAuth returns true if the request was authenticated via an API key.
// Used by CSRF and any other check that should branch on the auth surface.
func HasAPIKeyAuth(ctx *gin.Context) bool {
	return ctx.GetBool(APIKeyAuthFlag)
}

// HasAgentAuth returns true if the request was authenticated via an agent key.
func HasAgentAuth(ctx *gin.Context) bool {
	return ctx.GetBool(AgentAuthFlag)
}

// HasProgrammaticAuth returns true for any non-browser credential. Used by
// CSRF, which defends a cookie surface that neither key kind has.
func HasProgrammaticAuth(ctx *gin.Context) bool {
	return HasAPIKeyAuth(ctx) || HasAgentAuth(ctx)
}

// AgentKeyFromContext returns the agent key a request authenticated with, or
// nil for every other caller.
func AgentKeyFromContext(ctx *gin.Context) *models.AgentKey {
	key, _ := ctx.Value(AgentInfoKey).(*models.AgentKey)
	return key
}

// RequireHuman aborts requests authenticated with an agent key. It is mounted
// on every protected route except the MCP endpoint, which makes the agent
// blast radius a property of routing rather than something each resolver has
// to remember. An agent that finds its way to /graphql gets 403, not the
// owner's entire API.
func RequireHuman() gin.HandlerFunc {
	return func(c *gin.Context) {
		if HasAgentAuth(c) {
			c.AbortWithStatusJSON(http.StatusForbidden, responses.ErrForbidden)
			return
		}
		c.Next()
	}
}
