package resolver

import (
	"context"
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

func TestExcerptOf(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name  string
		text  string
		title string
		max   int
		want  string
	}{
		{"empty body", "", "", 100, ""},
		{"whitespace only", " \n\t ", "", 100, ""},
		{"zero budget", "hello", "", 0, ""},
		{"short text untouched", "Host dc-01 is the domain controller.", "", 100, "Host dc-01 is the domain controller."},
		{
			"blocks collapse to one line",
			"Summary\n\nThe target   runs  Windows.\n\tPatched last week.",
			"", 100,
			"Summary The target runs Windows. Patched last week.",
		},
		{
			"cut lands on a word boundary",
			"The quick brown fox jumps over the lazy dog and keeps running",
			"", 20,
			"The quick brown fox…",
		},
		{
			"trailing punctuation before the cut is dropped",
			"First sentence, second sentence, third sentence here",
			"", 33,
			"First sentence, second sentence…",
		},
		{
			"one long token is hard cut rather than emptied",
			strings.Repeat("a", 50) + " tail",
			"", 20,
			strings.Repeat("a", 19) + "…",
		},
		{
			"multibyte runes are not split",
			strings.Repeat("ж", 30),
			"", 10,
			strings.Repeat("ж", 9) + "…",
		},
		{"budget of one is just the ellipsis", "hello world", "", 1, "…"},
		{
			"inline mark pseudo-tags are stripped",
			"<bold>Contents:</bold> Recon <italic>and</italic> <link href=\"x\">loot</link>; a < b",
			"", 100,
			"Contents: Recon and loot; a < b",
		},
		{
			"leading title heading is dropped",
			"Linux Host Recon\nWorking notes. Method lives here.",
			"Linux Host Recon", 100,
			"Working notes. Method lives here.",
		},
		{
			"title that is only a prefix of the first word stays",
			"Linux Host Reconnaissance is the topic",
			"Linux Host Recon", 100,
			"Linux Host Reconnaissance is the topic",
		},
		{
			"body that is only the title becomes empty",
			"Linux Host Recon",
			"linux host recon", 100,
			"",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			got := excerptOf(tc.text, tc.title, tc.max)
			if got != tc.want {
				t.Fatalf("excerptOf(%q, %q, %d) = %q, want %q", tc.text, tc.title, tc.max, got, tc.want)
			}
			if n := utf8.RuneCountInString(got); tc.max > 0 && n > tc.max {
				t.Fatalf("excerpt is %d runes, over the limit of %d", n, tc.max)
			}
		})
	}
}

func TestWikiDocumentExcerptLimits(t *testing.T) {
	t.Parallel()

	r := &wikiDocumentResolver{}
	body := strings.Repeat("word ", 400) // 2000 chars

	got, err := r.WikiDocumentExcerpt(context.Background(), &models.WikiDocument{Content: body}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if n := utf8.RuneCountInString(got); n > defaultExcerptRunes || n < defaultExcerptRunes/2 {
		t.Fatalf("default excerpt is %d runes, want close to %d", n, defaultExcerptRunes)
	}

	huge := 5000
	got, err = r.WikiDocumentExcerpt(context.Background(), &models.WikiDocument{Content: body}, &huge)
	if err != nil {
		t.Fatal(err)
	}
	if n := utf8.RuneCountInString(got); n > maxExcerptRunes {
		t.Fatalf("excerpt with an oversized request is %d runes, cap is %d", n, maxExcerptRunes)
	}

	negative := -5
	got, err = r.WikiDocumentExcerpt(context.Background(), &models.WikiDocument{Content: "short"}, &negative)
	if err != nil || got != "short" {
		t.Fatalf("negative limit should fall back to the default: got %q, %v", got, err)
	}
}
