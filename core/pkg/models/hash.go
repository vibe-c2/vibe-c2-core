package models

import (
	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// HashStatus tracks where a hash sits in the operator-driven crack workflow.
// Cracking itself happens outside the app — operators flip this manually (or
// via a future webhook) to reflect what their offline tooling reported back.
type HashStatus string

const (
	HashStatusNotProcessed HashStatus = "NOT_PROCESSED"
	HashStatusQueued       HashStatus = "QUEUED"
	HashStatusCracking     HashStatus = "CRACKING"
	HashStatusCracked      HashStatus = "CRACKED"
	HashStatusFailed       HashStatus = "FAILED"
)

// IsValid reports whether the status matches one of the known enum members.
func (s HashStatus) IsValid() bool {
	switch s {
	case HashStatusNotProcessed,
		HashStatusQueued,
		HashStatusCracking,
		HashStatusCracked,
		HashStatusFailed:
		return true
	}
	return false
}

// Hash is a discovered password hash recorded by operators against an
// operation's target accounts. The hash value itself is not a secret in the
// application sense — it's already-stolen target material — so it is stored
// and rendered as plain text.
//
// CredentialID is the bridge to the Credentials tab. When a hash gets cracked
// the operator picks an existing Credential or creates a new one; that
// Credential's UUID lands here. A nil CredentialID means "not yet linked".
type Hash struct {
	field.DefaultField `bson:",inline"`
	HashID             uuid.UUID  `bson:"hash_id"                 json:"hash_id"`
	OperationID        uuid.UUID  `bson:"operation_id"            json:"operation_id"`
	Value              string     `bson:"value"                   json:"value"`
	Status             HashStatus `bson:"status"                  json:"status"`
	Comment            string     `bson:"comment"                 json:"comment"`
	Tags               []string   `bson:"tags"                    json:"tags"`
	CredentialID       *uuid.UUID `bson:"credential_id,omitempty" json:"credential_id,omitempty"`
	CreatedByID        uuid.UUID  `bson:"created_by_id"           json:"created_by_id"`
}
