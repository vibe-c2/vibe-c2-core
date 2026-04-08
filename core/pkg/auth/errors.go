package auth

import "errors"

var (
	// ErrTokenExpired is returned by ValidateAuthToken when the JWT's exp
	// has passed but signature/issuer are otherwise valid.
	ErrTokenExpired = errors.New("token expired")

	// ErrTokenInvalid is returned for any other JWT failure (bad signature,
	// wrong issuer, malformed) and by the token store when a refresh token
	// hash is not present in Redis (replay or loser-of-race).
	ErrTokenInvalid = errors.New("token invalid or revoked")

	// ErrTokenCorrupted is returned when a stored session meta is present
	// but cannot be decoded (Redis value tampering or schema drift).
	ErrTokenCorrupted = errors.New("token data corrupted")
)
