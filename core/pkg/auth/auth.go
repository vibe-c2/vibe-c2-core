package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

const (
	Issuer             = "vibe-c2"
	RefreshTokenPrefix = "refresh"
	MaxSessionsPerUser = 10
	TTLRefreshToken    = 7 * 24 * time.Hour
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
//	roles              — user roles for RBAC
type Claims struct {
	PreferredUsername string   `json:"preferred_username"`
	Roles            []string `json:"roles"`
	jwt.RegisteredClaims
}

// RefreshTokenMeta is stored alongside the hashed refresh token.
// Contains user metadata to avoid DB lookups on token refresh.
type RefreshTokenMeta struct {
	Username  string   `json:"username"`
	Roles     []string `json:"roles"`
	CreatedAt string   `json:"created_at"`
}

type IAuthProvider interface {
	GenerateAuthToken(userID, username string, roles []string) (string, error)
	ValidateAuthToken(tokenString string) (*Claims, error)
	GenerateRefreshToken(ctx context.Context, userID, username string, roles []string) (string, error)
	ValidateRefreshToken(ctx context.Context, userID, rawToken string) (*RefreshTokenMeta, error)
	RotateRefreshToken(ctx context.Context, userID, oldRawToken string) (accessToken, newRefreshToken string, err error)
	InvalidateRefreshToken(ctx context.Context, userID, rawToken string) error
	InvalidateAllRefreshTokens(ctx context.Context, userID string) error
}

type authProvider struct {
	store       TokenStore
	jwtSecret   []byte
	authTokenTTL time.Duration
}

func NewAuthProvider(store TokenStore, jwtSecret string, authTokenTTL time.Duration) IAuthProvider {
	return &authProvider{
		store:        store,
		jwtSecret:    []byte(jwtSecret),
		authTokenTTL: authTokenTTL,
	}
}

func (ap *authProvider) GenerateAuthToken(userID, username string, roles []string) (string, error) {
	now := time.Now().UTC()

	claims := &Claims{
		PreferredUsername: username,
		Roles:            roles,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID,
			Issuer:    Issuer,
			ExpiresAt: jwt.NewNumericDate(now.Add(ap.authTokenTTL)),
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

func (ap *authProvider) GenerateRefreshToken(ctx context.Context, userID, username string, roles []string) (string, error) {
	// Check max sessions using SCARD (O(1))
	count, err := ap.store.UserSessionCount(ctx, userID)
	if err != nil {
		return "", fmt.Errorf("failed to check existing sessions: %w", err)
	}
	if count >= MaxSessionsPerUser {
		return "", fmt.Errorf("%w: limit is %d", ErrSessionLimitReached, MaxSessionsPerUser)
	}

	// Generate opaque token
	rawToken, err := GenerateRandomKey()
	if err != nil {
		return "", err
	}
	tokenHash := HashToken(rawToken)

	// Build key and metadata
	key := fmt.Sprintf("%s:%s:%s", RefreshTokenPrefix, userID, tokenHash)
	meta := RefreshTokenMeta{
		Username:  username,
		Roles:     roles,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}

	// Store token and add to user index in a single pipeline
	if err := ap.store.StoreWithIndex(ctx, key, meta, userID, TTLRefreshToken); err != nil {
		return "", fmt.Errorf("failed to store refresh token: %w", err)
	}

	return rawToken, nil
}

func (ap *authProvider) ValidateRefreshToken(ctx context.Context, userID, rawToken string) (*RefreshTokenMeta, error) {
	tokenHash := HashToken(rawToken)
	key := fmt.Sprintf("%s:%s:%s", RefreshTokenPrefix, userID, tokenHash)

	meta, err := ap.store.Lookup(ctx, key)
	if err != nil {
		if errors.Is(err, ErrTokenNotFound) {
			return nil, ErrTokenInvalid
		}
		return nil, err
	}

	return meta, nil
}

func (ap *authProvider) RotateRefreshToken(ctx context.Context, userID, oldRawToken string) (string, string, error) {
	// Validate old token
	meta, err := ap.ValidateRefreshToken(ctx, userID, oldRawToken)
	if err != nil {
		// Possible replay attack — invalidate all sessions
		_ = ap.InvalidateAllRefreshTokens(ctx, userID)
		return "", "", ErrTokenInvalid
	}

	// Generate new token pair before deleting old token.
	// This ensures the user keeps their session if generation fails.
	accessToken, err := ap.GenerateAuthToken(userID, meta.Username, meta.Roles)
	if err != nil {
		return "", "", fmt.Errorf("failed to generate access token: %w", err)
	}

	newRefreshToken, err := ap.GenerateRefreshToken(ctx, userID, meta.Username, meta.Roles)
	if err != nil {
		return "", "", fmt.Errorf("failed to generate refresh token: %w", err)
	}

	// Delete old token last — if this fails, the user has two valid
	// refresh tokens temporarily, which is safe (old one expires via TTL).
	if err := ap.InvalidateRefreshToken(ctx, userID, oldRawToken); err != nil {
		return "", "", fmt.Errorf("failed to invalidate old refresh token: %w", err)
	}

	return accessToken, newRefreshToken, nil
}

func (ap *authProvider) InvalidateRefreshToken(ctx context.Context, userID, rawToken string) error {
	tokenHash := HashToken(rawToken)
	key := fmt.Sprintf("%s:%s:%s", RefreshTokenPrefix, userID, tokenHash)

	return ap.store.DeleteAndUnindex(ctx, key, userID)
}

func (ap *authProvider) InvalidateAllRefreshTokens(ctx context.Context, userID string) error {
	return ap.store.DeleteAllUserSessions(ctx, userID)
}

func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 14)
	return string(bytes), err
}

func GenerateRandomKey() (string, error) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return "", fmt.Errorf("failed to generate random key: %w", err)
	}
	return base64.StdEncoding.EncodeToString(key), nil
}

// HashToken creates a SHA-256 hash of a token
func HashToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}
