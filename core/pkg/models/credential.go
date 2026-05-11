package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// CredentialType categorizes the secret material recorded against a target.
// OTHER is the escape hatch for anything that doesn't fit the named buckets.
type CredentialType string

const (
	CredentialTypePassword CredentialType = "PASSWORD"
	CredentialTypeSSHKey   CredentialType = "SSH_KEY"
	CredentialTypeAPIKey   CredentialType = "API_KEY"
	CredentialTypeToken    CredentialType = "TOKEN"
	CredentialTypeHash     CredentialType = "HASH"
	CredentialTypeOther    CredentialType = "OTHER"
)

// IsValid reports whether the type matches one of the known enum members.
func (t CredentialType) IsValid() bool {
	switch t {
	case CredentialTypePassword,
		CredentialTypeSSHKey,
		CredentialTypeAPIKey,
		CredentialTypeToken,
		CredentialTypeHash,
		CredentialTypeOther:
		return true
	}
	return false
}

// CredentialComment is an operator note attached to a credential.
// Stored as an embedded sub-document within Credential (not a separate collection),
// mirroring the SchemeNetworkPort pattern in SchemeNetworkPoint.
type CredentialComment struct {
	CommentID uuid.UUID `bson:"comment_id" json:"comment_id"`
	AuthorID  uuid.UUID `bson:"author_id"  json:"author_id"`
	Text      string    `bson:"text"       json:"text"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

// Credential is a discovered secret recorded by operators against an operation's
// target systems. Passwords and keys here are *target* secrets — they are
// stored as plain data, not application secrets, and are not redacted.
type Credential struct {
	field.DefaultField `bson:",inline"`
	CredentialID       uuid.UUID           `bson:"credential_id" json:"credential_id"`
	OperationID        uuid.UUID           `bson:"operation_id"  json:"operation_id"`
	Name               string              `bson:"name"          json:"name"`
	Type               CredentialType      `bson:"type"          json:"type"`
	Username           string              `bson:"username"      json:"username"`
	Password           string              `bson:"password"      json:"password"`
	Keys               []string            `bson:"keys"          json:"keys"`
	IsValid            bool                `bson:"is_valid"      json:"is_valid"`
	Tags               []string            `bson:"tags"          json:"tags"`
	Comments           []CredentialComment `bson:"comments"      json:"comments"`
	CreatedByID        uuid.UUID           `bson:"created_by_id" json:"created_by_id"`
}
