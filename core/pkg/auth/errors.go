package auth

import "errors"

var (
	ErrTokenExpired        = errors.New("token expired")
	ErrTokenInvalid        = errors.New("token invalid or revoked")
	ErrTokenCorrupted      = errors.New("token data corrupted")
	ErrSessionLimitReached = errors.New("maximum sessions reached")
)
