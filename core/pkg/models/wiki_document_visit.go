package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// WikiDocumentVisit records that a user opened a wiki document. The collection
// is the persistence backing for the per-user "recently visited" history shown
// in the wiki sidebar dropdown.
//
// Dedup is enforced by a unique compound index on (user_id, operation_id,
// document_id): one row per user-document pair, so a revisit is an upsert that
// bumps VisitedAt. The history list is capped to a fixed number of entries per
// user per operation; older rows are pruned after each upsert.
type WikiDocumentVisit struct {
	field.DefaultField `bson:",inline"`
	UserID             uuid.UUID `bson:"user_id" json:"userId"`
	OperationID        uuid.UUID `bson:"operation_id" json:"operationId"`
	DocumentID         uuid.UUID `bson:"document_id" json:"documentId"`
	VisitedAt          time.Time `bson:"visited_at" json:"visitedAt"`
}
