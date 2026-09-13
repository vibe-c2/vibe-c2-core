// Package bundle reads and writes the native Vibe wiki bundle: a zip that
// carries each page's Y.js content_state verbatim plus a manifest of every
// id the pages reference. Lossless by construction — the bytes that come
// out are the bytes the editor wrote — and the only format that survives a
// move between operations or installations with every link intact.
//
// Layout:
//
//	manifest.json
//	documents/<sourceDocId>.ystate     raw content_state bytes
//	documents/<sourceDocId>.md         human-readable copy, never read back
//	attachments/<sourceAttId>          blob bytes, filename in the manifest
//	credentials.json                   optional payloads, see Manifest
//	REPORT.json                        what the exporter skipped and why
//
// See docs/wiki-transfer-design.md §4.
package bundle

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// Format is the manifest discriminator.
const Format = "vibe-wiki-bundle"

// FormatVersion is bumped on any incompatible manifest change. A reader
// refuses newer versions rather than guessing.
const FormatVersion = 1

// Extension is the suggested file suffix for a bundle.
const Extension = ".vibewiki.zip"

const (
	manifestPath    = "manifest.json"
	credentialsPath = "credentials.json"
	reportPath      = "REPORT.json"
	documentsDir    = "documents/"
	attachmentsDir  = "attachments/"
)

// Manifest is the bundle's index.
type Manifest struct {
	Format        string    `json:"format"`
	FormatVersion int       `json:"formatVersion"`
	BundleID      uuid.UUID `json:"bundleId"`
	ExportedAt    time.Time `json:"exportedAt"`
	Source        Source    `json:"source"`
	// SchemaVersion is the WIKI_SCHEMA_VERSION the content_state bytes were
	// written under.
	SchemaVersion int `json:"schemaVersion"`
	// CredentialsIncluded says whether credentials.json is present. Absent
	// when the exporter lacked the role to read them; chips then import as
	// plain text.
	CredentialsIncluded bool `json:"credentialsIncluded"`

	Documents   []Document   `json:"documents"`
	Attachments []Attachment `json:"attachments"`
	// Hosts and Hashes are identity hints for the ids the pages reference,
	// so a target can decide what to do with a cross-operation chip.
	Hosts  []HostHint `json:"hosts,omitempty"`
	Hashes []HashHint `json:"hashes,omitempty"`
}

// Source says where the bundle came from.
type Source struct {
	// InstallationID identifies the exporting installation when configured;
	// empty otherwise.
	InstallationID string     `json:"installationId,omitempty"`
	OperationID    uuid.UUID  `json:"operationId"`
	OperationName  string     `json:"operationName"`
	Scope          string     `json:"scope"` // "tree" or "subtree"
	RootDocumentID *uuid.UUID `json:"rootDocumentId"`
}

// Document is one page's metadata. Body bytes live at ContentStateFile.
type Document struct {
	ID       uuid.UUID  `json:"id"`
	ParentID *uuid.UUID `json:"parentId"` // nil = top of the exported scope
	Title    string     `json:"title"`
	Emoji    string     `json:"emoji"`
	Icon     string     `json:"icon"`
	Color    string     `json:"color"`
	// SortOrder is the source's fractional index, verbatim.
	SortOrder        string     `json:"sortOrder"`
	IsTemplate       bool       `json:"isTemplate"`
	SourceTemplateID *uuid.UUID `json:"sourceTemplateId"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        *time.Time `json:"updatedAt"`
	// ContentStateFile is empty for a page with no body.
	ContentStateFile  string     `json:"contentStateFile"`
	ContentStateBytes int64      `json:"contentStateBytes"`
	References        References `json:"references"`
	Checklist         Checklist  `json:"checklist"`
}

// References copies the source document's inverse indexes.
type References struct {
	Documents   []uuid.UUID `json:"documents"`
	Hosts       []uuid.UUID `json:"hosts"`
	Hashes      []uuid.UUID `json:"hashes"`
	Credentials []uuid.UUID `json:"credentials"`
	Images      []uuid.UUID `json:"images"`
	Files       []uuid.UUID `json:"files"`
}

// Checklist copies the source document's coverage counters.
type Checklist struct {
	Total    int `json:"total"`
	Required int `json:"required"`
	Answered int `json:"answered"`
}

// Attachment is one blob.
type Attachment struct {
	ID              uuid.UUID `json:"id"`
	Kind            string    `json:"kind"` // "image" | "file"
	OwnerDocumentID uuid.UUID `json:"ownerDocumentId"`
	Filename        string    `json:"filename"`
	ContentType     string    `json:"contentType"`
	SizeBytes       int64     `json:"sizeBytes"`
	SHA256          string    `json:"sha256"`
	File            string    `json:"file"`
}

// HostHint identifies a referenced host well enough to match by identity.
type HostHint struct {
	ID       uuid.UUID `json:"id"`
	Hostname string    `json:"hostname,omitempty"`
}

// HashHint identifies a referenced hash well enough to match by value.
type HashHint struct {
	ID    uuid.UUID `json:"id"`
	Value string    `json:"value,omitempty"`
}

// ErrNotBundle is returned when a zip has no manifest — it is probably a
// markdown zip and should go to the foreign importer instead.
var ErrNotBundle = errors.New("zip is not a vibe wiki bundle")

// Validate checks the manifest's invariants. Structural only; the reader
// separately checks that every referenced file exists in the zip.
func (m *Manifest) Validate() error {
	if m.Format != Format {
		return fmt.Errorf("unexpected format %q", m.Format)
	}
	if m.FormatVersion > FormatVersion || m.FormatVersion < 1 {
		return fmt.Errorf("unsupported bundle format version %d (this build reads up to %d)", m.FormatVersion, FormatVersion)
	}
	if m.BundleID == uuid.Nil {
		return errors.New("manifest has no bundleId")
	}
	seen := map[uuid.UUID]struct{}{}
	for _, d := range m.Documents {
		if d.ID == uuid.Nil {
			return errors.New("document with empty id")
		}
		if _, dup := seen[d.ID]; dup {
			return fmt.Errorf("duplicate document id %s", d.ID)
		}
		seen[d.ID] = struct{}{}
	}
	for _, d := range m.Documents {
		if d.ParentID != nil {
			if _, ok := seen[*d.ParentID]; !ok {
				return fmt.Errorf("document %s names parent %s which is not in the bundle", d.ID, *d.ParentID)
			}
		}
	}
	attSeen := map[uuid.UUID]struct{}{}
	for _, a := range m.Attachments {
		if a.ID == uuid.Nil {
			return errors.New("attachment with empty id")
		}
		if _, dup := attSeen[a.ID]; dup {
			return fmt.Errorf("duplicate attachment id %s", a.ID)
		}
		attSeen[a.ID] = struct{}{}
		if a.Kind != "image" && a.Kind != "file" {
			return fmt.Errorf("attachment %s has unknown kind %q", a.ID, a.Kind)
		}
		if _, ok := seen[a.OwnerDocumentID]; !ok {
			return fmt.Errorf("attachment %s owned by document %s which is not in the bundle", a.ID, a.OwnerDocumentID)
		}
	}
	return nil
}
