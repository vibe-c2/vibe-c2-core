package markdown

import (
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestRewriteReferenceLinks(t *testing.T) {
	page, host, hash, unknown := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	resolve := func(kind string, id uuid.UUID) (referenceTarget, bool) {
		switch {
		case kind == "doc" && id == page:
			return referenceTarget{Text: "Peering [edge]", Href: "../002-net/003-peering.md"}, true
		case kind == "host" && id == host:
			return referenceTarget{Text: "in-bgp01"}, true
		case kind == "hash" && id == hash:
			return referenceTarget{Text: "aad3b435b51404ee"}, true
		}
		return referenceTarget{}, false
	}

	body := "Dual [host](vibe://host/" + host.String() + ") edge " +
		"peering [page](vibe://doc/" + page.String() + ") + " +
		"[page](vibe://doc/" + unknown.String() + ") " +
		"hash [hash](vibe://hash/" + hash.String() + ") " +
		"ordinary [link](https://example.com) stays"

	got := rewriteReferenceLinks(body, resolve)
	want := "Dual in-bgp01 edge " +
		`peering [Peering \[edge\]](../002-net/003-peering.md) + ` +
		"page " +
		"hash aad3b435b51404ee " +
		"ordinary [link](https://example.com) stays"
	if got != want {
		t.Fatalf("rewriteReferenceLinks\n got: %s\nwant: %s", got, want)
	}
	if strings.Contains(got, "vibe://") {
		t.Fatal("vibe:// scheme leaked into foreign markdown")
	}
}

func TestRewriteReferenceLinks_EmptyTextFallsBackToLabel(t *testing.T) {
	id := uuid.New()
	resolve := func(string, uuid.UUID) (referenceTarget, bool) { return referenceTarget{Text: ""}, true }
	got := rewriteReferenceLinks("see [host](vibe://host/"+id.String()+")", resolve)
	if got != "see host" {
		t.Fatalf("got %q", got)
	}
}

// Chips serialized before the rename must still be resolved on export,
// otherwise a raw scheme leaks into an archive meant for foreign tools.
func TestRewriteReferenceLinks_AcceptsBothSchemes(t *testing.T) {
	host := uuid.New()
	resolve := func(kind string, id uuid.UUID) (referenceTarget, bool) {
		if kind == "host" && id == host {
			return referenceTarget{Text: "in-bgp01"}, true
		}
		return referenceTarget{}, false
	}
	for _, scheme := range []string{"logos://", "vibe://"} {
		got := rewriteReferenceLinks("on [host]("+scheme+"host/"+host.String()+")", resolve)
		if got != "on in-bgp01" {
			t.Fatalf("%s: got %q, want %q", scheme, got, "on in-bgp01")
		}
	}
}
