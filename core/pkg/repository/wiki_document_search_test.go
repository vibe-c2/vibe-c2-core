package repository

import "testing"

// TestBuildTextSearchPhrase_QuotesAndStripsEmbeddedQuotes proves the $text
// branch can never be tricked into OR-splitting on punctuation or applying
// stray `-` as a negation. Before this guard a query like the one below
// returned arbitrary unrelated documents because $text tokenized the
// punctuation into many short terms (e.g. `4`, `YES`, `d`) and OR'd them.
func TestBuildTextSearchPhrase_QuotesAndStripsEmbeddedQuotes(t *testing.T) {
	cases := []struct {
		name    string
		query   string
		want    string
		wantOK  bool
	}{
		{
			name:   "plain word phrase-quoted",
			query:  "hello",
			want:   `"hello"`,
			wantOK: true,
		},
		{
			name:   "multi-word phrase-quoted",
			query:  "search index",
			want:   `"search index"`,
			wantOK: true,
		},
		{
			name:   "leading hyphen no longer negates",
			query:  "-foo",
			want:   `"-foo"`,
			wantOK: true,
		},
		{
			name:   "embedded quotes stripped to keep phrase well-formed",
			query:  `say "hi" now`,
			want:   `"say hi now"`,
			wantOK: true,
		},
		{
			name:   "noisy punctuation kept inside phrase",
			query:  `U-DCuf+kxjESV7%YES&FRx5%4+daZzH%!WwRetFrHPg^)3X[d`,
			want:   `"U-DCuf+kxjESV7%YES&FRx5%4+daZzH%!WwRetFrHPg^)3X[d"`,
			wantOK: true,
		},
		{
			name:   "empty string skips text branch",
			query:  "",
			want:   "",
			wantOK: false,
		},
		{
			name:   "whitespace only skips text branch",
			query:  "   \t  ",
			want:   "",
			wantOK: false,
		},
		{
			name:   "only quotes skips text branch",
			query:  `"""`,
			want:   "",
			wantOK: false,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := buildTextSearchPhrase(tc.query)
			if ok != tc.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tc.wantOK)
			}
			if got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}
