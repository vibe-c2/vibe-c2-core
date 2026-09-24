package repository

import (
	"regexp"
	"testing"

	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/bson"
)

func TestSearchPattern(t *testing.T) {
	tests := []struct {
		name   string
		search string
		want   string
	}{
		{
			name:   "plain term is escaped substring",
			search: "10.1.142.1",
			want:   `10\.1\.142\.1`,
		},
		{
			name:   "quoted term gets word boundaries",
			search: `"10.1.142.1"`,
			want:   `\b10\.1\.142\.1\b`,
		},
		{
			name:   "quoted username",
			search: `"admin"`,
			want:   `\badmin\b`,
		},
		{
			name:   "quoted term ending in non-word char anchors only the front",
			search: `"10.1.142."`,
			want:   `\b10\.1\.142\.`,
		},
		{
			name:   "quoted term starting with non-word char anchors only the back",
			search: `".142.1"`,
			want:   `\.142\.1\b`,
		},
		{
			name:   "lone quote is literal",
			search: `"`,
			want:   `"`,
		},
		{
			name:   "empty quotes are literal",
			search: `""`,
			want:   `""`,
		},
		{
			name:   "unbalanced leading quote is literal",
			search: `"admin`,
			want:   `"admin`,
		},
		{
			name:   "inner quotes are not exact-match syntax",
			search: `say "hi"`,
			want:   `say "hi"`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := searchPattern(tt.search); got != tt.want {
				t.Errorf("searchPattern(%q) = %q, want %q", tt.search, got, tt.want)
			}
		})
	}
}

// TestSearchPatternMatching exercises the production complaint end to end at
// the regex level: a quoted full IP must stop matching longer IPs that share
// the prefix, while the unquoted query keeps today's substring behavior.
// MongoDB's PCRE \b semantics for these patterns (digits/dots only) are
// identical to Go's regexp, so compiling with Go's engine is a faithful check.
func TestSearchPatternMatching(t *testing.T) {
	tests := []struct {
		name    string
		search  string
		value   string
		matches bool
	}{
		{"unquoted IP matches longer IP (legacy behavior)", "10.1.142.1", "10.1.142.13", true},
		{"quoted IP matches itself", `"10.1.142.1"`, "10.1.142.1", true},
		{"quoted IP rejects longer IP", `"10.1.142.1"`, "10.1.142.13", false},
		{"quoted IP rejects prefixed IP", `"10.1.142.1"`, "110.1.142.1", false},
		{"quoted IP matches embedded in text", `"10.1.142.1"`, "rdp to 10.1.142.1, then pivot", true},
		{"quoted IP matches CIDR-suffixed address", `"10.1.142.1"`, "10.1.142.1/24", true},
		// "." is a non-word char, so \b lands after "142" — quoting a subnet
		// prefix still finds every address under it, only digit-extension is
		// rejected ("10.1.1420").
		{"quoted partial octet still matches at dot boundary", `"10.1.142"`, "10.1.142.13", true},
		{"quoted partial octet rejects digit extension", `"10.1.142"`, "10.1.1420", false},
		{"quoted username rejects suffixed username", `"admin"`, "admin2", false},
		{"quoted username matches domain-qualified", `"admin"`, `CORP\admin`, true},
		{"unquoted username keeps substring behavior", "admin", "admin2", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rx := regexp.MustCompile("(?i)" + searchPattern(tt.search))
			if got := rx.MatchString(tt.value); got != tt.matches {
				t.Errorf("search %q against %q: matched = %v, want %v",
					tt.search, tt.value, got, tt.matches)
			}
		})
	}
}

func TestSearchPrefixPattern(t *testing.T) {
	tests := []struct {
		name   string
		search string
		want   string
	}{
		{
			name:   "plain term is an escaped prefix",
			search: "10.1.142",
			want:   `^10\.1\.142`,
		},
		{
			name:   "quoted term anchors the front and the token end",
			search: `"admin"`,
			want:   `^admin\b`,
		},
		{
			name:   "quoted term ending in a non-word char leaves the back open",
			search: `"10.1.142."`,
			want:   `^10\.1\.142\.`,
		},
		{
			name:   "lone quote is literal, not the exact-match syntax",
			search: `"`,
			want:   `^"`,
		},
		{
			name:   "empty quotes are literal",
			search: `""`,
			want:   `^""`,
		},
		{
			name:   "metacharacters cannot escape the anchor",
			search: "(a+)+",
			want:   `^\(a\+\)\+`,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := searchPrefixPattern(tc.search); got != tc.want {
				t.Errorf("searchPrefixPattern(%q) = %q, want %q", tc.search, got, tc.want)
			}
			// Whatever we build must compile, or the branch 500s at query time.
			if _, err := regexp.Compile(searchPrefixPattern(tc.search)); err != nil {
				t.Errorf("pattern for %q does not compile: %v", tc.search, err)
			}
		})
	}
}

// TestSearchPrefixPatternMatching states the prefix semantics as behaviour:
// anchored at the front, and whole-token at the back only when quoted.
func TestSearchPrefixPatternMatching(t *testing.T) {
	cases := []struct {
		search  string
		subject string
		want    bool
	}{
		// Unquoted: pure prefix.
		{"admin", "admin", true},
		{"admin", "administrator", true},
		{"admin", "admin panel", true},
		{"admin", "the admin", false}, // anchored — must start the title
		// Quoted: prefix AND ends on a token boundary.
		{`"admin"`, "admin", true},
		{`"admin"`, "admin panel", true},
		{`"admin"`, "administrator", false}, // the differentiating case
		{`"admin"`, "the admin", false},
	}

	for _, c := range cases {
		re, err := regexp.Compile(searchPrefixPattern(c.search))
		if err != nil {
			t.Fatalf("compile %q: %v", c.search, err)
		}
		if got := re.MatchString(c.subject); got != c.want {
			t.Errorf("search %q against %q = %v, want %v", c.search, c.subject, got, c.want)
		}
	}
}

// TestQuotedSearchIsUniformAcrossEntities is the regression test for the bug
// this file's helper exists to prevent. Three filters inlined regexp.QuoteMeta
// instead of calling searchPattern, so a quoted query — the documented
// whole-token syntax the frontend offers and credentials/hosts/users/hashes
// honour — was compiled into a regex matching the literal quote characters.
// A search that returned rows on hosts returned nothing at all on tasks,
// operations and wiki documents.
//
// Asserting on every entity together is deliberate: a new list filter that
// reaches for QuoteMeta fails here rather than shipping the same silent hole.
func TestQuotedSearchIsUniformAcrossEntities(t *testing.T) {
	opID := uuid.New()
	const want = `\badmin\b` // what searchPattern produces for `"admin"`

	extract := func(t *testing.T, f bson.M) string {
		t.Helper()
		or, ok := f["$or"].(bson.A)
		if !ok || len(or) == 0 {
			t.Fatalf("filter has no $or clause: %#v", f)
		}
		first, ok := or[0].(bson.M)
		if !ok {
			t.Fatalf("unexpected $or entry: %#v", or[0])
		}
		for _, v := range first {
			rx, ok := v.(bson.M)
			if !ok {
				t.Fatalf("field value is not a regex doc: %#v", v)
			}
			pattern, _ := rx["$regex"].(string)
			return pattern
		}
		t.Fatal("no field in the first $or entry")
		return ""
	}

	filters := map[string]bson.M{
		// Previously correct — the baseline the others must match.
		"host":       buildHostFilter(opID, HostFilter{Search: `"admin"`}),
		"hash":       buildHashFilter(opID, HashFilter{Search: `"admin"`}),
		"credential": buildCredentialFilter(opID, CredentialFilter{Search: `"admin"`}),
		// Previously broken — matched the quote characters literally.
		"task":         buildTaskFilter(opID, TaskFilter{Search: `"admin"`}),
		"operation":    buildOperationSearchFilter(`"admin"`),
		"wikiDocument": buildWikiDocumentFilter(opID, WikiDocumentFilter{Search: `"admin"`}),
	}

	for name, f := range filters {
		t.Run(name, func(t *testing.T) {
			got := extract(t, f)
			if got != want {
				t.Errorf("quoted search on %s produced %q, want %q", name, got, want)
			}
			// The concrete failure the old code caused: no possible subject
			// matched, because the pattern demanded literal quote characters.
			re, err := regexp.Compile(got)
			if err != nil {
				t.Fatalf("pattern %q does not compile: %v", got, err)
			}
			if !re.MatchString("admin") {
				t.Errorf("%s: pattern %q does not match \"admin\" — the original bug", name, got)
			}
			if re.MatchString("administrator") {
				t.Errorf("%s: pattern %q leaked substring semantics", name, got)
			}
		})
	}
}
