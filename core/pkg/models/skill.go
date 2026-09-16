package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// Skill is a community-published agent skill: a named zip bundle that an
// operator uploads and anyone on the instance can download.
//
// The row owns the *name*, not the bytes. Every upload appends a SkillVersion
// and moves CurrentVersion; the bundles themselves are immutable and stay
// downloadable, so an operator whose agent broke after an update can go back
// and a reader can see what a given version actually contained.
//
// The name is claimed by whoever publishes it first. Only OwnerUserID may
// publish a new version of it, which is the whole trust model: an operator who
// installed "recon-sweep" once knows that every later version of that name
// came from the same person. The owner or an admin can remove a skill
// outright, which deletes its versions and bundles and frees the name.
//
// Deliberately not operation-scoped. A working method is not engagement data.
type Skill struct {
	field.DefaultField `bson:",inline"`
	SkillID            uuid.UUID `bson:"skill_id" json:"skillId"`
	// Name is the normalized slug, unique across the instance. See
	// skills.NormalizeName for the rules and the reserved prefixes.
	Name        string `bson:"name" json:"name"`
	Description string `bson:"description" json:"description"`
	// OwnerUserID is who claimed the name. Denormalized OwnerUsername rides
	// along so listing skills does not need a second query per row; it is
	// refreshed on every publish.
	OwnerUserID   uuid.UUID `bson:"owner_user_id" json:"ownerUserId"`
	OwnerUsername string    `bson:"owner_username" json:"ownerUsername"`
	// CurrentVersion is the version handed out by default. Counts from 1.
	CurrentVersion int `bson:"current_version" json:"currentVersion"`
	// SizeBytes and UploadedAt mirror the current version, for listings.
	SizeBytes  int64     `bson:"size_bytes" json:"sizeBytes"`
	UploadedAt time.Time `bson:"uploaded_at" json:"uploadedAt"`
}

// SkillVersion is one upload. Rows are written once and never updated: they
// are the record of what was distributed under a name at a point in time.
type SkillVersion struct {
	field.DefaultField `bson:",inline"`
	SkillVersionID     uuid.UUID `bson:"skill_version_id" json:"skillVersionId"`
	SkillID            uuid.UUID `bson:"skill_id" json:"skillId"`
	// Version counts from 1 within the skill.
	Version        int       `bson:"version" json:"version"`
	UploadedByID   uuid.UUID `bson:"uploaded_by_id" json:"uploadedById"`
	UploadedByName string    `bson:"uploaded_by_name" json:"uploadedByName"`
	// ViaAgentKeyID is set when an agent published on its owner's behalf. The
	// identity is still the owner's; this only records the route, so an
	// operator can tell an upload they made from one their agent made.
	ViaAgentKeyID *uuid.UUID `bson:"via_agent_key_id,omitempty" json:"viaAgentKeyId,omitempty"`
	ObjectKey     string     `bson:"object_key" json:"objectKey"`
	SizeBytes     int64      `bson:"size_bytes" json:"sizeBytes"`
	Checksum      string     `bson:"checksum" json:"checksum"`
	// Notes is the publisher's one-line description of what changed. Optional,
	// and the reason the update prompt can say something useful instead of
	// merely reporting that the bytes moved.
	Notes string `bson:"notes" json:"notes"`
}

// SkillSubscription is what one operator has done about one community skill:
// which version they downloaded, and which version they dismissed the update
// prompt for.
//
// Separate from the User document because this is per skill and unbounded,
// where the built-in skill's equivalent fields (SkillDownload,
// SkillUpdateSnoozedVersion) are a single pair and stay where they are.
type SkillSubscription struct {
	field.DefaultField `bson:",inline"`
	UserID             uuid.UUID `bson:"user_id" json:"userId"`
	SkillID            uuid.UUID `bson:"skill_id" json:"skillId"`
	DownloadedVersion  int       `bson:"downloaded_version" json:"downloadedVersion"`
	DownloadedAt       time.Time `bson:"downloaded_at" json:"downloadedAt"`
	// SnoozedVersion is the newest version the operator dismissed the prompt
	// for. The prompt returns when something newer than this is published.
	SnoozedVersion int `bson:"snoozed_version,omitempty" json:"snoozedVersion"`
}
