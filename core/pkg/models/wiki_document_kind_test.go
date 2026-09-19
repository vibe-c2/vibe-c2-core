package models

import (
	"bytes"
	"testing"
)

// Every row written before the kind field existed carries no kind at all, so
// the zero value has to read as prose everywhere. Getting this wrong would
// reclassify the entire existing wiki as drawings.
func TestWikiDocumentKindZeroValueIsDocument(t *testing.T) {
	tests := []struct {
		name      string
		kind      WikiDocumentKind
		want      WikiDocumentKind
		isDrawing bool
	}{
		{"absent (legacy row)", "", WikiDocumentKindDocument, false},
		{"explicit document", WikiDocumentKindDocument, WikiDocumentKindDocument, false},
		{"drawing", WikiDocumentKindDrawing, WikiDocumentKindDrawing, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.kind.Or(); got != tt.want {
				t.Fatalf("Or() = %q, want %q", got, tt.want)
			}
			if got := tt.kind.IsDrawing(); got != tt.isDrawing {
				t.Fatalf("IsDrawing() = %v, want %v", got, tt.isDrawing)
			}
			if !tt.kind.Valid() {
				t.Fatalf("Valid() = false for %q", tt.kind)
			}
		})
	}
}

// The GraphQL field is non-null, so a legacy row with no kind must still
// marshal to a member of the enum rather than an empty string.
func TestWikiDocumentKindMarshalGQL(t *testing.T) {
	tests := []struct {
		kind WikiDocumentKind
		want string
	}{
		{"", `"DOCUMENT"`},
		{WikiDocumentKindDocument, `"DOCUMENT"`},
		{WikiDocumentKindDrawing, `"DRAWING"`},
	}
	for _, tt := range tests {
		t.Run(string(tt.kind), func(t *testing.T) {
			var buf bytes.Buffer
			tt.kind.MarshalGQL(&buf)
			if buf.String() != tt.want {
				t.Fatalf("MarshalGQL = %s, want %s", buf.String(), tt.want)
			}
		})
	}
}

func TestWikiDocumentKindUnmarshalGQL(t *testing.T) {
	tests := []struct {
		name    string
		input   interface{}
		want    WikiDocumentKind
		wantErr bool
	}{
		{"DOCUMENT", "DOCUMENT", WikiDocumentKindDocument, false},
		{"DRAWING", "DRAWING", WikiDocumentKindDrawing, false},
		{"lowercase is accepted", "drawing", WikiDocumentKindDrawing, false},
		{"unknown member", "SPREADSHEET", "", true},
		{"not a string", 7, "", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got WikiDocumentKind
			err := got.UnmarshalGQL(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected an error for %v", tt.input)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tt.want {
				t.Fatalf("got %q, want %q", got, tt.want)
			}
		})
	}
}
