package middleware

import (
	"context"
	"crypto/subtle"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/cache"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/logger"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/responses"
	"go.uber.org/zap"
)

// APIKeyAuthFlag is the gin.Context key set by AuthN when a request was
// authenticated via API key (rather than the JWT cookie). The CSRF middleware
// consults this to skip CSRF enforcement — API key callers are scripts, not
// browsers, so there's no cookie surface to defend.
const APIKeyAuthFlag = "apiKeyAuth"

// touchDebounceTTL caps last_used_at write frequency to once per minute per
// key. Cache key is per-key_id; a SET-with-TTL returning "already exists"
// suppresses the write.
const touchDebounceTTL = 60 * time.Second

// AuthN returns middleware that authenticates the request via either:
//
//   - Authorization: Bearer vc2_... (API key) — resolves to the owning user,
//     loads roles from the user record, bypasses CSRF;
//   - access_token cookie (JWT) — existing behavior, delegated to JWTAuth.
//
// API key auth fails closed: a malformed `vc2_` token or a disabled/missing
// key returns 401 immediately without falling back to cookie auth. This
// avoids the "I sent the wrong key and got logged in as my browser session"
// foot-gun.
func AuthN(
	provider auth.IAuthProvider,
	apiKeys repository.IAPIKeyRepository,
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
	go touchLastUsed(c, apiKeys, keyID, log)

	ctx.Next()
}

func touchLastUsed(c cache.Cache, apiKeys repository.IAPIKeyRepository, keyID string, log *zap.Logger) {
	// Detach from request lifetime — touch must outlive the response write.
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	debounceKey := "apikey:touched:" + keyID
	if c != nil && c.IsEnabled() {
		// If the debounce flag exists, skip this touch. The cache.Set wrapper
		// doesn't expose SETNX directly; we use Get-then-Set which is
		// good-enough — over-touching by a few writes/min under racey hot
		// reloads is harmless.
		if existing, _ := c.Get(ctx, debounceKey); existing != "" {
			return
		}
		_ = c.Set(ctx, debounceKey, "1", touchDebounceTTL)
	}

	if err := apiKeys.TouchLastUsed(ctx, keyID, time.Now().UTC()); err != nil {
		log.Debug("api key: failed to touch last_used_at", zap.Error(err))
	}
}

// HasAPIKeyAuth returns true if the request was authenticated via an API key.
// Used by CSRF and any other check that should branch on the auth surface.
func HasAPIKeyAuth(ctx *gin.Context) bool {
	return ctx.GetBool(APIKeyAuthFlag)
}
