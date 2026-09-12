package mcp

import (
	"strings"
	"testing"
)

const outlineSample = `Intro text above any heading.

# Recon

Some prose.

## Hosts

| host | os |
| ---- | -- |
| dc-01 | Windows |

## Credentials

Found two.

# Next steps

Do the thing.
`

func TestParseHeadings(t *testing.T) {
	spans := parseHeadings(outlineSample)

	want := []struct {
		title string
		level int
	}{
		{"Recon", 1},
		{"Hosts", 2},
		{"Credentials", 2},
		{"Next steps", 1},
	}
	if len(spans) != len(want) {
		t.Fatalf("got %d headings, want %d: %+v", len(spans), len(want), spans)
	}
	for i, w := range want {
		if spans[i].title != w.title || spans[i].level != w.level {
			t.Errorf("heading %d = %q/%d, want %q/%d", i, spans[i].title, spans[i].level, w.title, w.level)
		}
	}
}

func TestHeadingLevel(t *testing.T) {
	tests := []struct {
		name  string
		line  string
		level int
		title string
	}{
		{"plain", "# Recon", 1, "Recon"},
		{"deep", "###### Six", 6, "Six"},
		{"seven hashes is not a heading", "####### Seven", 0, ""},
		{"no space is a tag, not a heading", "#recon", 0, ""},
		{"closing sequence is dropped", "## Recon ##", 2, "Recon"},
		{"trailing hash without space is kept", "## C#", 2, "C#"},
		{"up to three spaces is still a heading", "   # Indented", 1, "Indented"},
		{"four spaces is a code block", "    # Code", 0, ""},
		{"not a heading", "ordinary text", 0, ""},
		{"empty", "", 0, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			level, title := headingLevel(tt.line)
			if level != tt.level || title != tt.title {
				t.Errorf("headingLevel(%q) = %d/%q, want %d/%q", tt.line, level, title, tt.level, tt.title)
			}
		})
	}
}

// A '#' inside a code fence is a shell comment, not a heading. Getting this
// wrong would slice a page in the middle of a command dump — and command dumps
// are most of what a large recon page contains.
func TestParseHeadingsIgnoresCodeFences(t *testing.T) {
	md := "# Real\n\n```bash\n# not a heading\nls\n```\n\n## Also real\n"
	spans := parseHeadings(md)
	if len(spans) != 2 {
		t.Fatalf("got %d headings, want 2: %+v", len(spans), spans)
	}
	if spans[0].title != "Real" || spans[1].title != "Also real" {
		t.Errorf("got %q and %q", spans[0].title, spans[1].title)
	}
}

func TestParseHeadingsHandlesTildeFences(t *testing.T) {
	md := "# Real\n\n~~~\n# not a heading\n~~~\n"
	if spans := parseHeadings(md); len(spans) != 1 {
		t.Fatalf("got %d headings, want 1: %+v", len(spans), spans)
	}
}

func TestSliceSectionReturnsSubtree(t *testing.T) {
	// "Recon" is level 1, so it must carry its level-2 children with it and
	// stop at the next level-1.
	text, matches := sliceSection(outlineSample, "Recon")
	if matches != 1 {
		t.Fatalf("matches = %d, want 1", matches)
	}
	for _, want := range []string{"# Recon", "## Hosts", "## Credentials", "dc-01"} {
		if !strings.Contains(text, want) {
			t.Errorf("section is missing %q:\n%s", want, text)
		}
	}
	if strings.Contains(text, "Next steps") {
		t.Errorf("section ran past the next level-1 heading:\n%s", text)
	}
	if strings.Contains(text, "Intro text") {
		t.Errorf("section included the preamble:\n%s", text)
	}
}

func TestSliceSectionStopsAtSameLevel(t *testing.T) {
	text, matches := sliceSection(outlineSample, "Hosts")
	if matches != 1 {
		t.Fatalf("matches = %d, want 1", matches)
	}
	if strings.Contains(text, "Credentials") {
		t.Errorf("section ran into its sibling:\n%s", text)
	}
	if !strings.Contains(text, "dc-01") {
		t.Errorf("section lost its body:\n%s", text)
	}
}

func TestSliceSectionLookupIsForgiving(t *testing.T) {
	for _, query := range []string{"Hosts", "hosts", "  HOSTS  ", "## Hosts"} {
		text, matches := sliceSection(outlineSample, query)
		if matches != 1 || !strings.Contains(text, "dc-01") {
			t.Errorf("query %q did not find the section (matches=%d)", query, matches)
		}
	}
}

func TestSliceSectionMissing(t *testing.T) {
	if _, matches := sliceSection(outlineSample, "Nope"); matches != 0 {
		t.Errorf("matches = %d, want 0", matches)
	}
}

func TestSliceSectionCountsDuplicates(t *testing.T) {
	md := "## Notes\n\nfirst\n\n## Notes\n\nsecond\n"
	text, matches := sliceSection(md, "Notes")
	if matches != 2 {
		t.Fatalf("matches = %d, want 2", matches)
	}
	if !strings.Contains(text, "first") || strings.Contains(text, "second") {
		t.Errorf("expected the first section, got:\n%s", text)
	}
}

func TestBuildOutlineSizes(t *testing.T) {
	entries := buildOutline(outlineSample)
	if len(entries) != 4 {
		t.Fatalf("got %d entries, want 4", len(entries))
	}

	byHeading := map[string]outlineEntry{}
	for _, e := range entries {
		byHeading[e.Heading] = e
	}

	// A parent's size includes its children, which is the documented contract
	// and the reason the numbers do not sum to the page length.
	recon := byHeading["Recon"]
	hosts := byHeading["Hosts"]
	if recon.Bytes <= hosts.Bytes {
		t.Errorf("parent (%d bytes) should be larger than its child (%d)", recon.Bytes, hosts.Bytes)
	}
	for _, e := range entries {
		if e.Bytes <= 0 {
			t.Errorf("%q has size %d", e.Heading, e.Bytes)
		}
	}
}

func TestPreambleBytes(t *testing.T) {
	if got := preambleBytes(outlineSample); got == 0 {
		t.Error("preamble above the first heading was reported as empty")
	}
	if got := preambleBytes("# Straight in\n\ntext\n"); got != 0 {
		t.Errorf("preamble = %d, want 0", got)
	}
	// A page with no headings at all is entirely preamble — the case that
	// would otherwise render as an empty outline of an apparently empty page.
	body := "just prose, no headings\n"
	if got := preambleBytes(body); got != len(body) {
		t.Errorf("preamble = %d, want %d", got, len(body))
	}
}

func TestHeadingList(t *testing.T) {
	got := headingList(outlineSample)
	for _, want := range []string{`"Recon"`, `"Hosts"`, `"Credentials"`, `"Next steps"`} {
		if !strings.Contains(got, want) {
			t.Errorf("heading list is missing %s: %s", want, got)
		}
	}
	if headingList("no headings here") != "" {
		t.Error("expected an empty list for a page with no headings")
	}
}
