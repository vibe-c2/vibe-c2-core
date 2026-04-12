package auth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
)

// DeriveGraceKey returns a 32-byte AES-256 key derived from the JWT secret.
// Used exclusively for encrypting the raw refresh token inside grace shadow
// keys in Redis (see redis_token_store.go SaveGrace / LookupGrace).
func DeriveGraceKey(jwtSecret string) []byte {
	h := sha256.Sum256([]byte("refresh-grace:" + jwtSecret))
	return h[:]
}

// EncryptGrace encrypts plaintext with AES-256-GCM and returns base64.
func EncryptGrace(key, plaintext []byte) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("grace encrypt: new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("grace encrypt: new gcm: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("grace encrypt: nonce: %w", err)
	}
	ciphertext := gcm.Seal(nonce, nonce, plaintext, nil)
	return base64.RawURLEncoding.EncodeToString(ciphertext), nil
}

// DecryptGrace decrypts base64 ciphertext produced by EncryptGrace.
func DecryptGrace(key []byte, encoded string) ([]byte, error) {
	data, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("grace decrypt: base64: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("grace decrypt: new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("grace decrypt: new gcm: %w", err)
	}
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return nil, fmt.Errorf("grace decrypt: ciphertext too short")
	}
	plaintext, err := gcm.Open(nil, data[:nonceSize], data[nonceSize:], nil)
	if err != nil {
		return nil, fmt.Errorf("grace decrypt: open: %w", err)
	}
	return plaintext, nil
}
