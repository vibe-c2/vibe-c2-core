package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// WikiTransferKind is the direction of a transfer job.
type WikiTransferKind string

const (
	WikiTransferExport WikiTransferKind = "export"
	WikiTransferImport WikiTransferKind = "import"
)

// WikiTransferFormat names the archive format a job reads or writes.
type WikiTransferFormat string

const (
	// WikiTransferBundle is the native, lossless .vibewiki.zip.
	WikiTransferBundle WikiTransferFormat = "bundle"
	// WikiTransferMarkdown is the Outline-flavoured markdown zip.
	WikiTransferMarkdown WikiTransferFormat = "markdown"
)

// WikiTransferStatus is a job's lifecycle state.
type WikiTransferStatus string

const (
	WikiTransferQueued  WikiTransferStatus = "queued"
	WikiTransferRunning WikiTransferStatus = "running"
	WikiTransferDone    WikiTransferStatus = "done"
	WikiTransferFailed  WikiTransferStatus = "failed"
)

// WikiTransferRequest is what the caller asked for. Stored verbatim so a
// job can be re-run and so the UI can label it.
type WikiTransferRequest struct {
	// RootDocumentID scopes an export to a subtree; nil exports the tree.
	RootDocumentID *uuid.UUID `bson:"root_document_id,omitempty" json:"rootDocumentId,omitempty"`
	// IncludeCredentials embeds credential payloads in an export.
	IncludeCredentials bool `bson:"include_credentials" json:"includeCredentials"`
	// TargetParentID places an import under a page; nil means the root.
	TargetParentID *uuid.UUID `bson:"target_parent_id,omitempty" json:"targetParentId,omitempty"`
	// HoldingPen lands an import in import/<timestamp>/ instead of
	// TargetParentID.
	HoldingPen bool `bson:"holding_pen" json:"holdingPen"`
	// UploadFilename is the name of the uploaded archive, for display.
	UploadFilename string `bson:"upload_filename,omitempty" json:"uploadFilename,omitempty"`
}

// WikiTransferProgress is how far a running job has got.
type WikiTransferProgress struct {
	Done  int `bson:"done" json:"done"`
	Total int `bson:"total" json:"total"`
}

// WikiTransferJob is one export or import run. Exports produce an
// artifact in the blob store the caller downloads; imports consume one the
// caller uploaded. Both expire.
type WikiTransferJob struct {
	field.DefaultField `bson:",inline"`
	JobID              uuid.UUID            `bson:"job_id" json:"jobId"`
	OperationID        uuid.UUID            `bson:"operation_id" json:"operationId"`
	Kind               WikiTransferKind     `bson:"kind" json:"kind"`
	Format             WikiTransferFormat   `bson:"format" json:"format"`
	Status             WikiTransferStatus   `bson:"status" json:"status"`
	RequestedByID      uuid.UUID            `bson:"requested_by_id" json:"requestedById"`
	Request            WikiTransferRequest  `bson:"request" json:"request"`
	Progress           WikiTransferProgress `bson:"progress" json:"progress"`
	// Error is the request-level failure message when Status is failed.
	Error string `bson:"error,omitempty" json:"error,omitempty"`
	// Report is the format's report (wikitransfer.ExportReport or
	// ImportReport) as JSON, set when the job finishes.
	Report []byte `bson:"report,omitempty" json:"-"`
	// ArtifactKey is the blob-store key of the archive: the produced zip
	// for exports, the uploaded zip for imports.
	ArtifactKey string `bson:"artifact_key,omitempty" json:"-"`
	// ArtifactName is the filename offered on download.
	ArtifactName string     `bson:"artifact_name,omitempty" json:"artifactName,omitempty"`
	ArtifactSize int64      `bson:"artifact_size,omitempty" json:"artifactSize,omitempty"`
	ExpiresAt    time.Time  `bson:"expires_at" json:"expiresAt"`
	StartedAt    *time.Time `bson:"started_at,omitempty" json:"startedAt,omitempty"`
	FinishedAt   *time.Time `bson:"finished_at,omitempty" json:"finishedAt,omitempty"`
}

// IsTerminal reports whether the job will not change again.
func (j *WikiTransferJob) IsTerminal() bool {
	return j.Status == WikiTransferDone || j.Status == WikiTransferFailed
}
