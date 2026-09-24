package database

import (
	"errors"
	"strings"
	"testing"

	opts "github.com/qiniu/qmgo/options"
)

func TestIndexSetupErr_NilWhenNothingFailed(t *testing.T) {
	var d QmgoDatabase
	if err := d.IndexSetupErr(); err != nil {
		t.Fatalf("expected nil, got %v", err)
	}
}

func TestIndexSetupErr_JoinsEveryFailure(t *testing.T) {
	var d QmgoDatabase
	first := errors.New("boom")
	d.indexErrs = []*IndexSetupError{
		{Collection: "tasks", Keys: []string{"{operation_id,stage}"}, Err: first},
		{Collection: "hosts", Keys: []string{"{operation_id}"}, Err: errors.New("nope")},
	}

	err := d.IndexSetupErr()
	if err == nil {
		t.Fatal("expected an error")
	}
	for _, want := range []string{"tasks", "hosts", "operation_id,stage", "boom", "nope"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error should name %q, got: %v", want, err)
		}
	}
	// Callers must be able to reach the underlying cause.
	if !errors.Is(err, first) {
		t.Error("joined error should unwrap to the original cause")
	}
}

func TestIndexSetupError_ConflictIsCalledOut(t *testing.T) {
	// A changed index definition is the case that needs a migration rather
	// than a retry, so the message has to say so.
	conflict := &IndexSetupError{
		Collection: "tasks",
		Keys:       []string{"{operation_id,stage}"},
		Err:        errors.New("(IndexKeySpecsConflict) an equivalent index already exists"),
	}
	if !conflict.IsConflict() {
		t.Fatal("IndexKeySpecsConflict should be recognised as a conflict")
	}
	if !strings.Contains(conflict.Error(), "drop the old index") {
		t.Errorf("conflict message should tell the operator what to do, got: %v", conflict)
	}

	transient := &IndexSetupError{
		Collection: "tasks",
		Err:        errors.New("connection reset by peer"),
	}
	if transient.IsConflict() {
		t.Error("a transient failure is not a definition conflict")
	}
	if strings.Contains(transient.Error(), "drop the old index") {
		t.Error("transient failure should not suggest a migration")
	}
}

func TestIndexKeys_RendersEachKeySet(t *testing.T) {
	got := indexKeys([]opts.IndexModel{
		{Key: []string{"task_id"}},
		{Key: []string{"operation_id", "stage"}},
	})
	want := []string{"{task_id}", "{operation_id,stage}"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("index %d: got %q, want %q", i, got[i], want[i])
		}
	}
}
