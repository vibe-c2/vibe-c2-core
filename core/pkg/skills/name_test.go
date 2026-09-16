package skills

import "testing"

func TestNormalizeName(t *testing.T) {
	tests := []struct {
		name    string
		in      string
		want    string
		wantErr bool
	}{
		{name: "already a slug", in: "recon-sweep", want: "recon-sweep"},
		{name: "spaces become dashes", in: "Recon Sweep", want: "recon-sweep"},
		{name: "underscores and dots too", in: "recon_sweep.v2", want: "recon-sweep-v2"},
		{name: "repeated separators collapse", in: "recon   --  sweep", want: "recon-sweep"},
		{name: "leading and trailing separators go", in: "  --recon-sweep--  ", want: "recon-sweep"},
		{name: "unmappable characters are dropped", in: "recon✨sweep", want: "reconsweep"},
		{name: "digits are kept", in: "smb2-relay", want: "smb2-relay"},

		{name: "empty is refused", in: "   ", wantErr: true},
		{name: "one character is refused", in: "x", wantErr: true},
		{name: "punctuation only is refused", in: "!!!", wantErr: true},
		{name: "over the length limit is refused", in: string(make([]byte, 0, 70)) + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", wantErr: true},

		{name: "the built-in name is reserved", in: "vibe-c2", wantErr: true},
		{name: "the built-in name normalizes into reserved", in: "Vibe C2", wantErr: true},
		{name: "the reserved prefix is refused", in: "vibe-c2-recon", wantErr: true},
		{name: "a merely similar name is allowed", in: "vibec2-helper", want: "vibec2-helper"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := NormalizeName(tc.in)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("NormalizeName(%q) = %q, want an error", tc.in, got)
				}
				return
			}
			if err != nil {
				t.Fatalf("NormalizeName(%q) returned %v", tc.in, err)
			}
			if got != tc.want {
				t.Fatalf("NormalizeName(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestIsReserved(t *testing.T) {
	reserved := []string{"vibe-c2", "vibe-c2-anything"}
	for _, name := range reserved {
		if !IsReserved(name) {
			t.Errorf("IsReserved(%q) = false, want true", name)
		}
	}
	free := []string{"vibec2", "vibe", "c2", "my-vibe-c2"}
	for _, name := range free {
		if IsReserved(name) {
			t.Errorf("IsReserved(%q) = true, want false", name)
		}
	}
}

func TestTrimText(t *testing.T) {
	tests := []struct {
		name string
		in   string
		max  int
		want string
	}{
		{name: "short text is untouched", in: "Sweeps a subnet for SMB signing.", max: 100, want: "Sweeps a subnet for SMB signing."},
		{name: "newlines collapse to spaces", in: "line one\nline two\n\nline three", max: 100, want: "line one line two line three"},
		{name: "runs of whitespace collapse", in: "a     b\t\tc", max: 100, want: "a b c"},
		{name: "over the cap is cut with an ellipsis", in: "aaaaaaaaaa", max: 4, want: "aaaa…"},
		{name: "empty stays empty", in: "   ", max: 10, want: ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := TrimText(tc.in, tc.max); got != tc.want {
				t.Fatalf("TrimText(%q, %d) = %q, want %q", tc.in, tc.max, got, tc.want)
			}
		})
	}
}

func TestTrimTextKeepsValidUTF8(t *testing.T) {
	// Cutting mid-rune would produce a replacement character in every UI that
	// renders the result.
	got := TrimText("ααααα", 5)
	for _, r := range got {
		if r == '�' {
			t.Fatalf("TrimText cut mid-rune: %q", got)
		}
	}
}
