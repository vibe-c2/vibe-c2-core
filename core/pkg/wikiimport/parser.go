// Package wikiimport ingests an Outline (getoutline.com) markdown-format
// workspace export into a Vibe-C2 operation wiki.
//
// See docs/wiki-outline-import.md for the format spec and
// docs/wiki-outline-import-implementation-plan.md for the architecture.
//
// The parser in this file is a pure function: it takes an *archive/zip
// reader and produces an in-memory tree describing the export. It does
// not touch Mongo, S3, or the Hocuspocus sidecar — that's the job of
// orchestrator.go.
package wikiimport

import (
	"archive/zip"
	"fmt"
	"io"
	"path"
	"regexp"
	"sort"
	"strings"
)

// ParsedExport is the in-memory shape of an Outline markdown export.
type ParsedExport struct {
	// Collections is one entry per top-level folder in the zip. Order
	// follows the case-insensitive sort of the folder names so multiple
	// imports of the same export produce identical trees.
	Collections []*Collection

	// AttachmentBlobs maps every uploads/... entry the parser saw in the
	// zip to the zip.File we can stream bytes out of later. Keyed by the
	// full zip-internal path (e.g. "test/uploads/<userId>/<attId>/x.pdf").
	AttachmentBlobs map[string]*zip.File
}

// Collection is one top-level folder in the zip. In Outline terms, this
// is one of the user's wiki collections. Names match the folder name.
type Collection struct {
	Name      string
	Documents []*Doc // root-level documents within this collection
}

// Doc is one parsed Outline document. Children are populated for documents
// whose .md has a sibling folder of the same name in the zip.
type Doc struct {
	// Title is the H1 line text (with any leading emoji stripped).
	Title string

	// Emoji is the leading emoji on the H1 line, if any. Empty string
	// when no leading emoji was found.
	Emoji string

	// BodyMarkdown is the document body with the H1 line removed and any
	// leading blank line stripped. Attachment URLs are NOT yet rewritten
	// — that happens in the orchestrator after attachments are ingested.
	BodyMarkdown string

	// SortKey is the original .md filename (without extension), used to
	// produce a stable sibling order. Outline's markdown export does not
	// preserve fractional indices, so we sort case-insensitively by
	// filename and assign fresh SortOrder values during ingest.
	SortKey string

	// Children are documents whose markdown lives in a sibling folder of
	// this document's .md file.
	Children []*Doc

	// AttachmentRefs are the zip-internal paths (uploads/...) that this
	// document's body references via image or link syntax. Each entry is
	// a key into ParsedExport.AttachmentBlobs.
	AttachmentRefs []string
}

// Parse walks the zip and produces the export tree. Returns an error only
// for invariant violations (path traversal, no top-level folder, etc.);
// missing or malformed individual documents are skipped with no error so
// the orchestrator can report partial-success rather than abort.
func Parse(zr *zip.Reader) (*ParsedExport, error) {
	if zr == nil {
		return nil, fmt.Errorf("nil zip reader")
	}

	files, err := indexZip(zr)
	if err != nil {
		return nil, err
	}

	if len(files.collections) == 0 {
		return nil, fmt.Errorf("zip has no top-level collection folder")
	}

	out := &ParsedExport{
		AttachmentBlobs: files.attachments,
	}

	collectionNames := make([]string, 0, len(files.collections))
	for name := range files.collections {
		collectionNames = append(collectionNames, name)
	}
	sort.Slice(collectionNames, func(i, j int) bool {
		return strings.ToLower(collectionNames[i]) < strings.ToLower(collectionNames[j])
	})

	for _, name := range collectionNames {
		mds := files.collections[name]
		coll := &Collection{Name: name}
		coll.Documents = buildDocTree(name, mds)
		out.Collections = append(out.Collections, coll)
	}

	return out, nil
}

// --- internals ---

type indexedZip struct {
	// collections maps collection name → list of (path, *zip.File) for
	// every .md file inside that collection. Path is relative to the
	// collection root and includes the .md suffix.
	collections map[string][]mdEntry
	// attachments maps zip-internal path → *zip.File for every file
	// under any "<collection>/uploads/" subtree.
	attachments map[string]*zip.File
}

type mdEntry struct {
	relPath string // relative to the collection root, e.g. "test/1234.md"
	file    *zip.File
}

func indexZip(zr *zip.Reader) (*indexedZip, error) {
	out := &indexedZip{
		collections: map[string][]mdEntry{},
		attachments: map[string]*zip.File{},
	}

	for _, f := range zr.File {
		// Reject path traversal up front — same-mountpoint sandbox isn't a
		// substitute for never trusting names from a third-party archive.
		if strings.HasPrefix(f.Name, "/") {
			return nil, fmt.Errorf("zip contains unsafe path: %s", f.Name)
		}
		segments := strings.Split(f.Name, "/")
		for _, seg := range segments {
			// Only ".." as a whole path segment is traversal. Two dots
			// inside a filename (e.g. trailing period + ".md" extension)
			// are legal — Outline emits them when the source title ended
			// in punctuation.
			if seg == ".." {
				return nil, fmt.Errorf("zip contains unsafe path: %s", f.Name)
			}
		}
		if f.FileInfo().IsDir() {
			continue
		}

		if len(segments) < 2 {
			// File at zip root — not a collection member, skip silently.
			continue
		}

		collName := segments[0]
		if collName == "" {
			continue
		}

		// Attachments live in some `<...>/uploads/<userId>/<attId>/<filename>`
		// path. Outline puts the `uploads/` directory at the collection root
		// in a single-collection export but DEEP inside each containing
		// folder in a workspace export — `avia.ru/caica.ru/Humans/uploads/...`
		// is real. Markdown refs always say `uploads/<userId>/<attId>/<file>`
		// regardless of doc location, so we key the map by that suffix
		// (`uploads/...`) and let the orchestrator look up exactly what the
		// markdown wrote.
		if uploadsIdx := indexOfUploadsSegment(segments); uploadsIdx >= 0 {
			suffix := strings.Join(segments[uploadsIdx:], "/")
			out.attachments[suffix] = f
			continue
		}

		if !strings.HasSuffix(f.Name, ".md") {
			// Unknown non-markdown file outside uploads — ignore.
			continue
		}

		rel := strings.TrimPrefix(f.Name, collName+"/")
		out.collections[collName] = append(out.collections[collName], mdEntry{
			relPath: rel,
			file:    f,
		})
	}

	return out, nil
}

// indexOfUploadsSegment returns the index of the first segment named
// "uploads" that is followed by at least one more segment (so the entry is
// an attachment file, not an empty uploads dir). Returns -1 when none found.
func indexOfUploadsSegment(segments []string) int {
	for i := 0; i < len(segments)-1; i++ {
		if segments[i] == "uploads" {
			return i
		}
	}
	return -1
}

// buildDocTree turns a flat list of (relPath, file) pairs into a nested Doc
// tree using Outline's parallel-folder convention:
//
//	foo.md         — leaf doc "foo" at the level it was found
//	foo.md + foo/  — doc "foo" with children inside foo/
//	foo/bar.md     — doc "bar" whose parent is "foo"
//
// Sibling order within each level is case-insensitive by filename.
func buildDocTree(collectionName string, entries []mdEntry) []*Doc {
	// Index every .md by its parent directory (relative to the collection
	// root). Root docs have parent dir == "".
	type key struct{ dir, base string }
	byPath := map[string]mdEntry{} // relPath → entry
	for _, e := range entries {
		byPath[e.relPath] = e
	}

	// Group entries by their parent directory.
	byParentDir := map[string][]mdEntry{}
	for _, e := range entries {
		dir := path.Dir(e.relPath)
		if dir == "." {
			dir = ""
		}
		byParentDir[dir] = append(byParentDir[dir], e)
	}
	for dir := range byParentDir {
		sort.Slice(byParentDir[dir], func(i, j int) bool {
			a := strings.ToLower(byParentDir[dir][i].relPath)
			b := strings.ToLower(byParentDir[dir][j].relPath)
			return a < b
		})
	}

	// Materialise the root level recursively.
	var build func(parentDir string) []*Doc
	build = func(parentDir string) []*Doc {
		var out []*Doc
		for _, e := range byParentDir[parentDir] {
			base := strings.TrimSuffix(path.Base(e.relPath), ".md")
			doc := parseDoc(e.file, base)
			if doc == nil {
				continue
			}
			// Children of this doc live in a sibling folder named after
			// the doc's base name.
			childDir := path.Join(parentDir, base)
			doc.Children = build(childDir)
			out = append(out, doc)
		}
		return out
	}

	_ = byPath
	_ = collectionName
	_ = key{}
	return build("")
}

// parseDoc reads a .md zip entry and extracts the title, emoji, and body.
// Returns nil if the file can't be opened — the caller treats it as a
// parser-level "skip with warning" rather than aborting the whole import.
func parseDoc(file *zip.File, base string) *Doc {
	rc, err := file.Open()
	if err != nil {
		return nil
	}
	defer rc.Close()

	raw, err := io.ReadAll(rc)
	if err != nil {
		return nil
	}

	body := string(raw)
	title, emoji, rest := splitH1(body)
	if title == "" {
		// No H1 — fall back to the filename as the title so the import
		// still produces a navigable doc.
		title = base
	}

	return &Doc{
		Title:          title,
		Emoji:          emoji,
		BodyMarkdown:   rest,
		SortKey:        base,
		AttachmentRefs: scanAttachmentRefs(rest),
	}
}

// splitH1 inspects the first non-empty line of body. If it starts with
// "# " it is treated as the title; the rest of the body is returned with
// the H1 line and one trailing blank line consumed. Returns ("", "", body)
// when no H1 is present.
//
// If the title text starts with an emoji (a single grapheme that is in a
// Unicode emoji-presentation range, generally codepoint >= U+1F000 with
// optional ZWJ sequences), it's stripped from the title and returned as
// the doc's Emoji attribute.
func splitH1(body string) (title, emoji, rest string) {
	lines := strings.SplitN(body, "\n", 2)
	if len(lines) == 0 {
		return "", "", body
	}
	first := strings.TrimRight(lines[0], "\r")
	if !strings.HasPrefix(first, "# ") {
		return "", "", body
	}
	titleLine := strings.TrimSpace(first[2:])
	maybeEmoji, remainder := stripLeadingEmoji(titleLine)
	// If stripping the emoji leaves nothing, the H1 was an emoji-only
	// title (e.g. "# 🚀") — keep it as the title rather than splitting
	// it into a decorative emoji with no text.
	if remainder != "" {
		emoji, titleLine = maybeEmoji, remainder
	}
	rest = ""
	if len(lines) > 1 {
		rest = strings.TrimLeft(lines[1], "\n")
	}
	return titleLine, emoji, rest
}

// stripLeadingEmoji extracts the leading emoji codepoint sequence (if any)
// from s and returns it separately along with the remaining text. We use
// a conservative heuristic: the first rune must be in the Supplementary
// Multilingual Plane or above (>= 0x1F000). Outline always serialises an
// emoji directly followed by a space then the title text, so this catches
// the cases the test fixture exercises ("# 😑 test") without needing a
// full emoji-property database.
func stripLeadingEmoji(s string) (emoji, rest string) {
	if s == "" {
		return "", s
	}
	runes := []rune(s)
	first := runes[0]
	if first < 0x1F000 {
		return "", s
	}

	// Consume the leading emoji grapheme cluster. We follow ZWJ joiners
	// and variation selectors so multi-codepoint emojis come out whole.
	end := 1
	for end < len(runes) {
		r := runes[end]
		if r == 0x200D || r == 0xFE0F || r == 0xFE0E {
			end++
			continue
		}
		// Allow trailing emoji modifiers (skin tones, U+1F3FB-U+1F3FF).
		if r >= 0x1F3FB && r <= 0x1F3FF {
			end++
			continue
		}
		// Allow a chain of emoji codepoints joined by ZWJ.
		if r >= 0x1F000 && end > 0 && runes[end-1] == 0x200D {
			end++
			continue
		}
		break
	}

	emoji = string(runes[:end])
	rest = strings.TrimLeft(string(runes[end:]), " \t")
	return emoji, rest
}

// scanAttachmentRefs walks the body markdown and returns every uploads/...
// path it sees in image src or link href positions. Used by the
// orchestrator to determine which zip blobs need to be ingested per
// document.
//
// We use a simple regex pass rather than a full markdown parse because we
// only need the URLs, not their semantic position. The result is a
// deduplicated list preserving first-occurrence order.
func scanAttachmentRefs(body string) []string {
	matches := uploadsRefPattern.FindAllStringSubmatch(body, -1)
	if len(matches) == 0 {
		return nil
	}
	seen := map[string]bool{}
	var out []string
	for _, m := range matches {
		ref := m[1]
		if seen[ref] {
			continue
		}
		seen[ref] = true
		out = append(out, ref)
	}
	return out
}

// uploadsRefPattern catches both ![alt](uploads/...) image refs and
// [label](uploads/...) link refs. The capture group is the path inside
// the link target, with any URL-encoded characters left as-is — the
// orchestrator decodes them when looking up the corresponding zip entry.
var uploadsRefPattern = regexp.MustCompile(`\]\((uploads/[^)\s]+(?:\s+"[^"]*")?)\)`)
