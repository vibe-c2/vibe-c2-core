package mcp

import (
	"testing"

	"github.com/google/uuid"
)

// A resource URI is a second way into the same data, so its parsing has to be
// exact. A malformed URI that resolved to *some* operation would read past the
// key's scope without any tool being involved.
func TestParseVibeURI(t *testing.T) {
	opID := uuid.New()
	docID := uuid.New().String()

	t.Run("wiki page", func(t *testing.T) {
		gotOp, kind, id, err := parseVibeURI("vibe://op/" + opID.String() + "/wiki/" + docID)
		if err != nil {
			t.Fatalf("parseVibeURI: %v", err)
		}
		if gotOp != opID || kind != "wiki" || id != docID {
			t.Fatalf("got (%s, %s, %s)", gotOp, kind, id)
		}
	})

	t.Run("host", func(t *testing.T) {
		hostID := uuid.New().String()
		gotOp, kind, id, err := parseVibeURI("vibe://op/" + opID.String() + "/host/" + hostID)
		if err != nil {
			t.Fatalf("parseVibeURI: %v", err)
		}
		if gotOp != opID || kind != "host" || id != hostID {
			t.Fatalf("got (%s, %s, %s)", gotOp, kind, id)
		}
	})

	rejects := []struct {
		name string
		uri  string
	}{
		{"another scheme entirely", "https://example.com/op/x/wiki/y"},
		{"unknown kind", "vibe://op/" + opID.String() + "/session/abc"},
		{"missing operation", "vibe://op//wiki/" + docID},
		{"missing id", "vibe://op/" + opID.String() + "/wiki/"},
		{"operation is not a uuid", "vibe://op/not-a-uuid/wiki/" + docID},
		{"empty", ""},
	}
	for _, tc := range rejects {
		t.Run(tc.name, func(t *testing.T) {
			if _, _, _, err := parseVibeURI(tc.uri); err == nil {
				t.Fatalf("accepted a malformed uri: %q", tc.uri)
			}
		})
	}
}
