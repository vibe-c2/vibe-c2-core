package auth

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strings"
)

// API key format: vc2_<key_id>_<secret>
//
//   - "vc2_"     constant prefix; lets middleware fast-reject anything that
//     isn't an API key without parsing further.
//   - <key_id>   12 hex chars (6 random bytes). Public, indexed in Mongo,
//     used to find the row in O(1).
//   - <secret>   43 chars of URL-safe base64 (32 random bytes). The thing
//     we actually verify against SecretHash with constant-time
//     compare.
//
// The two-segment layout means a stolen key_id alone is useless — the
// attacker still needs the secret tail.
//
// The same layout is reused for agent keys under a sibling prefix — see
// AgentKeyPrefix and GenerateKey/ParseKey below. Only the prefix differs, so
// middleware can tell the two principals apart on the first four bytes while
// the generation and verification logic stays in one place.
const (
	APIKeyPrefix   = "vc2_"
	AgentKeyPrefix = "vca_"
	apiKeyIDLen    = 12 // hex chars; 6 random bytes
	apiKeyIDBytes  = 6
	apiKeySecBytes = 32
)

// GenerateAPIKey mints a new (raw_token, key_id, secret_hash) triple.
// The caller persists key_id + secret_hash and returns raw_token to the
// user exactly once.
func GenerateAPIKey() (raw, keyID, secretHash string, err error) {
	return GenerateKey(APIKeyPrefix)
}

// GenerateKey is GenerateAPIKey parameterized by prefix, so the API-key and
// agent-key namespaces share one implementation. Pass APIKeyPrefix or
// AgentKeyPrefix.
func GenerateKey(prefix string) (raw, keyID, secretHash string, err error) {
	idBytes := make([]byte, apiKeyIDBytes)
	if _, err := rand.Read(idBytes); err != nil {
		return "", "", "", fmt.Errorf("failed to generate key id: %w", err)
	}
	keyID = hex.EncodeToString(idBytes)

	secBytes := make([]byte, apiKeySecBytes)
	if _, err := rand.Read(secBytes); err != nil {
		return "", "", "", fmt.Errorf("failed to generate key secret: %w", err)
	}
	secret := base64.RawURLEncoding.EncodeToString(secBytes)

	raw = prefix + keyID + "_" + secret
	secretHash = HashToken(secret)
	return raw, keyID, secretHash, nil
}

// ParseAPIKey splits a raw API key into (key_id, secret_hash). Returns
// false if the format is malformed. The secret itself is never returned;
// callers only need the hash to compare against storage.
func ParseAPIKey(raw string) (keyID, secretHash string, ok bool) {
	return ParseKey(APIKeyPrefix, raw)
}

// ParseKey is ParseAPIKey parameterized by prefix. A token minted under one
// prefix never parses under another, so an agent key cannot be replayed as an
// API key (or vice versa) even if the row lookup would otherwise succeed.
func ParseKey(prefix, raw string) (keyID, secretHash string, ok bool) {
	if !strings.HasPrefix(raw, prefix) {
		return "", "", false
	}
	rest := raw[len(prefix):]
	sep := strings.IndexByte(rest, '_')
	if sep != apiKeyIDLen {
		return "", "", false
	}
	keyID = rest[:sep]
	secret := rest[sep+1:]
	if len(secret) == 0 {
		return "", "", false
	}
	// key_id must be lowercase hex.
	for i := 0; i < len(keyID); i++ {
		c := keyID[i]
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			return "", "", false
		}
	}
	return keyID, HashToken(secret), true
}
