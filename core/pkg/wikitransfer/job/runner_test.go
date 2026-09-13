package job_test

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer/bundle"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer/job"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer/markdown"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer/transfertest"
	"go.uber.org/zap"
)

type world struct {
	op        uuid.UUID
	caller    uuid.UUID
	docs      *transfertest.DocRepo
	jobs      *transfertest.JobRepo
	artifacts *transfertest.Store
	ingestor  *transfertest.Ingestor
	runner    *job.Runner
}

func newWorld(t *testing.T, ttl time.Duration) *world {
	t.Helper()
	w := &world{op: uuid.New(), caller: uuid.New()}
	root := models.WikiDocument{DocumentID: uuid.New(), OperationID: w.op, Title: "Root", SortOrder: "a", PathIDs: []uuid.UUID{}, ContentState: []byte("hello")}
	w.docs = transfertest.NewDocRepo(root)
	w.jobs = transfertest.NewJobRepo()
	w.artifacts = transfertest.NewStore()
	w.ingestor = transfertest.NewIngestor()
	ops := &transfertest.OperationRepo{Ops: map[uuid.UUID]models.Operation{w.op: {OperationID: w.op, Name: "ACME"}}}
	images, files := transfertest.NewImageRepo(), transfertest.NewFileRepo()
	blank := transfertest.NewStore()
	m := wikitransfer.NewMaterialiser(w.docs, nil, nil, nil, w.ingestor, &transfertest.Rebaser{}, nil, zap.NewNop())
	bw := bundle.NewWriter(images, files, blank, blank, nil, nil, nil, transfertest.Renderer{}, zap.NewNop(), bundle.Config{})
	me := markdown.NewExporter(images, files, blank, blank, transfertest.Renderer{}, nil, zap.NewNop(), markdown.Config{})
	w.runner = job.NewRunner(w.jobs, w.docs, ops, w.artifacts, m, bw, me, nil, zap.NewNop(), job.Config{ArtifactTTL: ttl, PollInterval: time.Hour})
	return w
}

// waitTerminal polls the fake repo until the job settles. The runner is
// started so Submit's wake drives execution exactly as in production.
func (w *world) waitTerminal(t *testing.T, id uuid.UUID) models.WikiTransferJob {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		j, err := w.jobs.FindByID(context.Background(), id)
		if err == nil && j.IsTerminal() {
			return j
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("job did not finish")
	return models.WikiTransferJob{}
}

func TestRunner_ExportProducesDownloadableBundle(t *testing.T) {
	w := newWorld(t, time.Hour)
	w.runner.Start()
	defer w.runner.Stop()

	j := &models.WikiTransferJob{OperationID: w.op, Kind: models.WikiTransferExport, Format: models.WikiTransferBundle, RequestedByID: w.caller}
	if err := w.runner.Submit(context.Background(), j); err != nil {
		t.Fatalf("Submit: %v", err)
	}
	done := w.waitTerminal(t, j.JobID)
	if done.Status != models.WikiTransferDone {
		t.Fatalf("status=%s error=%s", done.Status, done.Error)
	}
	if done.ArtifactKey != w.runner.ArtifactKey(j.JobID) || done.ArtifactSize == 0 || done.ArtifactName == "" {
		t.Errorf("artifact = %+v", done)
	}
	var report wikitransfer.ExportReport
	if err := json.Unmarshal(done.Report, &report); err != nil || report.ExportedDocs != 1 || report.Format != "bundle" {
		t.Errorf("report = %s (%v)", done.Report, err)
	}
	rc, _, err := w.artifacts.Get(context.Background(), done.ArtifactKey)
	if err != nil {
		t.Fatalf("artifact missing: %v", err)
	}
	b, _ := readAllClose(rc)
	zr, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	if err != nil || !bundle.IsBundle(zr) {
		t.Fatalf("artifact is not a bundle: %v", err)
	}
}

func TestRunner_ImportConsumesUploadAndMaterialises(t *testing.T) {
	w := newWorld(t, time.Hour)

	// Build an upload from a second world's export so the ids are foreign.
	src := newWorld(t, time.Hour)
	src.runner.Start()
	exp := &models.WikiTransferJob{OperationID: src.op, Kind: models.WikiTransferExport, Format: models.WikiTransferBundle, RequestedByID: src.caller}
	if err := src.runner.Submit(context.Background(), exp); err != nil {
		t.Fatal(err)
	}
	expDone := src.waitTerminal(t, exp.JobID)
	src.runner.Stop()
	rc, _, _ := src.artifacts.Get(context.Background(), expDone.ArtifactKey)
	archive, _ := readAllClose(rc)

	jobID := uuid.New()
	key := w.runner.UploadKey(jobID)
	if err := w.artifacts.Put(context.Background(), key, bytes.NewReader(archive), int64(len(archive)), "application/zip"); err != nil {
		t.Fatal(err)
	}
	w.runner.Start()
	defer w.runner.Stop()
	imp := &models.WikiTransferJob{
		JobID: jobID, OperationID: w.op, Kind: models.WikiTransferImport, RequestedByID: w.caller,
		Request: models.WikiTransferRequest{HoldingPen: true}, ArtifactKey: key,
	}
	if err := w.runner.Submit(context.Background(), imp); err != nil {
		t.Fatal(err)
	}
	done := w.waitTerminal(t, jobID)
	if done.Status != models.WikiTransferDone {
		t.Fatalf("status=%s error=%s", done.Status, done.Error)
	}
	if done.Format != models.WikiTransferBundle {
		t.Errorf("format should be detected as bundle, got %s", done.Format)
	}
	var report wikitransfer.ImportReport
	if err := json.Unmarshal(done.Report, &report); err != nil || report.CreatedDocs != 1 {
		t.Errorf("report = %s (%v)", done.Report, err)
	}
	// Holding pen: import/<ts>/Root.
	pen, ok := w.docs.ByTitle("import")
	if !ok {
		t.Fatal("holding pen root missing")
	}
	ts := w.docs.Children(w.op, &pen.DocumentID)
	if len(ts) != 1 || len(w.docs.Children(w.op, &ts[0].DocumentID)) != 1 {
		t.Error("imported page not under import/<timestamp>/")
	}
	if _, _, err := w.artifacts.Get(context.Background(), key); err == nil {
		t.Error("uploaded archive must be deleted once consumed")
	}
}

func TestRunner_ImportFailsCleanlyOnGarbage(t *testing.T) {
	w := newWorld(t, time.Hour)
	jobID := uuid.New()
	key := w.runner.UploadKey(jobID)
	_ = w.artifacts.Put(context.Background(), key, bytes.NewReader([]byte("not a zip")), 9, "application/zip")
	w.runner.Start()
	defer w.runner.Stop()
	imp := &models.WikiTransferJob{JobID: jobID, OperationID: w.op, Kind: models.WikiTransferImport, RequestedByID: w.caller, ArtifactKey: key}
	_ = w.runner.Submit(context.Background(), imp)
	done := w.waitTerminal(t, jobID)
	if done.Status != models.WikiTransferFailed || done.Error == "" {
		t.Errorf("expected a failed job with a message, got %+v", done)
	}
}

func TestRunner_SweepDeletesExpiredArtifacts(t *testing.T) {
	w := newWorld(t, time.Millisecond)
	w.runner.Start()
	j := &models.WikiTransferJob{OperationID: w.op, Kind: models.WikiTransferExport, Format: models.WikiTransferMarkdown, RequestedByID: w.caller}
	_ = w.runner.Submit(context.Background(), j)
	done := w.waitTerminal(t, j.JobID)
	w.runner.Stop()
	if done.Status != models.WikiTransferDone {
		t.Fatalf("status=%s error=%s", done.Status, done.Error)
	}
	time.Sleep(5 * time.Millisecond)

	// A fresh runner's first tick sweeps; drive it through the public
	// surface by starting with a tiny poll interval.
	w2 := job.NewRunner(w.jobs, w.docs, &transfertest.OperationRepo{}, w.artifacts, nil, nil, nil, nil, zap.NewNop(), job.Config{ArtifactTTL: time.Millisecond, PollInterval: 5 * time.Millisecond})
	w2.Start()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if _, err := w.jobs.FindByID(context.Background(), j.JobID); err != nil {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	w2.Stop()
	if _, err := w.jobs.FindByID(context.Background(), j.JobID); err == nil {
		t.Error("expired job row must be deleted")
	}
	if len(w.artifacts.Keys()) != 0 {
		t.Errorf("expired artifact must be deleted, have %v", w.artifacts.Keys())
	}
}

func TestExportFilename(t *testing.T) {
	at := time.Date(2026, 9, 12, 10, 0, 0, 0, time.UTC)
	if got := job.ExportFilename("ACME / 2026", models.WikiTransferBundle, at); got != "wiki-ACME-2026-20260912T100000Z.vibewiki.zip" {
		t.Errorf("bundle name = %q", got)
	}
	if got := job.ExportFilename("", models.WikiTransferMarkdown, at); got != "wiki-wiki-20260912T100000Z.md.zip" {
		t.Errorf("markdown name = %q", got)
	}
	if got := job.ExportFilename("Отчёт 2026", models.WikiTransferBundle, at); got != "wiki-Отчёт-2026-20260912T100000Z.vibewiki.zip" {
		t.Errorf("cyrillic name = %q", got)
	}
}

func readAllClose(rc interface {
	Read([]byte) (int, error)
	Close() error
}) ([]byte, error) {
	defer rc.Close()
	var buf bytes.Buffer
	_, err := buf.ReadFrom(rc)
	return buf.Bytes(), err
}
