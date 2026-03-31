package auth

import "errors"

var (
	ErrTokenExpired   = errors.New("token expired")
	ErrTokenInvalid   = errors.New("token invalid or revoked")
	ErrTokenNotFound  = errors.New("token not found")
	ErrTokenCorrupted = errors.New("token data corrupted")
	ErrRotationFailed = errors.New("token rotation failed")
)
