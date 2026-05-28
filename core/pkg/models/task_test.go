package models

import (
	"errors"
	"testing"
)

func TestTaskStage_IsValid(t *testing.T) {
	cases := []struct {
		stage TaskStage
		want  bool
	}{
		{TaskStageBacklog, true},
		{TaskStageTodo, true},
		{TaskStageInProcess, true},
		{TaskStageDone, true},
		{"backlog", false}, // case-sensitive
		{"", false},
		{"REVIEW", false},
	}
	for _, tc := range cases {
		t.Run(string(tc.stage), func(t *testing.T) {
			if got := tc.stage.IsValid(); got != tc.want {
				t.Fatalf("IsValid(%q) = %v, want %v", tc.stage, got, tc.want)
			}
		})
	}
}

func TestTaskStatus_IsValid(t *testing.T) {
	cases := []struct {
		status TaskStatus
		want   bool
	}{
		{TaskStatusUndefined, true},
		{TaskStatusSuccess, true},
		{TaskStatusFail, true},
		{"success", false},
		{"", false},
		{"PARTIAL", false},
	}
	for _, tc := range cases {
		t.Run(string(tc.status), func(t *testing.T) {
			if got := tc.status.IsValid(); got != tc.want {
				t.Fatalf("IsValid(%q) = %v, want %v", tc.status, got, tc.want)
			}
		})
	}
}

func TestTaskStatus_IsTerminal(t *testing.T) {
	cases := []struct {
		status TaskStatus
		want   bool
	}{
		{TaskStatusSuccess, true},
		{TaskStatusFail, true},
		{TaskStatusUndefined, false},
	}
	for _, tc := range cases {
		t.Run(string(tc.status), func(t *testing.T) {
			if got := tc.status.IsTerminal(); got != tc.want {
				t.Fatalf("IsTerminal(%q) = %v, want %v", tc.status, got, tc.want)
			}
		})
	}
}

// TestValidateStageStatus_DoneRequiresTerminal locks in the central
// invariant: moving a task to DONE without picking SUCCESS or FAIL must
// fail with the sentinel error so the resolver can surface it for the UI's
// status-required prompt.
func TestValidateStageStatus_DoneRequiresTerminal(t *testing.T) {
	if err := ValidateStageStatus(TaskStageDone, TaskStatusUndefined); !errors.Is(err, ErrDoneRequiresTerminalStatus) {
		t.Fatalf("DONE + UNDEFINED: want ErrDoneRequiresTerminalStatus, got %v", err)
	}
}

// TestValidateStageStatus_DoneWithTerminalStatusAllowed verifies that the
// happy path through the invariant passes (both SUCCESS and FAIL are
// acceptable terminal statuses).
func TestValidateStageStatus_DoneWithTerminalStatusAllowed(t *testing.T) {
	for _, s := range []TaskStatus{TaskStatusSuccess, TaskStatusFail} {
		if err := ValidateStageStatus(TaskStageDone, s); err != nil {
			t.Fatalf("DONE + %s: unexpected error %v", s, err)
		}
	}
}

// TestValidateStageStatus_NonDoneAcceptsAnyValidStatus confirms operators
// can park a SUCCESS/FAIL outcome on a non-DONE stage (e.g. moving a card
// out of DONE without resetting status) and the invariant doesn't bite.
func TestValidateStageStatus_NonDoneAcceptsAnyValidStatus(t *testing.T) {
	stages := []TaskStage{TaskStageBacklog, TaskStageTodo, TaskStageInProcess}
	statuses := []TaskStatus{TaskStatusUndefined, TaskStatusSuccess, TaskStatusFail}
	for _, stg := range stages {
		for _, st := range statuses {
			if err := ValidateStageStatus(stg, st); err != nil {
				t.Fatalf("%s + %s: unexpected error %v", stg, st, err)
			}
		}
	}
}

func TestValidateStageStatus_RejectsUnknownEnums(t *testing.T) {
	if err := ValidateStageStatus("REVIEW", TaskStatusUndefined); err == nil {
		t.Fatalf("expected error for unknown stage")
	}
	if err := ValidateStageStatus(TaskStageTodo, "PARTIAL"); err == nil {
		t.Fatalf("expected error for unknown status")
	}
}

