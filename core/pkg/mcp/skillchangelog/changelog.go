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
	{
		Version: 2,
		Date:    "2026-09-14",
		Notes: []string{
			"Clarified task outcomes: SUCCESS and FAIL now describe what the engagement gained, not whether the task was finished. A cleanly completed lead that is refuted or fails is a FAIL.",
		},
	},
	{
		Version: 3,
		Date:    "2026-09-15",
		Notes: []string{
			"Checklist answers: multi-line output (command results, host lists, config excerpts) goes in a fenced code block, one line per line, so the operator reads it as written instead of as one run-together line.",
		},
	},
	{
		Version: 4,
		Date:    "2026-09-15",
		Notes: []string{
			"Wiki structure: one subject per page, placed in the tree (Infrastructure → subnet → host) with parent_id, instead of growing one page into a dump. Pages cannot be re-parented, so the parent is chosen at creation.",
		},
	},
	{
		Version: 5,
		Date:    "2026-09-15",
		Notes: []string{
			"Attachments: attach_text_to_wiki_document and list_wiki_attachments now return a ready `markdown` line; paste it alone in a paragraph to show the file as an attachment card, anywhere on the page including inside a checklist answer.",
		},
	},
	{
		Version: 6,
		Date:    "2026-09-15",
		Notes: []string{
			"New delete_wiki_document: moves a page to the trash, where an admin can restore it. A page with children needs with_children:true; templates are refused.",
		},
	},
	{
		Version: 7,
		Date:    "2026-09-15",
		Notes: []string{
			"Structure guide lists what the page UI already shows (breadcrumb, tree, sub-pages, backlinks, task links, table of contents) so agents stop writing Parent:, Back to, sub-page lists and other links that duplicate it.",
		},
	},
	{
		Version: 8,
		Date:    "2026-09-15",
		Notes: []string{
			"Attachment feedback: every wiki write reports attachmentCards and fileLinksNotPlaced (file links that stayed plain text), and list_wiki_attachments marks each file placed or not, so an agent can see and fix a link that did not become a card.",
		},
	},
	{
		Version: 9,
		Date:    "2026-09-15",
		Notes: []string{
			"New attach_file_to_wiki_document: binary files from base64, and with as:\"image\" a screenshot placed inline on the page. The result carries the markdown line to paste.",
		},
	},
	{
		Version: 10,
		Date:    "2026-09-15",
		Notes: []string{
			"POST /api/v1/mcp/upload: raw multipart upload with the agent token, the same action and result as attach_file_to_wiki_document without base64 overhead. Preferred for screenshots and binaries.",
		},
	},
	{
		Version: 11,
		Date:    "2026-09-15",
		Notes: []string{
			"Uploads place themselves on the page: attach_file_to_wiki_document and /mcp/upload add the image or card at the end (or start) of the page by default, and report placed:true. place:\"none\" keeps the old store-only behaviour; an unplaced image is garbage-collected.",
		},
	},
	{
		Version: 12,
		Date:    "2026-09-16",
		Notes: []string{
			"Skills operators publish to each other. New find_skills and get_skill list what is on the server and give you a download URL your agent key can fetch; POST a zip to /api/v1/mcp/skills/upload to publish one. A name belongs to whoever claimed it first, every version is kept, and skills.md covers installing and publishing — including reading a downloaded skill before following it, since nobody reviews them.",
		},
	},
	{
		Version: 13,
		Date:    "2026-09-16",
		Notes: []string{
			"New update_credential: correct a credential you or anyone else recorded. Send only the fields that change; keys, properties and tags replace the whole list when sent, and clear it when sent empty.",
			"is_valid is a yes or no with no \"untested\" in between, and the operator's view labels false as Invalid. A credential recorded before you try it therefore reads as broken, so set is_valid:true once you have actually used it.",
			"A published skill can now be removed outright by its owner, so an earlier version is no longer guaranteed to stay downloadable. Publishing still never overwrites one.",
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
