package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/cache"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

const (
	Issuer             = "vibe-c2"
	RefreshTokenPrefix = "refresh"
	MaxSessionsPerUser = 10
)

// Claims uses RFC 7519 registered claims via jwt.RegisteredClaims
// and OIDC-convention custom claims.
//
// Registered (from jwt.RegisteredClaims):
//
//	sub — user ID (Subject)
//	iss — "vibe-c2" (Issuer)
//	exp — expiration (ExpiresAt)
//	iat — issued at (IssuedAt)
//	jti — unique token ID (ID)
//
// Custom:
//
//	preferred_username — OIDC convention for display username
//	role               — user role for RBAC
type Claims struct {
	PreferredUsername string `json:"preferred_username"`
	Role             string `json:"role"`
	jwt.RegisteredClaims
}

// RefreshTokenMeta is stored in Redis alongside the hashed refresh token.
// Contains user metadata to avoid DB lookups on token refresh.
type RefreshTokenMeta struct {
	Username  string `json:"username"`
	Role      string `json:"role"`
	CreatedAt string `json:"created_at"`
}

type IAuthProvider interface {
	GenerateAuthToken(userID, username, role string) (string, error)
	ValidateAuthToken(tokenString string) (*Claims, error)
	GenerateRefreshToken(ctx context.Context, userID, username, role string) (string, error)
	ValidateRefreshToken(ctx context.Context, userID, rawToken string) (*RefreshTokenMeta, error)
	RotateRefreshToken(ctx context.Context, userID, oldRawToken string) (accessToken, newRefreshToken string, err error)
	InvalidateRefreshToken(ctx context.Context, userID, rawToken string) error
	InvalidateAllRefreshTokens(ctx context.Context, userID string) error
}

type authProvider struct {
	cache     cache.Cache
	jwtSecret []byte
}

func NewAuthProvider(c cache.Cache, jwtSecret string) IAuthProvider {
	return &authProvider{
		cache:     c,
		jwtSecret: []byte(jwtSecret),
	}
}

func (ap *authProvider) GenerateAuthToken(userID, username, role string) (string, error) {
	now := time.Now().UTC()

	claims := &Claims{
		PreferredUsername: username,
		Role:             role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			Issuer:    Issuer,
			ExpiresAt: jwt.NewNumericDate(now.Add(15 * time.Minute)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        uuid.NewString(),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(ap.jwtSecret)
}

func (ap *authProvider) ValidateAuthToken(tokenString string) (*Claims, error) {
	claims := &Claims{}

	token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return ap.jwtSecret, nil
	}, jwt.WithIssuer(Issuer))

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrTokenExpired
		}
		return nil, fmt.Errorf("%w: %v", ErrTokenInvalid, err)
	}

	if !token.Valid {
		return nil, ErrTokenInvalid
	}

	return claims, nil
}

func (ap *authProvider) GenerateRefreshToken(ctx context.Context, userID, username, role string) (string, error) {
	// Check max sessions
	pattern := fmt.Sprintf("%s:%s:*", RefreshTokenPrefix, userID)
	existingKeys, err := ap.cache.Keys(ctx, pattern)
	if err != nil && !errors.Is(err, cache.ErrCacheDisabled) {
		return "", fmt.Errorf("failed to check existing sessions: %w", err)
	}
	if len(existingKeys) >= MaxSessionsPerUser {
		return "", fmt.Errorf("%w: limit is %d", ErrSessionLimitReached, MaxSessionsPerUser)
	}

	// Generate opaque token
	rawToken := GenerateRandomKey()
	tokenHash := HashToken(rawToken)

	// Build Redis key and value
	key := fmt.Sprintf("%s:%s:%s", RefreshTokenPrefix, userID, tokenHash)
	meta := RefreshTokenMeta{
		Username:  username,
		Role:      role,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	metaJSON, err := json.Marshal(meta)
	if err != nil {
		return "", fmt.Errorf("failed to marshal refresh token metadata: %w", err)
	}

	// Store with tag for per-user invalidation
	tag := fmt.Sprintf("%s:%s", RefreshTokenPrefix, userID)
	err = ap.cache.SetWithTags(ctx, key, string(metaJSON), []string{tag}, cache.TTLRefreshToken)
	if err != nil {
		return "", fmt.Errorf("failed to store refresh token: %w", err)
	}

	return rawToken, nil
}

func (ap *authProvider) ValidateRefreshToken(ctx context.Context, userID, rawToken string) (*RefreshTokenMeta, error) {
	tokenHash := HashToken(rawToken)
	key := fmt.Sprintf("%s:%s:%s", RefreshTokenPrefix, userID, tokenHash)

	data, err := ap.cache.Get(ctx, key)
	if err != nil {
		return nil, ErrTokenInvalid
	}

	var meta RefreshTokenMeta
	if err := json.Unmarshal([]byte(data), &meta); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrTokenCorrupted, err)
	}

	return &meta, nil
}

func (ap *authProvider) RotateRefreshToken(ctx context.Context, userID, oldRawToken string) (string, string, error) {
	// Validate old token
	meta, err := ap.ValidateRefreshToken(ctx, userID, oldRawToken)
	if err != nil {
		// Possible replay attack — invalidate all sessions
		_ = ap.InvalidateAllRefreshTokens(ctx, userID)
		return "", "", ErrTokenInvalid
	}

	// Delete old token
	if err := ap.InvalidateRefreshToken(ctx, userID, oldRawToken); err != nil {
		return "", "", fmt.Errorf("failed to invalidate old refresh token: %w", err)
	}

	// Generate new token pair
	accessToken, err := ap.GenerateAuthToken(userID, meta.Username, meta.Role)
	if err != nil {
		return "", "", fmt.Errorf("failed to generate access token: %w", err)
	}

	newRefreshToken, err := ap.GenerateRefreshToken(ctx, userID, meta.Username, meta.Role)
	if err != nil {
		return "", "", fmt.Errorf("failed to generate refresh token: %w", err)
	}

	return accessToken, newRefreshToken, nil
}

func (ap *authProvider) InvalidateRefreshToken(ctx context.Context, userID, rawToken string) error {
	tokenHash := HashToken(rawToken)
	key := fmt.Sprintf("%s:%s:%s", RefreshTokenPrefix, userID, tokenHash)
	tagKey := fmt.Sprintf("tag:%s:%s", RefreshTokenPrefix, userID)

	if err := ap.cache.Del(ctx, key); err != nil {
		return err
	}
	return ap.cache.SRem(ctx, tagKey, key)
}

func (ap *authProvider) InvalidateAllRefreshTokens(ctx context.Context, userID string) error {
	return ap.cache.InvalidateCache(ctx, RefreshTokenPrefix, userID)
}

func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 14)
	return string(bytes), err
}

func GenerateRandomKey() string {
	key := make([]byte, 32)
	_, err := rand.Read(key)
	if err != nil {
		panic("Failed to generate random key: " + err.Error())
	}
	return base64.StdEncoding.EncodeToString(key)
}

// HashToken creates a SHA-256 hash of a token
func HashToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}
