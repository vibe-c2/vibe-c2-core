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
	{
		Version: 14,
		Date:    "2026-09-16",
		Notes: []string{
			"Wiki pages hold facts, not process. Plans, attempts and what they led to go to the operator in the chat, never into a document; the page gets the finding once there is one. structure.md leads with this and shows what a process dump looks like so it is recognisable.",
			"Dropped from the brief, to make room and because each is covered elsewhere: the icon default (reference/icons.md), idempotency_key (a described field on every write tool) and the search_wiki snippet hint (reference/wiki.md).",
		},
	},
	{
		Version: 15,
		Date:    "2026-09-17",
		Notes: []string{
			"Read the URL and token for the HTTP endpoints out of your MCP client's config at the time of use, never from memory. A token belongs to one server, and a machine used on several projects has several.",
			"A 401 from /mcp/upload or the skills endpoints means a stale or foreign token, not a broken endpoint. Re-read the config and retry rather than falling back to content_base64.",
		},
	},
	{
		Version: 16,
		Date:    "2026-09-17",
		Notes: []string{
			"Evidence belongs in a fenced code block on the page, however many lines it runs to: command output, configs, logs. A code block reads inline and its text is searchable; an attachment is stored as bytes, so only its filename is indexed and nothing inside it can be found.",
			"attach_text_to_wiki_document is now for a real file format somebody would open on its own, or a dump so long it would bury the page. The previous wording sent all raw output to an attachment, which is why pages ended up carrying .txt files they did not need.",
		},
	},
	{
		Version: 17,
		Date:    "2026-09-17",
		Notes: []string{
			"move_wiki_document files a page under a different parent, taking everything below it; omit parent_id for the top level. Until now there was no way to reparent a page, so reorganising meant rebuilding pages under the new parent and trashing the originals, which threw away their history, their attachments and every link pointing at them.",
		},
	},
	{
		Version: 18,
		Date:    "2026-09-17",
		Notes: []string{
			"A new fact joins the section that already covers its kind. A port found on Shodan goes in the services table with the rest, not under a second heading named after the tool that found it: two sections on one subject mean the operator has to read both to know what the host runs. structure.md has the rule as \"where a fact goes\", next to where a page goes.",
			"add_wiki_section is for a subject the page does not cover yet. Its description said only that it appends without touching what is there, which read as an invitation to append.",
		},
	},
	{
		Version: 19,
		Date:    "2026-09-17",
		Notes: []string{
			"Any lucide icon name and any simple-icons brand slug is accepted, which is exactly what the operator's own icon picker offers. The validator previously knew only a 140-name house palette, so an agent asked to match an icon its operator had set was refused and had to settle for a near miss.",
			"A refused icon now means a misspelled or invented name, not a missing one: retry with the right spelling rather than choosing a different glyph. icons.md still names the house shortlist, now as the preference it is.",
		},
	},
	{
		Version: 20,
		Date:    "2026-09-17",
		Notes: []string{
			"Hosts have a description: what the machine is to the engagement, the domain controller holding the PKI role or the jump box the team pivots through. os is the fingerprint and nothing else. Agents were writing the role into os for want of anywhere else to put it, and the operator sorts and filters on that column, so a sentence in it sorted under nothing.",
			"find_hosts search covers the description as well as the hostname and OS.",
		},
	},
	{
		Version: 21,
		Date:    "2026-09-17",
		Notes: []string{
			"Vibe C2 is multiplayer: operators share an operation from their own computers, and your filesystem is not one of them. A page that says \"see /tmp/scan.txt for the full report\" has recorded nothing for anybody who reads it. Paste the content into the page or attach the file.",
			"structure.md carries the same premise where it says who reads a page: weeks later, on another machine, by somebody who was not there.",
		},
	},
	{
		Version: 22,
		Date:    "2026-09-18",
		Notes: []string{
			"A credential chip is a fence with the info-string vibe-credential whose body is JSON carrying the id. The guides named the fence but never showed the body, so agents tried a bare uuid, then a vibe://credential/ link that does not exist. findings.md now has the shape and the three near-misses; wiki.md says a credential is a block, not one of the vibe:// chips.",
			"A malformed vibe-credential fence is refused before the write lands, with the shape that works. It used to be accepted and rendered as an ordinary code block, with nothing anywhere saying the chip had not been made.",
			"The block cannot sit in a table cell, and no vibe://credential/ link exists. Chips are hosts, hashes and pages only.",
		},
	},
	{
		Version: 23,
		Date:    "2026-09-18",
		Notes: []string{
			"A credential's validity is three-state: UNKNOWN, VALID, INVALID. The boolean it replaces could not say \"nobody has tried this yet\", so an untested credential was stored as false and the operator's list, which hides what does not work, hid it. create_credential and update_credential now take validity, and it defaults to UNKNOWN.",
			"find_credentials takes validity as a list of states to include, replacing valid_only. Omit it for everything.",
			"Existing credentials are migrated on deploy: a true becomes VALID, a false becomes UNKNOWN rather than INVALID, since the old guidance had agents set true the moment a credential worked and left everything untried on false.",
		},
	},
	{
		Version: 24,
		Date:    "2026-09-19",
		Notes: []string{
			"Do not stamp a wiki fact with when you collected it. A line like \"Collected 2026-09-19 from public sources\" is a sentence about the agent, not the subject, and it turns into a lie the first time somebody adds to the paragraph under it — which is what these pages are for. The page footer already records who last changed it and when.",
			"Dates still belong wherever the date is itself the fact: a certificate expiry, when a password was set. The timeline is unaffected; it is the engagement's history and dating it is the point.",
			"SKILL.md folds the local-paths rule and the dates rule into one: a page carries nothing that is true only on your machine or only today.",
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
