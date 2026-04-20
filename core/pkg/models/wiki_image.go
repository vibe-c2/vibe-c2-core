package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// WikiImage is metadata for an image uploaded to a wiki document. The image
// bytes live in the object store under ObjectKey; this record is the source
// of truth for ownership and authorization checks.
//
// Ownership is per-document: DocumentID is required at upload time. The
// sweeper uses CreateAt + the current CRDT/Markdown content of the owning
// document to decide whether the image is still referenced.
type WikiImage struct {
	field.DefaultField `bson:",inline"`
	ImageID            uuid.UUID  `bson:"image_id" json:"imageId"`
	OperationID        uuid.UUID  `bson:"operation_id" json:"operationId"`
	DocumentID         uuid.UUID  `bson:"document_id" json:"documentId"`
	UploadedByID       uuid.UUID  `bson:"uploaded_by_id" json:"uploadedById"`
	ObjectKey          string     `bson:"object_key" json:"objectKey"`
	ContentType        string     `bson:"content_type" json:"contentType"`
	SizeBytes          int64      `bson:"size_bytes" json:"sizeBytes"`
	Width              int        `bson:"width" json:"width"`
	Height             int        `bson:"height" json:"height"`
	Checksum           string     `bson:"checksum" json:"checksum"`
	DeletedAt          *time.Time `bson:"deleted_at,omitempty" json:"deletedAt,omitempty"`
}
