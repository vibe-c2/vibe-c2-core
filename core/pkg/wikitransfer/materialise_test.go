package wikitransfer_test

import (
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

type harness struct {
	docs     *transfertest.DocRepo
	creds    *transfertest.CredentialRepo
	hosts    *transfertest.HostRepo
	ingestor *transfertest.Ingestor
	rebaser  *transfertest.Rebaser
	m        *wikitransfer.Materialiser
}

func newHarness() *harness {
	h := &harness{
		docs:     transfertest.NewDocRepo(),
		creds:    transfertest.NewCredentialRepo(),
		hosts:    &transfertest.HostRepo{Hosts: map[uuid.UUID]models.Host{}},
		ingestor: transfertest.NewIngestor(),
		rebaser:  &transfertest.Rebaser{},
	}
	h.m = wikitransfer.NewMaterialiser(h.docs, h.creds, h.hosts, nil, h.ingestor, h.rebaser, nil, zap.NewNop())
	return h
}

func blobAttachment(id uuid.UUID, kind wikitransfer.AttachmentKind, name, body string) *wikitransfer.Attachment {
	return &wikitransfer.Attachment{
		ID: id, Kind: kind, Filename: name, ContentType: "application/octet-stream", SizeBytes: int64(len(body)),
		Open: func() (io.ReadCloser, error) { return io.NopCloser(strings.NewReader(body)), nil },
	}
}

// twoPagePlan builds: root (with an image and a link to the child) → child
// (with a file, a host chip and a credential chip).
func twoPagePlan(sourceOp uuid.UUID) (*wikitransfer.Plan, map[string]uuid.UUID) {
	ids := map[string]uuid.UUID{
		"root": uuid.New(), "child": uuid.New(), "img": uuid.New(), "file": uuid.New(),
		"host": uuid.New(), "cred": uuid.New(),
	}
	child := &wikitransfer.Page{
		SourceID: ids["child"], Title: "Child", SortOrder: "b",
		ContentState: []byte("file /api/v1/wiki/files/" + ids["file"].String() + " host:" + ids["host"].String() + " cred:" + ids["cred"].String() + " checklist"),
		Attachments:  []uuid.UUID{ids["file"]},
		HostRefs:     []uuid.UUID{ids["host"]},
	}
	root := &wikitransfer.Page{
		SourceID: ids["root"], Title: "Root", Emoji: "🚀", SortOrder: "a",
		ContentState: []byte("see doc:" + ids["child"].String() + " and /api/v1/wiki/images/" + ids["img"].String()),
		Attachments:  []uuid.UUID{ids["img"]},
		Children:     []*wikitransfer.Page{child},
	}
	plan := &wikitransfer.Plan{
		BundleID:          uuid.New(),
		SourceOperationID: sourceOp,
		Pages:             []*wikitransfer.Page{root},
		Attachments: map[uuid.UUID]*wikitransfer.Attachment{
			ids["img"]:  blobAttachment(ids["img"], wikitransfer.AttachmentImage, "pic.png", "PNG"),
			ids["file"]: blobAttachment(ids["file"], wikitransfer.AttachmentFile, "notes.pdf", "PDF"),
		},
		Credentials: map[uuid.UUID]wikitransfer.CredentialPayload{
			ids["cred"]: {ID: ids["cred"].String(), Name: "svc", Type: "password", Username: "u", Password: "p"},
		},
	}
	return plan, ids
}

func TestMaterialise_CrossOperation_RemapsAndIndexes(t *testing.T) {
	h := newHarness()
	sourceOp, targetOp, caller := uuid.New(), uuid.New(), uuid.New()
	plan, ids := twoPagePlan(sourceOp)

	report, err := h.m.Run(context.Background(), plan, wikitransfer.Target{OperationID: targetOp, CallerID: caller}, nil)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if report.CreatedDocs != 2 || report.SkippedDocs != 0 {
		t.Fatalf("created=%d skipped=%d (%v)", report.CreatedDocs, report.SkippedDocs, report.Skipped)
	}
	if len(report.RootIDs) != 1 {
		t.Fatalf("RootIDs = %v", report.RootIDs)
	}

	root, ok := h.docs.ByTitle("Root")
	if !ok {
		t.Fatal("root not created")
	}
	child, ok := h.docs.ByTitle("Child")
	if !ok {
		t.Fatal("child not created")
	}

	// Fresh ids, correct tree, provenance stamped.
	if root.DocumentID == ids["root"] || child.DocumentID == ids["child"] {
		t.Error("pages kept their source ids")
	}
	if child.ParentDocumentID == nil || *child.ParentDocumentID != root.DocumentID {
		t.Error("child not parented to root")
	}
	if len(child.PathIDs) != 1 || child.PathIDs[0] != root.DocumentID {
		t.Errorf("child path_ids = %v", child.PathIDs)
	}
	if root.ImportOrigin == nil || root.ImportOrigin.SourceDocumentID != ids["root"] || root.ImportOrigin.BundleID != plan.BundleID {
		t.Errorf("import origin = %+v", root.ImportOrigin)
	}
	if root.Emoji != "🚀" || child.Icon != wikitransfer.DefaultDocumentIcon {
		t.Errorf("emoji/icon: root=%q child=%q", root.Emoji, child.Icon)
	}

	// Page link rewritten to the child's new id and indexed.
	if !strings.Contains(root.Content, "doc:"+child.DocumentID.String()) {
		t.Errorf("root body not remapped: %s", root.Content)
	}
	if len(root.References) != 1 || root.References[0] != child.DocumentID {
		t.Errorf("root references = %v", root.References)
	}

	// Attachments ingested under pre-allocated ids that the body now uses.
	if len(root.ImageReferences) != 1 {
		t.Fatalf("root image refs = %v", root.ImageReferences)
	}
	if _, ok := h.ingestor.Images[root.ImageReferences[0]]; !ok {
		t.Error("image not ingested under the id the body references")
	}
	if h.ingestor.Owners[root.ImageReferences[0]] != root.DocumentID {
		t.Error("image not owned by root")
	}
	if len(child.FileReferences) != 1 || h.ingestor.Filenames[child.FileReferences[0]] != "notes.pdf" {
		t.Errorf("child file refs = %v", child.FileReferences)
	}
	if report.ImagesIngested != 1 || report.FilesIngested != 1 {
		t.Errorf("ingested images=%d files=%d", report.ImagesIngested, report.FilesIngested)
	}

	// Cross-operation host chip dropped (unknown on target); credential
	// created on target and remapped.
	if strings.Contains(child.Content, "host:") {
		t.Errorf("host chip should have been dropped: %s", child.Content)
	}
	if len(child.HostReferences) != 0 {
		t.Errorf("host refs = %v", child.HostReferences)
	}
	if report.CredentialsCreated != 1 || len(child.CredentialReferences) != 1 {
		t.Fatalf("credentials created=%d refs=%v", report.CredentialsCreated, child.CredentialReferences)
	}
	created, err := h.creds.FindByID(context.Background(), child.CredentialReferences[0])
	if err != nil || created.OperationID != targetOp || created.Username != "u" {
		t.Errorf("created credential = %+v err=%v", created, err)
	}
	if child.ChecklistTotal != 1 || child.ChecklistAnswered != 1 {
		t.Errorf("checklist counters not applied: %+v", child)
	}
	if child.ContentStateSchemaVersion != 1 || child.ContentStateAt == nil {
		t.Error("content_state metadata not set")
	}
	if report.ChipsDropped != 1 {
		t.Errorf("ChipsDropped = %d", report.ChipsDropped)
	}
}

func TestMaterialise_SameOperation_KeepsHostAndReusesCredential(t *testing.T) {
	h := newHarness()
	op, caller := uuid.New(), uuid.New()
	plan, ids := twoPagePlan(op)
	h.creds.Creds[ids["cred"]] = models.Credential{CredentialID: ids["cred"], OperationID: op, Name: "existing"}

	report, err := h.m.Run(context.Background(), plan, wikitransfer.Target{OperationID: op, CallerID: caller}, nil)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	child, _ := h.docs.ByTitle("Child")
	if !strings.Contains(child.Content, "host:"+ids["host"].String()) {
		t.Errorf("same-op host chip should be kept: %s", child.Content)
	}
	if report.CredentialsReused != 1 || report.CredentialsCreated != 0 {
		t.Errorf("reused=%d created=%d", report.CredentialsReused, report.CredentialsCreated)
	}
	if len(child.CredentialReferences) != 1 || child.CredentialReferences[0] != ids["cred"] {
		t.Errorf("credential refs = %v", child.CredentialReferences)
	}
}

func TestMaterialise_CrossOperation_KeepsHostThatExistsOnTarget(t *testing.T) {
	h := newHarness()
	targetOp := uuid.New()
	plan, ids := twoPagePlan(uuid.New())
	h.hosts.Hosts[ids["host"]] = models.Host{HostID: ids["host"], OperationID: targetOp}

	if _, err := h.m.Run(context.Background(), plan, wikitransfer.Target{OperationID: targetOp, CallerID: uuid.New()}, nil); err != nil {
		t.Fatalf("Run: %v", err)
	}
	child, _ := h.docs.ByTitle("Child")
	if len(child.HostReferences) != 1 || child.HostReferences[0] != ids["host"] {
		t.Errorf("host that exists on target should be kept: %v", child.HostReferences)
	}
}

func TestMaterialise_PublicOperation_DropsCredentialsAndPrivateIndexes(t *testing.T) {
	h := newHarness()
	plan, _ := twoPagePlan(uuid.New())
	report, err := h.m.Run(context.Background(), plan, wikitransfer.Target{OperationID: models.PublicOperationID, CallerID: uuid.New()}, nil)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	child, _ := h.docs.ByTitle("Child")
	if strings.Contains(child.Content, "cred:") {
		t.Errorf("credential chip must be dropped on the public tree: %s", child.Content)
	}
	if len(child.CredentialReferences) != 0 || len(child.HostReferences) != 0 || len(child.HashReferences) != 0 {
		t.Error("private indexes must stay empty on the public tree")
	}
	if report.CredentialsCreated != 0 || len(h.creds.Creds) != 0 {
		t.Error("no credentials may be created on the public tree")
	}
}

func TestMaterialise_TargetParentAndSiblingOrder(t *testing.T) {
	h := newHarness()
	op, caller := uuid.New(), uuid.New()
	parent := models.WikiDocument{DocumentID: uuid.New(), OperationID: op, Title: "Parent", PathIDs: []uuid.UUID{}}
	existing := models.WikiDocument{DocumentID: uuid.New(), OperationID: op, Title: "Existing", ParentDocumentID: &parent.DocumentID, PathIDs: []uuid.UUID{parent.DocumentID}, SortOrder: "m"}
	h.docs.Docs = append(h.docs.Docs, parent, existing)

	plan, _ := twoPagePlan(uuid.New())
	report, err := h.m.Run(context.Background(), plan, wikitransfer.Target{OperationID: op, CallerID: caller, ParentID: &parent.DocumentID}, nil)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if report.TargetParentID == nil || *report.TargetParentID != parent.DocumentID {
		t.Error("report should name the target parent")
	}
	children := h.docs.Children(op, &parent.DocumentID)
	if len(children) != 2 || children[0].Title != "Existing" || children[1].Title != "Root" {
		var titles []string
		for _, c := range children {
			titles = append(titles, c.Title+"@"+c.SortOrder)
		}
		t.Errorf("imported root must sort after existing children: %v", titles)
	}
	root, _ := h.docs.ByTitle("Root")
	if len(root.PathIDs) != 1 || root.PathIDs[0] != parent.DocumentID {
		t.Errorf("root path_ids = %v", root.PathIDs)
	}
}

func TestMaterialise_RejectsBadTargetParent(t *testing.T) {
	h := newHarness()
	op := uuid.New()
	other := models.WikiDocument{DocumentID: uuid.New(), OperationID: uuid.New(), Title: "Elsewhere"}
	h.docs.Docs = append(h.docs.Docs, other)
	plan, _ := twoPagePlan(uuid.New())
	if _, err := h.m.Run(context.Background(), plan, wikitransfer.Target{OperationID: op, CallerID: uuid.New(), ParentID: &other.DocumentID}, nil); err == nil {
		t.Fatal("expected an error for a parent in another operation")
	}
}

func TestMaterialise_RebaseFailureSkipsSubtreeAndDiscardsAttachments(t *testing.T) {
	h := newHarness()
	h.rebaser.FailBodyContaining = "see doc:"
	plan, _ := twoPagePlan(uuid.New())
	var progress []int
	report, err := h.m.Run(context.Background(), plan, wikitransfer.Target{OperationID: uuid.New(), CallerID: uuid.New()}, func(done, total int) {
		progress = append(progress, done)
		if total != 2 {
			t.Errorf("total = %d", total)
		}
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if report.CreatedDocs != 0 || report.SkippedDocs != 2 {
		t.Fatalf("created=%d skipped=%d", report.CreatedDocs, report.SkippedDocs)
	}
	if len(report.Skipped) != 2 || !strings.HasPrefix(report.Skipped[0].Reason, "rebase_failed") || report.Skipped[1].Reason != "parent_skipped" {
		t.Errorf("skipped = %+v", report.Skipped)
	}
	if len(h.ingestor.Images) != 0 || len(h.ingestor.Discarded) != 1 {
		t.Errorf("ingested image must be discarded: images=%d discarded=%v", len(h.ingestor.Images), h.ingestor.Discarded)
	}
	if len(progress) != 2 || progress[1] != 2 {
		t.Errorf("progress = %v", progress)
	}
}

func TestMaterialise_CreateFailureDiscardsAttachments(t *testing.T) {
	h := newHarness()
	h.docs.FailCreateTitle = "Child"
	plan, _ := twoPagePlan(uuid.New())
	report, err := h.m.Run(context.Background(), plan, wikitransfer.Target{OperationID: uuid.New(), CallerID: uuid.New()}, nil)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if report.CreatedDocs != 1 || report.SkippedDocs != 1 {
		t.Fatalf("created=%d skipped=%d", report.CreatedDocs, report.SkippedDocs)
	}
	if len(h.ingestor.Files) != 0 {
		t.Error("child's file must be discarded when the child cannot be created")
	}
}

func TestMaterialise_DepthCap(t *testing.T) {
	h := newHarness()
	op := uuid.New()
	// Build a 10-deep chain on the target; importing beneath the leaf must
	// fail the whole plan, since even the first page would exceed the cap.
	var parent *uuid.UUID
	var path []uuid.UUID
	for i := 0; i < 10; i++ {
		d := models.WikiDocument{DocumentID: uuid.New(), OperationID: op, Title: "L", ParentDocumentID: parent, PathIDs: append([]uuid.UUID(nil), path...)}
		h.docs.Docs = append(h.docs.Docs, d)
		id := d.DocumentID
		parent = &id
		path = append(path, id)
	}
	plan, _ := twoPagePlan(uuid.New())
	report, err := h.m.Run(context.Background(), plan, wikitransfer.Target{OperationID: op, CallerID: uuid.New(), ParentID: parent}, nil)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if report.CreatedDocs != 0 || report.SkippedDocs != 2 || report.Skipped[0].Reason != "depth_exceeded" {
		t.Errorf("report = %+v", report)
	}
}

func TestMaterialise_EmptyPageNeedsNoSidecar(t *testing.T) {
	h := newHarness()
	plan := &wikitransfer.Plan{BundleID: uuid.New(), Pages: []*wikitransfer.Page{{SourceID: uuid.New(), Title: "Folder"}}}
	report, err := h.m.Run(context.Background(), plan, wikitransfer.Target{OperationID: uuid.New(), CallerID: uuid.New()}, nil)
	if err != nil || report.CreatedDocs != 1 {
		t.Fatalf("err=%v report=%+v", err, report)
	}
	if len(h.rebaser.Calls) != 0 {
		t.Error("an empty page must not call the sidecar")
	}
}

func TestMaterialise_TombstonedCredentialIsDropped(t *testing.T) {
	h := newHarness()
	plan, ids := twoPagePlan(uuid.New())
	delete(plan.Credentials, ids["cred"])
	plan.CredentialTombstones = []uuid.UUID{ids["cred"]}
	report, err := h.m.Run(context.Background(), plan, wikitransfer.Target{OperationID: uuid.New(), CallerID: uuid.New()}, nil)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	child, _ := h.docs.ByTitle("Child")
	if strings.Contains(child.Content, "cred:") || report.CredentialsTombstoned != 1 {
		t.Errorf("tombstone must lower the chip: content=%q tombstoned=%d", child.Content, report.CredentialsTombstoned)
	}
}

func TestEnsureHoldingPen_ReusesRootCreatesTimestamp(t *testing.T) {
	docs := transfertest.NewDocRepo()
	op, caller := uuid.New(), uuid.New()
	ctx := context.Background()

	first, err := wikitransfer.EnsureHoldingPen(ctx, docs, nil, op, caller, mustTime("2026-09-12T10:00:00Z"))
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	second, err := wikitransfer.EnsureHoldingPen(ctx, docs, nil, op, caller, mustTime("2026-09-12T11:00:00Z"))
	if err != nil {
		t.Fatalf("second: %v", err)
	}
	if !first.ImportRootFresh || second.ImportRootFresh {
		t.Error("import root must be created once and reused")
	}
	if first.ImportRootID != second.ImportRootID || first.TimestampID == second.TimestampID {
		t.Error("timestamp folders must be distinct under one root")
	}
	if len(docs.Docs) != 3 {
		t.Errorf("expected 3 docs (root + 2 timestamps), got %d", len(docs.Docs))
	}
	ts, _ := docs.FindByID(ctx, second.TimestampID)
	if ts.Title != "2026-09-12T11:00:00Z" || ts.ParentDocumentID == nil || *ts.ParentDocumentID != first.ImportRootID {
		t.Errorf("timestamp folder = %+v", ts)
	}
}
