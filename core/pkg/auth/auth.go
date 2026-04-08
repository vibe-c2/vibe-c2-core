package auth

import (
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
	Issuer = "vibe-c2"
)

// Claims uses RFC 7519 registered claims via jwt.RegisteredClaims and
// OIDC-convention custom claims.
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
//	roles              — user roles for RBAC (snapshot at issue time;
//	                     re-fetched on every refresh, so role changes
//	                     take effect at most one access-TTL later)
//	session_id         — links the JWT to its Redis session entry; used
//	                     by /logout to find the right entry to delete
type Claims struct {
	PreferredUsername string   `json:"preferred_username"`
	Roles             []string `json:"roles"`
	SessionID         string   `json:"session_id,omitempty"`
	jwt.RegisteredClaims
}

// IAuthProvider handles JWT generation and validation. It does NOT manage
// refresh tokens or sessions — that lives in TokenStore (Redis-backed).
// The provider is stateless aside from the configured signing key + TTL.
type IAuthProvider interface {
	GenerateAuthToken(userID, username string, roles []string, sessionID string) (string, error)
	ValidateAuthToken(tokenString string) (*Claims, error)
	AuthTokenTTL() time.Duration
}

type authProvider struct {
	jwtSecret    []byte
	authTokenTTL time.Duration
}

func NewAuthProvider(jwtSecret string, authTokenTTL time.Duration) IAuthProvider {
	return &authProvider{
		jwtSecret:    []byte(jwtSecret),
		authTokenTTL: authTokenTTL,
	}
}

func (ap *authProvider) GenerateAuthToken(userID, username string, roles []string, sessionID string) (string, error) {
	now := time.Now().UTC()

	claims := &Claims{
		PreferredUsername: username,
		Roles:             roles,
		SessionID:         sessionID,
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

func (ap *authProvider) AuthTokenTTL() time.Duration {
	return ap.authTokenTTL
}

// HashPassword returns a bcrypt hash of the password (cost 14).
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 14)
	return string(bytes), err
}

// GenerateRandomKey returns a 32-byte cryptographically random URL-safe
// base64 string (no padding). Used inside refresh tokens.
func GenerateRandomKey() (string, error) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return "", fmt.Errorf("failed to generate random key: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(key), nil
}

// HashToken returns the lowercase hex SHA-256 of a token. Used to derive
// the Redis key from a raw refresh token without storing the raw value
// anywhere durable.
func HashToken(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:])
}

// MintRefreshToken produces a refresh token with the user_id baked into
// the leading segment so /login/refresh can find the right Redis key
// without parsing the access JWT cookie. Format: "<uuid>.<random>". The
// returned hash is the SHA-256 of the *full* string and is what gets
// embedded in the Redis key.
func MintRefreshToken(userID uuid.UUID) (raw, hash string, err error) {
	rnd, err := GenerateRandomKey()
	if err != nil {
		return "", "", err
	}
	raw = userID.String() + "." + rnd
	hash = HashToken(raw)
	return raw, hash, nil
}

// ParseRefreshToken splits a raw refresh token into its (user_id, hash)
// pair. The hash is computed from the full raw value. Returns false if
// the format is malformed or the user_id segment isn't a valid UUID.
func ParseRefreshToken(raw string) (uuid.UUID, string, bool) {
	if len(raw) < 37 || raw[36] != '.' {
		return uuid.Nil, "", false
	}
	uid, err := uuid.Parse(raw[:36])
	if err != nil {
		return uuid.Nil, "", false
	}
	return uid, HashToken(raw), true
}
