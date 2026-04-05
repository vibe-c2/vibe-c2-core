package models

import (
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// WikiDocumentBackupTrigger indicates how a backup was created.
type WikiDocumentBackupTrigger string

const (
	WikiDocumentBackupTriggerAuto   WikiDocumentBackupTrigger = "auto"
	WikiDocumentBackupTriggerManual WikiDocumentBackupTrigger = "manual"
)

// MarshalGQL writes the trigger as an uppercase quoted string for GraphQL.
func (t WikiDocumentBackupTrigger) MarshalGQL(w io.Writer) {
	fmt.Fprintf(w, "%q", strings.ToUpper(string(t)))
}

// UnmarshalGQL reads the trigger from a GraphQL uppercase string.
func (t *WikiDocumentBackupTrigger) UnmarshalGQL(v interface{}) error {
	str, ok := v.(string)
	if !ok {
		return fmt.Errorf("WikiDocumentBackupTrigger must be a string")
	}
	*t = WikiDocumentBackupTrigger(strings.ToLower(str))
	if *t != WikiDocumentBackupTriggerAuto && *t != WikiDocumentBackupTriggerManual {
		return fmt.Errorf("invalid WikiDocumentBackupTrigger: %s", str)
	}
	return nil
}

// WikiDocumentBackup is a point-in-time snapshot of a wiki document.
// Backups are created automatically (periodic), manually (user-triggered),
// or as safety snapshots before destructive operations (delete, restore).
type WikiDocumentBackup struct {
	field.DefaultField `bson:",inline"`
	BackupID           uuid.UUID                 `bson:"backup_id" json:"backupId"`
	DocumentID         uuid.UUID                 `bson:"document_id" json:"documentId"`
	OperationID        uuid.UUID                 `bson:"operation_id" json:"operationId"`
	Title              string                    `bson:"title" json:"title"`
	Content            string                    `bson:"content" json:"content"`
	ContentState       []byte                    `bson:"content_state,omitempty" json:"-"` // Y.js binary state snapshot — enables lossless restore
	Trigger            WikiDocumentBackupTrigger `bson:"trigger" json:"trigger"`
	Description        string                    `bson:"description" json:"description"` // user-provided label for manual, system label for safety backups
	CreatedByID        uuid.UUID                 `bson:"created_by_id" json:"createdById"`
}
