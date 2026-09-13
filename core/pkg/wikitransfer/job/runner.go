// Package job runs wiki transfers in the background.
//
// A transfer is submitted as a WikiTransferJob row, claimed by one worker
// with an atomic status flip, and executed outside any HTTP request. Exports
// write a zip to a temp file and upload it to the blob store for the caller
// to download; imports read the caller's uploaded zip from the same store.
// Progress is written back to the row so a client can poll it; artifacts
// expire and are swept.
package job

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/blob"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer/bundle"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer/markdown"
	"go.uber.org/zap"
)

// Config tunes the runner.
type Config struct {
	// PollInterval is how often the worker looks for queued jobs when
	// nothing woke it. Default 15s.
	PollInterval time.Duration
	// ArtifactTTL is how long a finished job and its archive are kept.
	// Default 24h.
	ArtifactTTL time.Duration
	// StaleAfter marks a running job failed when its worker has not
	// finished within this window. Default 2h.
	StaleAfter time.Duration
	// ArtifactPrefix is the blob-store key prefix. Default "wiki-transfers/".
	ArtifactPrefix string
}

func (c Config) withDefaults() Config {
	if c.PollInterval <= 0 {
		c.PollInterval = 15 * time.Second
	}
	if c.ArtifactTTL <= 0 {
		c.ArtifactTTL = 24 * time.Hour
	}
	if c.StaleAfter <= 0 {
		c.StaleAfter = 2 * time.Hour
	}
	if c.ArtifactPrefix == "" {
		c.ArtifactPrefix = "wiki-transfers/"
	}
	return c
}

// Runner owns the worker loop.
type Runner struct {
	jobs         repository.IWikiTransferJobRepository
	docRepo      repository.IWikiDocumentRepository
	opRepo       repository.IOperationRepository
	artifacts    blob.ObjectStore
	materialiser *wikitransfer.Materialiser
	bundleWriter *bundle.Writer
	mdExporter   *markdown.Exporter
	bus          eventbus.IEventBus
	logger       *zap.Logger
	cfg          Config

	wake   chan struct{}
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// NewRunner wires the runner. It does not start the loop.
func NewRunner(
	jobs repository.IWikiTransferJobRepository,
	docRepo repository.IWikiDocumentRepository,
	opRepo repository.IOperationRepository,
	artifacts blob.ObjectStore,
	materialiser *wikitransfer.Materialiser,
	bundleWriter *bundle.Writer,
	mdExporter *markdown.Exporter,
	bus eventbus.IEventBus,
	logger *zap.Logger,
	cfg Config,
) *Runner {
	if logger == nil {
		logger = zap.NewNop()
	}
	ctx, cancel := context.WithCancel(context.Background())
	return &Runner{
		jobs: jobs, docRepo: docRepo, opRepo: opRepo, artifacts: artifacts,
		materialiser: materialiser, bundleWriter: bundleWriter, mdExporter: mdExporter,
		bus: bus, logger: logger, cfg: cfg.withDefaults(),
		wake: make(chan struct{}, 1), ctx: ctx, cancel: cancel,
	}
}

// ArtifactKey is where a job's archive lives in the blob store.
func (r *Runner) ArtifactKey(jobID uuid.UUID) string {
	return r.cfg.ArtifactPrefix + jobID.String() + ".zip"
}

// ArtifactTTL exposes the retention window for callers stamping expires_at.
func (r *Runner) ArtifactTTL() time.Duration {
	return r.cfg.ArtifactTTL
}

// Submit persists a queued job and wakes the worker.
func (r *Runner) Submit(ctx context.Context, job *models.WikiTransferJob) error {
	if job.JobID == uuid.Nil {
		job.JobID = uuid.New()
	}
	job.Status = models.WikiTransferQueued
	if job.ExpiresAt.IsZero() {
		job.ExpiresAt = time.Now().UTC().Add(r.cfg.ArtifactTTL)
	}
	if err := r.jobs.Create(ctx, job); err != nil {
		return err
	}
	r.Wake()
	return nil
}

// Wake nudges the loop to look for work now rather than at the next tick.
func (r *Runner) Wake() {
	select {
	case r.wake <- struct{}{}:
	default:
	}
}

// Start launches the worker goroutine.
func (r *Runner) Start() {
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		ticker := time.NewTicker(r.cfg.PollInterval)
		defer ticker.Stop()
		r.logger.Info("Wiki transfer runner started", zap.Duration("poll", r.cfg.PollInterval), zap.Duration("ttl", r.cfg.ArtifactTTL))
		r.drain()
		for {
			select {
			case <-r.ctx.Done():
				r.logger.Info("Wiki transfer runner stopped")
				return
			case <-r.wake:
				r.drain()
			case <-ticker.C:
				r.sweep()
				r.drain()
			}
		}
	}()
}

// Stop cancels the loop and waits for the current job to finish.
func (r *Runner) Stop() {
	r.cancel()
	r.wg.Wait()
}

// drain claims and runs queued jobs until none are left.
func (r *Runner) drain() {
	for {
		if r.ctx.Err() != nil {
			return
		}
		job, err := r.jobs.Claim(r.ctx, time.Now().UTC())
		if err != nil {
			if !errors.Is(err, repository.ErrNoQueuedJob) {
				r.logger.Warn("wiki transfer: claim failed", zap.Error(err))
			}
			return
		}
		r.execute(job)
	}
}

func (r *Runner) execute(job models.WikiTransferJob) {
	log := r.logger.With(zap.String("job_id", job.JobID.String()), zap.String("kind", string(job.Kind)), zap.String("format", string(job.Format)))
	log.Info("wiki transfer: job started")

	var (
		report any
		err    error
	)
	switch job.Kind {
	case models.WikiTransferExport:
		report, err = r.runExport(r.ctx, &job)
	case models.WikiTransferImport:
		report, err = r.runImport(r.ctx, &job)
	default:
		err = fmt.Errorf("unknown job kind %q", job.Kind)
	}

	now := time.Now().UTC()
	updates := map[string]any{"finished_at": now, "expires_at": now.Add(r.cfg.ArtifactTTL)}
	if report != nil {
		if raw, merr := json.Marshal(report); merr == nil {
			updates["report"] = raw
		}
	}
	if err != nil {
		updates["status"] = models.WikiTransferFailed
		updates["error"] = err.Error()
		log.Warn("wiki transfer: job failed", zap.Error(err))
	} else {
		updates["status"] = models.WikiTransferDone
		log.Info("wiki transfer: job done")
	}
	if job.Kind == models.WikiTransferExport && err == nil {
		updates["artifact_key"] = job.ArtifactKey
		updates["artifact_name"] = job.ArtifactName
		updates["artifact_size"] = job.ArtifactSize
	}
	// Persist with a fresh context: the runner's context may be cancelled
	// by shutdown and the row must still record what happened.
	pctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if uerr := r.jobs.Update(pctx, job.JobID, updates); uerr != nil {
		log.Error("wiki transfer: persist result failed", zap.Error(uerr))
	}
}

// progressWriter throttles progress updates to one per second so a large
// import does not hammer the job row.
func (r *Runner) progressWriter(jobID uuid.UUID) wikitransfer.Progress {
	var last time.Time
	return func(done, total int) {
		if done != total && time.Since(last) < time.Second {
			return
		}
		last = time.Now()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = r.jobs.Update(ctx, jobID, map[string]any{"progress": models.WikiTransferProgress{Done: done, Total: total}})
	}
}

func (r *Runner) runExport(ctx context.Context, job *models.WikiTransferJob) (any, error) {
	op, err := r.opRepo.FindByID(ctx, job.OperationID)
	if err != nil {
		return nil, fmt.Errorf("operation not found: %w", err)
	}
	scope, err := wikitransfer.CollectScope(ctx, r.docRepo, job.OperationID, op.Name, job.Request.RootDocumentID)
	if err != nil {
		return nil, err
	}
	r.progressWriter(job.JobID)(0, len(scope.Docs))

	tmp, err := os.CreateTemp("", "wiki-export-*.zip")
	if err != nil {
		return nil, fmt.Errorf("temp file: %w", err)
	}
	defer func() {
		_ = tmp.Close()
		_ = os.Remove(tmp.Name())
	}()

	zw := zip.NewWriter(tmp)
	var report any
	switch job.Format {
	case models.WikiTransferBundle:
		if r.bundleWriter == nil {
			return nil, errors.New("bundle export is not configured")
		}
		report, err = r.bundleWriter.Run(ctx, zw, scope, bundle.Options{IncludeCredentials: job.Request.IncludeCredentials}, r.progressWriter(job.JobID))
	case models.WikiTransferMarkdown:
		if r.mdExporter == nil {
			return nil, errors.New("markdown export is not configured")
		}
		report, err = r.mdExporter.Run(ctx, zw, scope, r.progressWriter(job.JobID))
	default:
		err = fmt.Errorf("unknown export format %q", job.Format)
	}
	if cerr := zw.Close(); cerr != nil && err == nil {
		err = fmt.Errorf("close zip: %w", cerr)
	}
	if err != nil {
		return report, err
	}

	size, err := tmp.Seek(0, io.SeekEnd)
	if err != nil {
		return report, fmt.Errorf("size temp file: %w", err)
	}
	if _, err := tmp.Seek(0, io.SeekStart); err != nil {
		return report, fmt.Errorf("rewind temp file: %w", err)
	}
	key := r.ArtifactKey(job.JobID)
	putCtx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	if err := r.artifacts.Put(putCtx, key, tmp, size, "application/zip"); err != nil {
		return report, fmt.Errorf("store artifact: %w", err)
	}
	job.ArtifactKey = key
	job.ArtifactName = ExportFilename(scope.Title(), job.Format, time.Now().UTC())
	job.ArtifactSize = size
	return report, nil
}

func (r *Runner) runImport(ctx context.Context, job *models.WikiTransferJob) (any, error) {
	if job.ArtifactKey == "" {
		return nil, errors.New("import job has no uploaded archive")
	}
	tmp, err := r.spoolArtifact(ctx, job.ArtifactKey)
	if err != nil {
		return nil, err
	}
	defer func() {
		_ = tmp.Close()
		_ = os.Remove(tmp.Name())
	}()
	zr, err := zip.OpenReader(tmp.Name())
	if err != nil {
		return nil, fmt.Errorf("invalid zip: %w", err)
	}
	defer zr.Close()

	var plan *wikitransfer.Plan
	if bundle.IsBundle(&zr.Reader) {
		plan, err = bundle.ReadPlan(&zr.Reader)
		if job.Format != models.WikiTransferBundle {
			_ = r.jobs.Update(ctx, job.JobID, map[string]any{"format": models.WikiTransferBundle})
		}
	} else {
		plan, err = markdown.ReadPlan(&zr.Reader)
		if job.Format != models.WikiTransferMarkdown {
			_ = r.jobs.Update(ctx, job.JobID, map[string]any{"format": models.WikiTransferMarkdown})
		}
	}
	if err != nil {
		return nil, fmt.Errorf("read archive: %w", err)
	}

	target := wikitransfer.Target{
		OperationID: job.OperationID,
		CallerID:    job.RequestedByID,
		ParentID:    job.Request.TargetParentID,
	}
	if job.Request.HoldingPen {
		pen, perr := wikitransfer.EnsureHoldingPen(ctx, r.docRepo, r.bus, job.OperationID, job.RequestedByID, time.Now().UTC())
		if perr != nil {
			return nil, perr
		}
		id := pen.TimestampID
		target.ParentID = &id
	}

	report, err := r.materialiser.Run(ctx, plan, target, r.progressWriter(job.JobID))
	// The upload has served its purpose either way; an operator retries
	// by uploading again.
	dctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if derr := r.artifacts.Delete(dctx, job.ArtifactKey); derr != nil {
		r.logger.Warn("wiki transfer: delete uploaded archive failed", zap.String("key", job.ArtifactKey), zap.Error(derr))
	}
	if report == nil {
		return nil, err
	}
	return report, err
}

// spoolArtifact copies a blob to a temp file: archive/zip needs a ReaderAt.
func (r *Runner) spoolArtifact(ctx context.Context, key string) (*os.File, error) {
	reader, _, err := r.artifacts.Get(ctx, key)
	if err != nil {
		return nil, fmt.Errorf("fetch uploaded archive: %w", err)
	}
	defer reader.Close()
	tmp, err := os.CreateTemp("", "wiki-import-*.zip")
	if err != nil {
		return nil, fmt.Errorf("temp file: %w", err)
	}
	if _, err := io.Copy(tmp, reader); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmp.Name())
		return nil, fmt.Errorf("spool uploaded archive: %w", err)
	}
	return tmp, nil
}

// sweep deletes expired artifacts and their rows, and fails jobs whose
// worker vanished mid-run.
func (r *Runner) sweep() {
	ctx, cancel := context.WithTimeout(r.ctx, time.Minute)
	defer cancel()
	now := time.Now().UTC()

	expired, err := r.jobs.FindExpired(ctx, now, 100)
	if err != nil {
		r.logger.Warn("wiki transfer: list expired jobs failed", zap.Error(err))
	}
	for _, j := range expired {
		if j.ArtifactKey != "" {
			if err := r.artifacts.Delete(ctx, j.ArtifactKey); err != nil {
				r.logger.Warn("wiki transfer: delete expired artifact failed", zap.String("key", j.ArtifactKey), zap.Error(err))
				continue
			}
		}
		if err := r.jobs.Delete(ctx, j.JobID); err != nil {
			r.logger.Warn("wiki transfer: delete expired job failed", zap.String("job_id", j.JobID.String()), zap.Error(err))
		}
	}

	stale, err := r.jobs.FindStale(ctx, now.Add(-r.cfg.StaleAfter), 100)
	if err != nil {
		r.logger.Warn("wiki transfer: list stale jobs failed", zap.Error(err))
	}
	for _, j := range stale {
		_ = r.jobs.Update(ctx, j.JobID, map[string]any{
			"status":      models.WikiTransferFailed,
			"error":       "worker did not finish; the process may have restarted mid-run",
			"finished_at": now,
		})
	}
}

// filenameUnsafe strips everything but letters and digits (any script),
// dots, underscores and dashes. The download header carries the name as
// UTF-8 (filename*), so a Cyrillic operation name survives as itself.
var filenameUnsafe = regexp.MustCompile(`[^\p{L}\p{N}._-]+`)

// ExportFilename is the browser-safe download name for an export.
func ExportFilename(title string, format models.WikiTransferFormat, at time.Time) string {
	stem := filenameUnsafe.ReplaceAllString(strings.TrimSpace(title), "-")
	stem = strings.Trim(stem, "-")
	if runes := []rune(stem); len(runes) > 60 {
		stem = string(runes[:60])
	}
	if stem == "" {
		stem = "wiki"
	}
	ts := at.Format("20060102T150405Z")
	if format == models.WikiTransferBundle {
		return "wiki-" + stem + "-" + ts + bundle.Extension
	}
	return "wiki-" + stem + "-" + ts + ".md.zip"
}

// UploadKey is where an uploaded import archive is staged before its job
// runs. Kept apart from export artifacts so a listing is self-explanatory.
func (r *Runner) UploadKey(jobID uuid.UUID) string {
	return path.Join(strings.TrimSuffix(r.cfg.ArtifactPrefix, "/"), "uploads", jobID.String()+".zip")
}
