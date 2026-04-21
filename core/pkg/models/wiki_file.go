package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// WikiFile is metadata for a non-image file attachment uploaded to a wiki
// document. The bytes live in the object store under ObjectKey; this record
// is the source of truth for ownership, authorization, and the original
// filename that the browser should see on download.
//
// Ownership is per-document: DocumentID is required at upload time. The
// sweeper uses CreateAt + the current CRDT/Markdown content of the owning
// document to decide whether the file is still referenced.
type WikiFile struct {
	field.DefaultField `bson:",inline"`
	FileID             uuid.UUID  `bson:"file_id" json:"fileId"`
	OperationID        uuid.UUID  `bson:"operation_id" json:"operationId"`
	DocumentID         uuid.UUID  `bson:"document_id" json:"documentId"`
	UploadedByID       uuid.UUID  `bson:"uploaded_by_id" json:"uploadedById"`
	ObjectKey          string     `bson:"object_key" json:"objectKey"`
	Filename           string     `bson:"filename" json:"filename"`
	ContentType        string     `bson:"content_type" json:"contentType"`
	SizeBytes          int64      `bson:"size_bytes" json:"sizeBytes"`
	Checksum           string     `bson:"checksum" json:"checksum"`
	DeletedAt          *time.Time `bson:"deleted_at,omitempty" json:"deletedAt,omitempty"`
}
