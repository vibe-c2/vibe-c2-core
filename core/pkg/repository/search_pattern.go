package repository

import (
	"regexp"
	"strings"
	"unicode"
)

// searchPattern converts a raw user search string into a MongoDB $regex
// pattern. Shared by every repository that implements text search so the
// query language is identical across credentials, hosts, users and hashes.
//
// Default semantics: case-insensitive substring. The input is escaped with
// regexp.QuoteMeta, so operators can paste values containing regex
// metacharacters ("10.1.142.1", "DOMAIN\user") and have them matched
// literally.
//
// Wrapping the query in double quotes opts into whole-token matching: the
// quotes are stripped and the pattern is anchored with \b word boundaries.
// "10.1.142.1" then matches 10.1.142.1 (also embedded in longer text, e.g. a
// comment) but not 10.1.142.13 or 110.1.142.1, and "admin" matches admin but
// not admin2. A \b is only attached next to a word character — against a
// non-word edge (e.g. a term ending in ".") the anchor would invert its
// meaning, so that side falls back to unanchored.
func searchPattern(search string) string {
	if term, ok := cutQuotes(search); ok {
		return wordBounded(term)
	}
	return regexp.QuoteMeta(search)
}

// cutQuotes strips one pair of surrounding double quotes. A lone quote,
// unbalanced quotes, or an empty `""` are not treated as the exact-match
// syntax and fall back to literal substring search.
func cutQuotes(s string) (string, bool) {
	if len(s) < 3 || !strings.HasPrefix(s, `"`) || !strings.HasSuffix(s, `"`) {
		return "", false
	}
	return s[1 : len(s)-1], true
}

func wordBounded(term string) string {
	runes := []rune(term)
	pattern := regexp.QuoteMeta(term)
	if isWordRune(runes[0]) {
		pattern = `\b` + pattern
	}
	if isWordRune(runes[len(runes)-1]) {
		pattern += `\b`
	}
	return pattern
}

// isWordRune mirrors the regex \w class (PCRE with default flags): letters,
// digits and underscore.
func isWordRune(r rune) bool {
	return r == '_' || unicode.IsLetter(r) || unicode.IsDigit(r)
}
