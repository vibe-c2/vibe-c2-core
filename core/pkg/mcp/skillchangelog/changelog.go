// Package skillchangelog is the version history of the generated agent skill.
//
// The skill itself is rendered from the live tool registry (see package mcp),
// so it has no natural version: it is whatever the server is running. That is
// fine for correctness and useless for telling an operator their installed
// copy is stale. This package supplies the missing number — a hand-bumped
// sequence with a note for each step — and a golden test in package mcp makes
// forgetting to bump it a build failure.
//
// A leaf package rather than part of mcp because two sides need it: mcp stamps
// the version into the bundle, and the GraphQL layer serves the changelog and
// validates snoozes. mcp already depends on the resolvers, so the resolvers
// cannot depend on mcp.
package skillchangelog

import (
	"fmt"
	"time"
)

// Release is one entry in the history.
type Release struct {
	// Version is a plain counter, not semver. There is nothing for a minor or
	// patch to mean: the operator either has the current bundle or does not.
	Version int
	// Date is the release day in YYYY-MM-DD. Informational.
	Date string
	// Notes are what the operator reads in the update prompt: one line per
	// change, written for someone deciding whether to re-download now.
	Notes []string
}

// releases is the history, oldest first. Append a new entry whenever the
// rendered bundle changes: the golden test refuses a content change without
// one. Never edit or remove an entry that has shipped — installed copies carry
// its number.
var releases = []Release{
	{
		Version: 1,
		Date:    "2026-09-14",
		Notes: []string{
			"First versioned release. The skill now carries its version in the frontmatter, and the app will tell you when a newer one is available.",
		},
	},
}

// Releases returns the full history, oldest first. A copy, so callers cannot
// disturb the package state.
func Releases() []Release {
	out := make([]Release, len(releases))
	copy(out, releases)
	return out
}

// Current is the version of the bundle this server renders.
func Current() int {
	return releases[len(releases)-1].Version
}

// Since returns the entries newer than v, oldest first. Everything when v is
// zero or negative, nothing when v is current or ahead of it.
func Since(v int) []Release {
	var out []Release
	for _, r := range releases {
		if r.Version > v {
			out = append(out, r)
		}
	}
	return out
}

// Validate checks the history is well formed: versions count up from one
// without gaps, dates parse, every entry has at least one non-empty note.
// Exposed so the test that enforces it lives next to the golden test rather
// than duplicating the rules.
func Validate() error {
	if len(releases) == 0 {
		return fmt.Errorf("the changelog is empty")
	}
	for i, r := range releases {
		if want := i + 1; r.Version != want {
			return fmt.Errorf("entry %d has version %d, want %d: versions count up from 1 without gaps", i, r.Version, want)
		}
		if _, err := time.Parse("2006-01-02", r.Date); err != nil {
			return fmt.Errorf("version %d: date %q is not YYYY-MM-DD", r.Version, r.Date)
		}
		if len(r.Notes) == 0 {
			return fmt.Errorf("version %d has no notes", r.Version)
		}
		for j, n := range r.Notes {
			if n == "" {
				return fmt.Errorf("version %d: note %d is empty", r.Version, j)
			}
		}
	}
	return nil
}
