package models

import (
	"time"

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

// HashComment is an operator note attached to a hash. Mirrors CredentialComment.
type HashComment struct {
	CommentID uuid.UUID `bson:"comment_id" json:"comment_id"`
	AuthorID  uuid.UUID `bson:"author_id"  json:"author_id"`
	Text      string    `bson:"text"       json:"text"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

// HashProperty is an operator-defined key/value pair carrying ad-hoc metadata
// about a hash (e.g. machine_account=true, dumped_via=secretsdump). Same
// non-secret semantics as CredentialProperty: visible text, search-indexed.
type HashProperty struct {
	Name  string `bson:"name"  json:"name"`
	Value string `bson:"value" json:"value"`
}

// HashCrackingMeta records who/how/when a hash was cracked. Populated on the
// MarkHashCracked path; nil for hashes that have not been cracked. Stored
// inline so the postmortem ("what wordlist worked?") sits next to the hash.
//
// Free-form fields — operators self-report. No hashcat integration validates
// these values; they exist to document the offline work, not drive it.
type HashCrackingMeta struct {
	Tool        string    `bson:"tool"         json:"tool"`         // hashcat, john, ...
	Wordlist    string    `bson:"wordlist"     json:"wordlist"`     // path or short name
	Rules       string    `bson:"rules"        json:"rules"`        // ruleset name
	DurationSec int64     `bson:"duration_sec" json:"duration_sec"` // wall-clock seconds
	CrackedByID uuid.UUID `bson:"cracked_by_id" json:"cracked_by_id"`
	CrackedAt   time.Time `bson:"cracked_at"   json:"cracked_at"`
}

// Hash is a discovered password hash recorded by operators against an
// operation's target accounts. The hash value itself is not a secret in the
// application sense — it's already-stolen target material — so it is stored
// and rendered as plain text.
//
// CredentialID is the bridge to the Credentials tab. When a hash gets cracked
// the operator picks an existing Credential or creates a new one; that
// Credential's UUID lands here. A nil CredentialID means "not yet linked" —
// either still processing or cracked-but-deliberately-unlinked.
type Hash struct {
	field.DefaultField `bson:",inline"`
	HashID             uuid.UUID         `bson:"hash_id"        json:"hash_id"`
	OperationID        uuid.UUID         `bson:"operation_id"   json:"operation_id"`
	Value              string            `bson:"value"          json:"value"`
	HashType           string            `bson:"hash_type"      json:"hash_type"`
	HashcatMode        int               `bson:"hashcat_mode"   json:"hashcat_mode"`
	Username           string            `bson:"username"       json:"username"`
	Domain             string            `bson:"domain"         json:"domain"`
	Status             HashStatus        `bson:"status"         json:"status"`
	Source             string            `bson:"source"         json:"source"`
	Tags               []string          `bson:"tags"           json:"tags"`
	CredentialID       *uuid.UUID        `bson:"credential_id,omitempty" json:"credential_id,omitempty"`
	CrackingMeta       *HashCrackingMeta `bson:"cracking_meta,omitempty" json:"cracking_meta,omitempty"`
	Properties         []HashProperty    `bson:"properties"     json:"properties"`
	Comments           []HashComment     `bson:"comments"       json:"comments"`
	CreatedByID        uuid.UUID         `bson:"created_by_id"  json:"created_by_id"`
}
