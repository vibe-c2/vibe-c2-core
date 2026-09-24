package markdown

import (
	"archive/zip"
	"bytes"
	"context"
	"io"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer/transfertest"
	"go.uber.org/zap"
)

// exportWorld is a two-level tree with every kind of reference the
// exporter has to lower for a foreign editor:
//
//	Network/            (branch, links to its child, a sibling, a host,
//	                     a hash and a page outside the scope)
//	  Peering           (leaf, links back up to the sibling and embeds
//	                     an image)
//	Hosts               (leaf)
type exportWorld struct {
	op                       uuid.UUID
	network, peering, hosts  models.WikiDocument
	outside, public, foreign models.WikiDocument
	hostID, hashID, imageID  uuid.UUID
	scope                    *wikitransfer.Scope
	exporter                 *Exporter
}

func newExportWorld(t *testing.T) *exportWorld {
	t.Helper()
	w := &exportWorld{op: uuid.New(), hostID: uuid.New(), hashID: uuid.New(), imageID: uuid.New()}
	w.network = models.WikiDocument{DocumentID: uuid.New(), OperationID: w.op, Title: "Network", SortOrder: "a"}
	w.peering = models.WikiDocument{DocumentID: uuid.New(), OperationID: w.op, Title: "Peering / IX", SortOrder: "a", ParentDocumentID: &w.network.DocumentID}
	w.hosts = models.WikiDocument{DocumentID: uuid.New(), OperationID: w.op, Title: "Hosts", SortOrder: "b"}
	w.outside = models.WikiDocument{DocumentID: uuid.New(), OperationID: w.op, Title: "Runbook", SortOrder: "c"}
	w.public = models.WikiDocument{DocumentID: uuid.New(), OperationID: models.PublicOperationID, Title: "BGP cheat sheet"}
	w.foreign = models.WikiDocument{DocumentID: uuid.New(), OperationID: uuid.New(), Title: "Other op secret"}

	w.network.ContentState = []byte("Dual [host](vibe://host/" + w.hostID.String() + ") edge peering " +
		"[page](vibe://doc/" + w.peering.DocumentID.String() + ") and " +
		"[page](vibe://doc/" + w.hosts.DocumentID.String() + "), see " +
		"[page](vibe://doc/" + w.outside.DocumentID.String() + "), " +
		"[page](vibe://doc/" + w.public.DocumentID.String() + "), " +
		"[page](vibe://doc/" + w.foreign.DocumentID.String() + "). NTLM [hash](vibe://hash/" + w.hashID.String() + ")\n")
	w.peering.ContentState = []byte("Back to [page](vibe://doc/" + w.hosts.DocumentID.String() + ")\n\n" +
		"![diagram](/api/v1/wiki/images/" + w.imageID.String() + ")\n")
	w.hosts.ContentState = []byte("plain\n")

	w.scope = &wikitransfer.Scope{
		OperationID:   w.op,
		OperationName: "ACME",
		Docs:          []models.WikiDocument{w.network, w.peering, w.hosts},
		TopLevel:      []models.WikiDocument{w.network, w.hosts},
		ChildrenByParent: map[uuid.UUID][]models.WikiDocument{
			w.network.DocumentID: {w.peering},
		},
	}

	imageStore := transfertest.NewStore()
	if err := imageStore.Put(context.Background(), "img-key", bytes.NewReader([]byte("png")), 3, "image/png"); err != nil {
		t.Fatal(err)
	}
	images := transfertest.NewImageRepo(models.WikiImage{
		ImageID: w.imageID, OperationID: w.op, DocumentID: w.peering.DocumentID,
		ObjectKey: "img-key", ContentType: "image/png", SizeBytes: 3,
	})
	docs := transfertest.NewDocRepo(w.network, w.peering, w.hosts, w.outside, w.public, w.foreign)
	hostRepo := &transfertest.HostRepo{Hosts: map[uuid.UUID]models.Host{
		w.hostID: {HostID: w.hostID, OperationID: w.op, Hostname: "in-bgp01"},
	}}
	hashRepo := &transfertest.HashRepo{Hashes: map[uuid.UUID]models.Hash{
		w.hashID: {HashID: w.hashID, OperationID: w.op, Value: "aad3b435b51404ee"},
	}}
	w.exporter = NewExporter(images, transfertest.NewFileRepo(), imageStore, transfertest.NewStore(),
		docs, hostRepo, hashRepo, transfertest.Renderer{}, nil, zap.NewNop(), Config{})
	return w
}

func (w *exportWorld) run(t *testing.T) (map[string]string, *wikitransfer.ExportReport) {
	t.Helper()
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	report, err := w.exporter.Run(context.Background(), zw, w.scope, nil)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	zr, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatal(err)
	}
	entries := map[string]string{}
	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			t.Fatal(err)
		}
		data, _ := io.ReadAll(rc)
		_ = rc.Close()
		entries[f.Name] = string(data)
	}
	return entries, report
}

func TestExport_ForeignMarkdownLinks(t *testing.T) {
	w := newExportWorld(t)
	entries, report := w.run(t)

	network, ok := entries["acme/001-network.md"]
	if !ok {
		t.Fatalf("missing branch page; entries: %v", keys(entries))
	}
	peering, ok := entries["acme/001-network/001-peering-ix.md"]
	if !ok {
		t.Fatalf("missing child page; entries: %v", keys(entries))
	}

	wantNetwork := "Dual in-bgp01 edge peering [Peering / IX](001-network/001-peering-ix.md) and [Hosts](002-hosts.md), see Runbook, BGP cheat sheet, page. NTLM aad3b435b51404ee"
	if !strings.Contains(network, wantNetwork) {
		t.Errorf("branch body:\n%s\nwant to contain:\n%s", network, wantNetwork)
	}
	wantPeering := "Back to [Hosts](../002-hosts.md)"
	if !strings.Contains(peering, wantPeering) {
		t.Errorf("child body:\n%s\nwant to contain:\n%s", peering, wantPeering)
	}
	wantImage := "![diagram](../uploads/" + w.peering.DocumentID.String() + "/" + w.imageID.String() + "/" + w.imageID.String() + ".png)"
	if !strings.Contains(peering, wantImage) {
		t.Errorf("child body:\n%s\nwant image link:\n%s", peering, wantImage)
	}
	if _, ok := entries["acme/uploads/"+w.peering.DocumentID.String()+"/"+w.imageID.String()+"/"+w.imageID.String()+".png"]; !ok {
		t.Errorf("image blob not in zip; entries: %v", keys(entries))
	}

	for name, body := range entries {
		if strings.Contains(body, "vibe://") {
			t.Errorf("%s leaks the vibe:// scheme:\n%s", name, body)
		}
	}
	if report.ExportedDocs != 3 || report.ImagesExported != 1 {
		t.Errorf("report = %+v", report)
	}
	if !hasWarning(report, "page_reference_outside_scope: "+w.outside.DocumentID.String()) ||
		!hasWarning(report, "page_reference_outside_scope: "+w.public.DocumentID.String()) {
		t.Errorf("expected outside-scope warnings, got %+v", report.Warnings)
	}
	if !hasWarning(report, "page_reference_unresolved: "+w.foreign.DocumentID.String()) {
		t.Errorf("a page of another operation must not leak its title, got %+v", report.Warnings)
	}
}

// A Vibe markdown zip fed back through the foreign importer must degrade
// gracefully: relative page links stay ordinary links, and attachments
// linked by `../uploads/…` are still ingested.
func TestExport_ReimportsAsPlainMarkdown(t *testing.T) {
	w := newExportWorld(t)
	entries, _ := w.run(t)

	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, body := range entries {
		f, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := f.Write([]byte(body)); err != nil {
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	zr, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatal(err)
	}

	plan, err := ReadPlan(zr)
	if err != nil {
		t.Fatalf("ReadPlan: %v", err)
	}
	if len(plan.Attachments) != 1 {
		t.Fatalf("attachments = %d, want 1", len(plan.Attachments))
	}
	var peering *wikitransfer.Page
	plan.Walk(func(p *wikitransfer.Page, _ int) {
		if p.Title == "Peering / IX" {
			peering = p
		}
	})
	if peering == nil {
		t.Fatalf("peering page not imported; plan: %+v", plan.Pages)
	}
	if strings.Contains(peering.Markdown, "uploads/") {
		t.Errorf("attachment link not rewritten to canonical URL:\n%s", peering.Markdown)
	}
	if !strings.Contains(peering.Markdown, "[Hosts](../002-hosts.md)") {
		t.Errorf("relative page link should survive as a plain link:\n%s", peering.Markdown)
	}
}

func hasWarning(r *wikitransfer.ExportReport, reason string) bool {
	for _, w := range r.Warnings {
		if w.Reason == reason {
			return true
		}
	}
	return false
}

func keys(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
