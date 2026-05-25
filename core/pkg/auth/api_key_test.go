package auth

import (
	"strings"
	"testing"
)

// TestGenerateAPIKey_FormatAndUniqueness verifies the minted token has the
// expected prefix + layout, and that two consecutive mints don't collide
// (sanity-check against a stuck RNG).
func TestGenerateAPIKey_FormatAndUniqueness(t *testing.T) {
	raw1, keyID1, hash1, err := GenerateAPIKey()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if !strings.HasPrefix(raw1, APIKeyPrefix) {
		t.Fatalf("missing prefix: %q", raw1)
	}
	// Layout: vc2_<12 hex>_<43 char base64>. base64.RawURLEncoding may
	// emit '_' characters in the secret, so split on the FIRST underscore
	// only — that's how the parser finds the boundary, too.
	parts := strings.SplitN(strings.TrimPrefix(raw1, APIKeyPrefix), "_", 2)
	if len(parts) != 2 {
		t.Fatalf("expected 2 segments after prefix, got %d: %q", len(parts), raw1)
	}
	if len(parts[0]) != apiKeyIDLen {
		t.Fatalf("key_id length = %d, want %d", len(parts[0]), apiKeyIDLen)
	}
	if parts[0] != keyID1 {
		t.Fatalf("key_id mismatch: token has %q, returned %q", parts[0], keyID1)
	}
	if hash1 == "" {
		t.Fatalf("secret hash empty")
	}

	raw2, keyID2, hash2, err := GenerateAPIKey()
	if err != nil {
		t.Fatalf("generate 2: %v", err)
	}
	if raw1 == raw2 || keyID1 == keyID2 || hash1 == hash2 {
		t.Fatalf("two mints produced identical material — RNG suspect")
	}
}

// TestParseAPIKey_RoundTrip confirms ParseAPIKey reverses GenerateAPIKey.
func TestParseAPIKey_RoundTrip(t *testing.T) {
	raw, keyID, hash, err := GenerateAPIKey()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	gotID, gotHash, ok := ParseAPIKey(raw)
	if !ok {
		t.Fatalf("ParseAPIKey rejected freshly-minted token: %q", raw)
	}
	if gotID != keyID {
		t.Fatalf("key_id mismatch: got %q want %q", gotID, keyID)
	}
	if gotHash != hash {
		t.Fatalf("hash mismatch: parser recomputed wrong digest")
	}
}

// TestParseAPIKey_Rejections covers the malformed cases the middleware
// relies on: wrong prefix, bad separator position, non-hex key_id,
// missing secret tail, etc.
func TestParseAPIKey_Rejections(t *testing.T) {
	cases := []struct {
		name string
		in   string
	}{
		{"empty", ""},
		{"no prefix", "abc_def_ghi"},
		{"prefix only", "vc2_"},
		{"key_id too short", "vc2_abc_secret"},
		{"key_id too long", "vc2_0123456789abc0_secret"},
		{"missing secret", "vc2_0123456789ab_"},
		{"non-hex key_id", "vc2_zzzzzzzzzzzz_secret"},
		{"uppercase hex rejected", "vc2_ABCDEF012345_secret"},
		{"no separator", "vc2_0123456789abXXX"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, _, ok := ParseAPIKey(tc.in); ok {
				t.Fatalf("expected rejection for %q", tc.in)
			}
		})
	}
}

// TestParseAPIKey_HashStable confirms ParseAPIKey always produces the same
// hash for the same input — required for the constant-time compare in the
// middleware to be meaningful.
func TestParseAPIKey_HashStable(t *testing.T) {
	raw, _, hash, err := GenerateAPIKey()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	for i := 0; i < 5; i++ {
		_, gotHash, ok := ParseAPIKey(raw)
		if !ok {
			t.Fatalf("parse %d: not ok", i)
		}
		if gotHash != hash {
			t.Fatalf("parse %d produced different hash: %q vs %q", i, gotHash, hash)
		}
	}
}
