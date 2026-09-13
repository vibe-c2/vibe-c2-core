package bundle_test

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer/bundle"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer/transfertest"
	"go.uber.org/zap"
)

// fixture is a source operation with root → child, one image on the root,
// one file and one credential chip on the child, plus an unrelated page.
type fixture struct {
	op                    uuid.UUID
	root, child, other    models.WikiDocument
	img                   models.WikiImage
	file                  models.WikiFile
	cred                  models.Credential
	docs                  *transfertest.DocRepo
	images                *transfertest.ImageRepo
	files                 *transfertest.FileRepo
	imageStore, fileStore *transfertest.Store
	creds                 *transfertest.CredentialRepo
	writer                *bundle.Writer
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	f := &fixture{op: uuid.New()}
	rootID, childID := uuid.New(), uuid.New()
	f.img = models.WikiImage{ImageID: uuid.New(), OperationID: f.op, DocumentID: rootID, ObjectKey: "img-key", ContentType: "image/png", SizeBytes: 3}
	f.file = models.WikiFile{FileID: uuid.New(), OperationID: f.op, DocumentID: childID, ObjectKey: "file-key", Filename: "notes.pdf", ContentType: "application/pdf", SizeBytes: 3}
	f.cred = models.Credential{CredentialID: uuid.New(), OperationID: f.op, Name: "svc", Type: models.CredentialTypePassword, Username: "u", Password: "p"}

	f.root = models.WikiDocument{
		DocumentID: rootID, OperationID: f.op, Title: "Root", Emoji: "🚀", SortOrder: "a", PathIDs: []uuid.UUID{},
		ContentState:    []byte("see doc:" + childID.String() + " and /api/v1/wiki/images/" + f.img.ImageID.String()),
		ImageReferences: []uuid.UUID{f.img.ImageID},
		References:      []uuid.UUID{childID},
	}
	f.child = models.WikiDocument{
		DocumentID: childID, OperationID: f.op, Title: "Child", SortOrder: "b", ParentDocumentID: &rootID, PathIDs: []uuid.UUID{rootID},
		// The real sidecar renders a credential chip as a vibe-credential
		// fence; the fake renderer echoes the state, so carry both the
		// chip token the fake rebaser understands and the fence the
		// writer's collector reads.
		ContentState: []byte("file /api/v1/wiki/files/" + f.file.FileID.String() + " cred:" + f.cred.CredentialID.String() +
			"\n```vibe-credential\n{\"id\": \"" + f.cred.CredentialID.String() + "\"}\n```\n"),
		// Deliberately no stored indexes: the writer must recover them
		// from the rendered body.
		IsTemplate: true,
	}
	f.other = models.WikiDocument{DocumentID: uuid.New(), OperationID: f.op, Title: "Other", SortOrder: "c", PathIDs: []uuid.UUID{}}

	f.docs = transfertest.NewDocRepo(f.root, f.child, f.other)
	f.images = transfertest.NewImageRepo(f.img)
	f.files = transfertest.NewFileRepo(f.file)
	f.imageStore = transfertest.NewStore()
	f.fileStore = transfertest.NewStore()
	f.imageStore.Bytes["img-key"] = []byte("PNG")
	f.fileStore.Bytes["file-key"] = []byte("PDF")
	f.creds = transfertest.NewCredentialRepo(f.cred)
	f.writer = bundle.NewWriter(f.images, f.files, f.imageStore, f.fileStore, nil, nil, f.creds, transfertest.Renderer{}, zap.NewNop(), bundle.Config{InstallationID: "inst-1"})
	return f
}

func (f *fixture) export(t *testing.T, rootID *uuid.UUID, includeCreds bool) (*zip.Reader, *wikitransfer.ExportReport) {
	t.Helper()
	scope, err := wikitransfer.CollectScope(context.Background(), f.docs, f.op, "ACME", rootID)
	if err != nil {
		t.Fatalf("CollectScope: %v", err)
	}
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	report, err := f.writer.Run(context.Background(), zw, scope, bundle.Options{IncludeCredentials: includeCreds}, nil)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	zr, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	return zr, report
}

func readEntry(t *testing.T, zr *zip.Reader, name string) []byte {
	t.Helper()
	for _, e := range zr.File {
		if e.Name == name {
			rc, err := e.Open()
			if err != nil {
				t.Fatalf("open %s: %v", name, err)
			}
			defer rc.Close()
			b, _ := io.ReadAll(rc)
			return b
		}
	}
	t.Fatalf("entry %q missing; have %v", name, names(zr))
	return nil
}

func names(zr *zip.Reader) []string {
	var out []string
	for _, e := range zr.File {
		out = append(out, e.Name)
	}
	return out
}

func TestWriter_SubtreeLayoutAndManifest(t *testing.T) {
	f := newFixture(t)
	zr, report := f.export(t, &f.root.DocumentID, true)

	if report.ExportedDocs != 2 || report.ImagesExported != 1 || report.FilesExported != 1 || report.CredentialsExported != 1 {
		t.Fatalf("report = %+v", report)
	}
	if !bundle.IsBundle(zr) {
		t.Fatal("IsBundle = false")
	}
	m, err := bundle.ReadManifest(zr)
	if err != nil {
		t.Fatalf("ReadManifest: %v", err)
	}
	if m.Source.InstallationID != "inst-1" || m.Source.OperationID != f.op || m.Source.Scope != "subtree" || m.Source.RootDocumentID == nil || *m.Source.RootDocumentID != f.root.DocumentID {
		t.Errorf("source = %+v", m.Source)
	}
	if len(m.Documents) != 2 || m.Documents[0].ID != f.root.DocumentID || m.Documents[0].ParentID != nil {
		t.Fatalf("documents = %+v", m.Documents)
	}
	child := m.Documents[1]
	if child.ParentID == nil || *child.ParentID != f.root.DocumentID || !child.IsTemplate || child.SortOrder != "b" {
		t.Errorf("child entry = %+v", child)
	}
	// Recovered from the rendered body, not the (empty) stored index.
	if len(child.References.Files) != 1 || child.References.Files[0] != f.file.FileID || len(child.References.Credentials) != 1 {
		t.Errorf("child references = %+v", child.References)
	}
	if len(m.Attachments) != 2 || !m.CredentialsIncluded {
		t.Errorf("attachments=%d credsIncluded=%v", len(m.Attachments), m.CredentialsIncluded)
	}

	if got := readEntry(t, zr, "documents/"+f.root.DocumentID.String()+".ystate"); !bytes.Equal(got, f.root.ContentState) {
		t.Error("content_state bytes must be stored verbatim")
	}
	readEntry(t, zr, "documents/"+f.root.DocumentID.String()+".md")
	if got := readEntry(t, zr, "attachments/"+f.img.ImageID.String()); string(got) != "PNG" {
		t.Errorf("image bytes = %q", got)
	}
	var creds []wikitransfer.CredentialPayload
	if err := json.Unmarshal(readEntry(t, zr, "credentials.json"), &creds); err != nil || len(creds) != 1 || creds[0].Password != "p" {
		t.Errorf("credentials.json = %s (%v)", readEntry(t, zr, "credentials.json"), err)
	}
	readEntry(t, zr, "REPORT.json")
}

func TestWriter_TreeScopeAndCredentialsOptOut(t *testing.T) {
	f := newFixture(t)
	zr, report := f.export(t, nil, false)
	m, err := bundle.ReadManifest(zr)
	if err != nil {
		t.Fatalf("ReadManifest: %v", err)
	}
	if m.Source.Scope != "tree" || len(m.Documents) != 3 {
		t.Errorf("scope=%s docs=%d", m.Source.Scope, len(m.Documents))
	}
	if m.CredentialsIncluded || report.CredentialsExported != 0 {
		t.Error("credentials must not be embedded without opt-in")
	}
	for _, e := range zr.File {
		if e.Name == "credentials.json" {
			t.Error("credentials.json must be absent")
		}
	}
}

func TestReadPlan_RoundTripsWriter(t *testing.T) {
	f := newFixture(t)
	zr, _ := f.export(t, &f.root.DocumentID, true)
	plan, err := bundle.ReadPlan(zr)
	if err != nil {
		t.Fatalf("ReadPlan: %v", err)
	}
	if plan.SourceOperationID != f.op || plan.CountPages() != 2 || len(plan.Pages) != 1 {
		t.Fatalf("plan shape: op=%s pages=%d top=%d", plan.SourceOperationID, plan.CountPages(), len(plan.Pages))
	}
	root := plan.Pages[0]
	if root.SourceID != f.root.DocumentID || root.Emoji != "🚀" || !bytes.Equal(root.ContentState, f.root.ContentState) {
		t.Errorf("root page = %+v", root)
	}
	if len(root.Attachments) != 1 || root.Attachments[0] != f.img.ImageID {
		t.Errorf("root attachments = %v", root.Attachments)
	}
	child := root.Children[0]
	if child.SourceID != f.child.DocumentID || !child.IsTemplate || len(child.Attachments) != 1 {
		t.Errorf("child page = %+v", child)
	}
	att := plan.Attachments[f.file.FileID]
	if att == nil || att.Kind != wikitransfer.AttachmentFile || att.Filename != "notes.pdf" {
		t.Fatalf("file attachment = %+v", att)
	}
	rc, err := att.Open()
	if err != nil {
		t.Fatal(err)
	}
	b, _ := io.ReadAll(rc)
	_ = rc.Close()
	if string(b) != "PDF" {
		t.Errorf("file bytes = %q", b)
	}
	if p, ok := plan.Credentials[f.cred.CredentialID]; !ok || p.Username != "u" {
		t.Errorf("credentials = %+v", plan.Credentials)
	}
}

func TestRoundTrip_ExportThenImportIntoAnotherOperation(t *testing.T) {
	f := newFixture(t)
	zr, _ := f.export(t, &f.root.DocumentID, true)
	plan, err := bundle.ReadPlan(zr)
	if err != nil {
		t.Fatalf("ReadPlan: %v", err)
	}

	targetOp := uuid.New()
	targetDocs := transfertest.NewDocRepo()
	targetCreds := transfertest.NewCredentialRepo()
	ingestor := transfertest.NewIngestor()
	m := wikitransfer.NewMaterialiser(targetDocs, targetCreds, nil, nil, ingestor, &transfertest.Rebaser{}, nil, zap.NewNop())
	report, err := m.Run(context.Background(), plan, wikitransfer.Target{OperationID: targetOp, CallerID: uuid.New()}, nil)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if report.CreatedDocs != 2 || report.SkippedDocs != 0 {
		t.Fatalf("report = %+v", report)
	}
	root, _ := targetDocs.ByTitle("Root")
	child, _ := targetDocs.ByTitle("Child")
	if root.OperationID != targetOp || child.ParentDocumentID == nil || *child.ParentDocumentID != root.DocumentID {
		t.Error("tree not reproduced on the target")
	}
	if !strings.Contains(root.Content, "doc:"+child.DocumentID.String()) {
		t.Errorf("page link not rewired: %s", root.Content)
	}
	if len(root.ImageReferences) != 1 || string(ingestor.Images[root.ImageReferences[0]]) != "PNG" {
		t.Error("image bytes did not survive the round trip")
	}
	if len(child.FileReferences) != 1 || string(ingestor.Files[child.FileReferences[0]]) != "PDF" {
		t.Error("file bytes did not survive the round trip")
	}
	if len(child.CredentialReferences) != 1 || child.CredentialReferences[0] == f.cred.CredentialID {
		t.Errorf("credential must be recreated on the target: %v", child.CredentialReferences)
	}
	if c, err := targetCreds.FindByID(context.Background(), child.CredentialReferences[0]); err != nil || c.Password != "p" || c.OperationID != targetOp {
		t.Errorf("target credential = %+v (%v)", c, err)
	}
	if !child.IsTemplate || root.Emoji != "🚀" || child.SortOrder == "" {
		t.Error("metadata lost in the round trip")
	}
}

func TestReadPlan_RejectsBrokenBundles(t *testing.T) {
	build := func(entries map[string]string) *zip.Reader {
		var buf bytes.Buffer
		zw := zip.NewWriter(&buf)
		for name, body := range entries {
			w, _ := zw.Create(name)
			_, _ = w.Write([]byte(body))
		}
		_ = zw.Close()
		zr, _ := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
		return zr
	}
	id := uuid.New()
	cases := map[string]map[string]string{
		"not a bundle":   {"folder/page.md": "# hi"},
		"wrong format":   {"manifest.json": `{"format":"other","formatVersion":1,"bundleId":"` + id.String() + `"}`},
		"future version": {"manifest.json": `{"format":"vibe-wiki-bundle","formatVersion":99,"bundleId":"` + id.String() + `"}`},
		"parent not in bundle": {"manifest.json": `{"format":"vibe-wiki-bundle","formatVersion":1,"bundleId":"` + id.String() + `",
			"documents":[{"id":"` + uuid.New().String() + `","parentId":"` + uuid.New().String() + `","title":"x"}]}`},
		"missing content file": {"manifest.json": `{"format":"vibe-wiki-bundle","formatVersion":1,"bundleId":"` + id.String() + `",
			"documents":[{"id":"` + uuid.New().String() + `","title":"x","contentStateFile":"documents/nope.ystate"}]}`},
	}
	for name, entries := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := bundle.ReadPlan(build(entries)); err == nil {
				t.Fatal("expected an error")
			}
		})
	}
}
