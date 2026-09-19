package bundle

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer"
)

// maxManifestBytes bounds the manifest and credentials files. A manifest
// for 5000 pages is well under a megabyte.
const maxManifestBytes = 32 << 20

// IsBundle reports whether the zip carries a bundle manifest. Cheap: the
// central directory is already in memory.
func IsBundle(zr *zip.Reader) bool {
	_, ok := findFile(zr, manifestPath)
	return ok
}

// ReadManifest parses and validates the manifest without touching any
// other entry. Used to inspect a bundle before importing it.
func ReadManifest(zr *zip.Reader) (*Manifest, error) {
	f, ok := findFile(zr, manifestPath)
	if !ok {
		return nil, ErrNotBundle
	}
	var m Manifest
	if err := readJSON(f, &m); err != nil {
		return nil, fmt.Errorf("read manifest: %w", err)
	}
	if err := m.Validate(); err != nil {
		return nil, fmt.Errorf("invalid manifest: %w", err)
	}
	return &m, nil
}

// ReadPlan turns a bundle into a transfer Plan. Every file the manifest
// names must exist; a missing content_state file is a hard error, a
// missing attachment is dropped with the page still imported (the report
// will show an unresolved reference).
func ReadPlan(zr *zip.Reader) (*wikitransfer.Plan, error) {
	m, err := ReadManifest(zr)
	if err != nil {
		return nil, err
	}

	plan := &wikitransfer.Plan{
		BundleID:          m.BundleID,
		SourceOperationID: m.Source.OperationID,
		Attachments:       map[uuid.UUID]*wikitransfer.Attachment{},
		Credentials:       map[uuid.UUID]wikitransfer.CredentialPayload{},
	}

	pages := map[uuid.UUID]*wikitransfer.Page{}
	for _, d := range m.Documents {
		page := &wikitransfer.Page{
			SourceID:         d.ID,
			Title:            d.Title,
			Emoji:            d.Emoji,
			Icon:             d.Icon,
			Color:            d.Color,
			SortOrder:        d.SortOrder,
			Kind:             d.Kind.Or(),
			IsTemplate:       d.IsTemplate,
			SourceTemplateID: d.SourceTemplateID,
			HostRefs:         d.References.Hosts,
			HashRefs:         d.References.Hashes,
		}
		if d.ContentStateFile != "" {
			f, ok := findFile(zr, d.ContentStateFile)
			if !ok {
				return nil, fmt.Errorf("document %s: content file %q missing from bundle", d.ID, d.ContentStateFile)
			}
			state, err := readAll(f, d.ContentStateBytes)
			if err != nil {
				return nil, fmt.Errorf("document %s: read content: %w", d.ID, err)
			}
			page.ContentState = state
		}
		pages[d.ID] = page
	}

	// Manifest order is parent-first (the writer walks that way), but do
	// not rely on it: attach children after every page exists.
	for _, d := range m.Documents {
		page := pages[d.ID]
		if d.ParentID == nil {
			plan.Pages = append(plan.Pages, page)
			continue
		}
		parent := pages[*d.ParentID]
		parent.Children = append(parent.Children, page)
	}

	for _, a := range m.Attachments {
		f, ok := findFile(zr, a.File)
		if !ok {
			continue
		}
		kind := wikitransfer.AttachmentFile
		if a.Kind == "image" {
			kind = wikitransfer.AttachmentImage
		}
		att := &wikitransfer.Attachment{
			ID:          a.ID,
			Kind:        kind,
			Filename:    a.Filename,
			ContentType: a.ContentType,
			SizeBytes:   int64(f.UncompressedSize64),
			Open:        func() (io.ReadCloser, error) { return f.Open() },
		}
		plan.Attachments[a.ID] = att
		if owner, ok := pages[a.OwnerDocumentID]; ok {
			owner.Attachments = append(owner.Attachments, a.ID)
		}
	}

	if m.CredentialsIncluded {
		if f, ok := findFile(zr, credentialsPath); ok {
			var payloads []wikitransfer.CredentialPayload
			if err := readJSON(f, &payloads); err != nil {
				return nil, fmt.Errorf("read credentials: %w", err)
			}
			for _, p := range payloads {
				id, err := uuid.Parse(p.ID)
				if err != nil {
					continue
				}
				if p.Deleted {
					plan.CredentialTombstones = append(plan.CredentialTombstones, id)
					continue
				}
				plan.Credentials[id] = p
			}
		}
	}
	return plan, nil
}

func findFile(zr *zip.Reader, name string) (*zip.File, bool) {
	name = strings.TrimPrefix(name, "/")
	for _, f := range zr.File {
		if f.Name == name {
			return f, true
		}
	}
	return nil, false
}

func readAll(f *zip.File, declared int64) ([]byte, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()
	limit := int64(f.UncompressedSize64)
	if declared > 0 && declared < limit {
		limit = declared
	}
	return io.ReadAll(io.LimitReader(rc, limit+1))
}

func readJSON(f *zip.File, v any) error {
	rc, err := f.Open()
	if err != nil {
		return err
	}
	defer rc.Close()
	return json.NewDecoder(io.LimitReader(rc, maxManifestBytes)).Decode(v)
}
