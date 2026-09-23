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
	{
		Version: 25,
		Date:    "2026-09-19",
		Notes: []string{
			"Wiki pages can now be drawings as well as prose. A drawing page holds an Excalidraw canvas instead of Markdown, and get_wiki_drawing / edit_wiki_drawing are how you read and change one. Both work while the operator has the canvas open: an edit merges and appears on their screen as it lands, and `watchers` tells you whether anyone was looking.",
			"Read a drawing before editing it. Edits address shapes by id, and the ids come from get_wiki_drawing — an update or delete naming a shape that is not there changes nothing and says so rather than inventing it.",
			"Elements are Excalidraw's own shape, and only `type` is required: rectangle, ellipse, diamond, text, arrow, line, freedraw, image or frame. Position, size, colour and the rest are optional and filled in for you. Do not send seeds or version nonces.",
			"The Markdown tools refuse a drawing and the drawing tools refuse a prose page, in both cases naming the tool that does work. A drawing has no Markdown body, so get_wiki_document cannot read one and update_wiki_document must not be pointed at one.",
			"reference/drawings.md is the guide for all of this. SKILL.md lost a line of its own prose to make room for pointing at it, which is the trade: the always-on brief stays the size it was.",
		},
	},
	{
		Version: 26,
		Date:    "2026-09-19",
		Notes: []string{
			"A page listing now marks a drawing: rows in list_wiki_tree and search_wiki carry kind:\"drawing\". Rows without it are prose. Until now nothing told you which was which, so the only way to find out was to aim a tool at one and be refused.",
			"Put words on a shape with `label` rather than composing the text element yourself. Excalidraw models a labelled box as a shape plus a bound text, and the pair only holds if each names the other — `label` builds and wires both.",
			"Connect an arrow with `startBinding`/`endBinding`, each the id of a shape. An unbound arrow is decoration: it does not follow the shapes when they move, so a diagram that looked right falls apart the first time somebody edits it. This was the quiet failure in agent-drawn diagrams before now.",
			"get_wiki_drawing summarises a canvas over 120 shapes — counts by type plus every label — instead of listing all of it. The Markdown side has always done this at 8 KB; a canvas had no such backstop and could spend your whole context on one read.",
			"Creating a page with no body no longer reports watchers and attachment counts about a write that never happened.",
			"Draw when the operator asks for a drawing, and otherwise write the page. A drawing exists for them, not for you: a topology or an attack path is far faster for a person to read as a picture, while you read a canvas as a list of shapes and lose the prose you could have searched, quoted and edited precisely. Turning notes into a diagram uninvited hands the operator shapes when they wanted sentences.",
		},
	},
	{
		Version: 27,
		Date:    "2026-09-19",
		Notes: []string{
			"find_skills lists published skills only. The built-in vibe-c2 skill is not among them and never will be: it is the one you are already running, generated from the live tool registry on every download, and installed by an operator rather than published. A listing without it is a complete listing, not a missing entry — and searching the registry for it now says so rather than returning nothing.",
			"The name is reserved, so nobody can publish a skill called vibe-c2 or vibe-c2-anything. If you were about to report the built-in skill as missing from the registry, this is why it is not there.",
		},
	},
	{
		Version: 28,
		Date:    "2026-09-19",
		Notes: []string{
			"Superseding v27: the built-in vibe-c2 skill IS in find_skills now, marked builtIn, alongside the published ones. Explaining an absence was the wrong fix — a listing that silently leaves something out invites the reader to conclude it does not exist, and twice it did.",
			"You can download it. get_skill vibe-c2 returns a download URL your agent key can fetch, the same as any published skill. Unzip it into the operator's skills directory when your copy is behind this server, and tell them to start a new session so their client loads it. It cannot be loaded into the session you are in: whatever skill you are running was loaded when the session began.",
			"It has no owner and no version history, because it is rendered from the live tool registry on every download rather than stored. The name stays reserved, so nobody can publish under it.",
		},
	},
	{
		Version: 29,
		Date:    "2026-09-20",
		Notes: []string{
			"mode:\"update\" is a patch now. It used to fill every field you left out with a default before merging, so moving a box reset its size to 100x100, sent y to 0 and detached its label — while the result said applied: 1. Only the fields you send change. It also no longer demands `type` on a shape you identified by id, and `label` retitles a bound label.",
			"A bound arrow with no points is placed for you: the server draws a straight stroke between the two shapes' edges. Give arrows bindings and no geometry and a tree draws itself. It is still not a routing engine — straight lines only, nothing avoids a sibling.",
			"Identical points draw identical strokes. Twenty arrows sharing geometry are one visible line and a result saying applied: 20, so the response now warns when shapes land exactly on top of each other. get_wiki_drawing's default view carries points and bindings for arrows, which is how you see the overlap at all.",
			"Coordinates grow right and down and there is no canvas edge. A shape at x: 3000 is real and off the screen of anyone looking at the origin — read a canvas that looks empty before redrawing it.",
			"When a layout has gone wrong in several places, mode:\"replace\" with the whole scene beats a run of patches: one coherent change rather than a sequence that must be right about its starting state each time.",
		},
	},
	{
		Version: 30,
		Date:    "2026-09-20",
		Notes: []string{
			"A labelled shape is now sized to fit its label. It used to keep the 100px default whatever the words were, so anything longer than about ten characters ran over its own border with nothing to say so. Set width yourself only when you want a particular one — an explicit size is never overridden, and only the dimension you leave out is chosen for you.",
			"Free-standing text is sized to its own words for the same reason; it used to be a fixed 100x100 box. A long label wraps rather than growing one absurdly wide box.",
			"Sizing accounts for scripts that are physically wider: CJK, Hangul, fullwidth forms and emoji measure about twice Latin at the same font size. Cyrillic and Greek measure like Latin, so they are not inflated.",
		},
	},
	{
		Version: 31,
		Date:    "2026-09-20",
		Notes: []string{
			"Layer a shape with `z`: higher covers lower. Shapes a person drew sit at 0, so z:-1 puts your arrows under their boxes and z:1 floats a note over everything. Shapes sent without a z stack on top in the order you sent them.",
			"get_wiki_drawing returns elements back-to-front, so the list itself is the layering, and each element reports its z.",
			"This also fixes something that was quietly broken: paint order used to come from the order a Y.Map happened to iterate, which Yjs derives from CRDT structure rather than insertion. Two people in the same room saw different orders for identical state — an arrow over the box for one of them and under it for the other, with nothing looking wrong to either. Order is now computed from the elements themselves, so every client agrees.",
			"Within a layer, the order of shapes a person drew is preserved from Excalidraw's own fractional index, which was previously ignored — rearranging shapes in the app and reloading used to lose the arrangement.",
		},
	},
	{
		Version: 32,
		Date:    "2026-09-23",
		Notes: []string{
			"get_wiki_document reads longer than 40 KB now continue instead of ending there. A truncated body or section reports the byte offset it stopped at; pass that back as offset: — full:true again for a whole body, the same section: for a section — to read the next part, until truncated is false. Before this the tail of a long page was simply unreachable.",
			"Text above the first heading is in no section, so section: cannot fetch it and only full:true reaches it. The outline already reports its size as bytes above the first heading; wiki.md now says so, and to treat a read as complete only once truncated is false.",
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
