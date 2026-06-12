package repository

import (
	"regexp"
	"testing"
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
