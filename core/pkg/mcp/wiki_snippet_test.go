package mcp

import (
	"strings"
	"testing"
	"unicode/utf8"
)

func TestBuildSnippetCentresOnTheMatch(t *testing.T) {
	body := strings.Repeat("padding ", 40) + "KERBEROAST succeeded on dc-01" + strings.Repeat(" trailing", 40)
	got := buildSnippet(body, "kerberoast")

	if !strings.Contains(strings.ToLower(got), "kerberoast") {
		t.Fatalf("snippet lost the match: %q", got)
	}
	if !strings.Contains(got, "dc-01") {
		t.Errorf("snippet lost the context after the match: %q", got)
	}
	if !strings.HasPrefix(got, "…") || !strings.HasSuffix(got, "…") {
		t.Errorf("snippet should be marked as clipped at both ends: %q", got)
	}
}

func TestBuildSnippetCollapsesWhitespace(t *testing.T) {
	body := "| host |\n| ---- |\n| dc-01 |\n"
	got := buildSnippet(body, "dc-01")
	if strings.Contains(got, "\n") {
		t.Errorf("snippet should be one line: %q", got)
	}
}

func TestBuildSnippetFallsBackToTheOpening(t *testing.T) {
	body := "This page is about lateral movement."
	// A title-only match: the term is not in the body at all, but the opening
	// still tells the agent what the page is.
	got := buildSnippet(body, "nonexistent")
	if got != body {
		t.Errorf("got %q, want the opening %q", got, body)
	}
}

func TestBuildSnippetEmptyBody(t *testing.T) {
	if got := buildSnippet("", "anything"); got != "" {
		t.Errorf("got %q, want empty", got)
	}
	if got := buildSnippet("   \n\t ", "anything"); got != "" {
		t.Errorf("whitespace-only body should produce nothing, got %q", got)
	}
}

func TestBuildSnippetNoSearchTerm(t *testing.T) {
	body := strings.Repeat("a", 500)
	got := buildSnippet(body, "")
	if len(got) > snippetMax+len("…") {
		t.Errorf("snippet is %d bytes, over the cap", len(got))
	}
}

// The engagement notes in this deployment are partly in Russian, so a snippet
// that clips mid-rune is not a theoretical concern — it would mangle the first
// and last character of most snippets.
func TestBuildSnippetKeepsValidUTF8(t *testing.T) {
	body := strings.Repeat("данные ", 60) + "пароль найден" + strings.Repeat(" ещё", 60)
	got := buildSnippet(body, "пароль")

	if !utf8.ValidString(got) {
		t.Fatalf("snippet is not valid UTF-8: %q", got)
	}
	if !strings.Contains(got, "пароль") {
		t.Errorf("snippet lost the match: %q", got)
	}
}

func TestBuildSnippetIsCaseInsensitive(t *testing.T) {
	got := buildSnippet("The DOMAIN controller is dc-01.", "domain")
	if !strings.Contains(got, "DOMAIN") {
		t.Errorf("case-insensitive match failed: %q", got)
	}
}

func TestClipRunes(t *testing.T) {
	if got := clipRunes("short", 100); got != "short" {
		t.Errorf("got %q, want the input unchanged", got)
	}
	got := clipRunes(strings.Repeat("é", 50), 11)
	if !utf8.ValidString(got) {
		t.Errorf("clip produced invalid UTF-8: %q", got)
	}
	if !strings.HasSuffix(got, "…") {
		t.Errorf("clipped text should be marked: %q", got)
	}
}
