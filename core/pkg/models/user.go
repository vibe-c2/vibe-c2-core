package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// AuthSource values describe how an account proves its identity.
const (
	// AuthSourceLocal is a username + bcrypt password account. The empty
	// string means the same thing so rows written before the field existed
	// keep working.
	AuthSourceLocal = "local"
	// AuthSourceOIDC is an account provisioned by, and authenticated
	// through, an external OpenID Connect provider. It has no password.
	AuthSourceOIDC = "oidc"
)

// OIDCIdentity links a local user to a subject at one provider. The pair
// (Issuer, Subject) is the stable key — usernames may change at
// the provider without breaking the link.
type OIDCIdentity struct {
	Issuer      string    `bson:"issuer" json:"issuer"`
	Subject     string    `bson:"subject" json:"subject"`
	LastLoginAt time.Time `bson:"last_login_at" json:"last_login_at"`
}

type User struct {
	field.DefaultField `bson:",inline"`
	UserID             uuid.UUID `bson:"user_id" json:"user_id"`
	Username           string    `bson:"username" json:"username"`
	Password           string    `bson:"password" json:"-"`
	Roles              []string  `bson:"roles" json:"roles"`
	Active             bool      `bson:"active" json:"active"`
	// AuthSource is AuthSourceLocal or AuthSourceOIDC; empty reads as local.
	AuthSource string `bson:"auth_source,omitempty" json:"auth_source,omitempty"`
	// OIDC is set only for SSO accounts.
	OIDC *OIDCIdentity `bson:"oidc,omitempty" json:"-"`
	// HiddenIdentities are usernames this operator has chosen to hide from the
	// host topology Users lens (e.g. an Ansible "default" account that floods
	// the graph). Stored normalized (trimmed, lowercased); a nil/absent value
	// means "nothing hidden" and marshals to an empty GraphQL list.
	HiddenIdentities []string `bson:"hidden_identities" json:"hidden_identities"`
	// SkillDownload records the last time this operator downloaded the
	// generated agent skill, and which release it was. Nil means never: the
	// app then has nothing to compare and shows no update prompt. Written by
	// the skill endpoint itself, so it reflects what was actually served.
	SkillDownload *SkillDownload `bson:"skill_download,omitempty" json:"-"`
	// SkillUpdateSnoozedVersion is the newest skill release the operator has
	// dismissed the update prompt for. The prompt stays hidden until a release
	// newer than this ships. Zero means nothing dismissed.
	SkillUpdateSnoozedVersion int `bson:"skill_update_snoozed_version,omitempty" json:"-"`
}

// SkillDownload is one recorded download of the agent skill.
type SkillDownload struct {
	Version      int       `bson:"version" json:"version"`
	DownloadedAt time.Time `bson:"downloaded_at" json:"downloaded_at"`
}

// IsSSO reports whether the account is owned by an external identity
// provider (no local password; username and roles come from the provider).
func (u User) IsSSO() bool {
	return u.AuthSource == AuthSourceOIDC
}

// EffectiveAuthSource normalises the empty legacy value to AuthSourceLocal.
func (u User) EffectiveAuthSource() string {
	if u.AuthSource == "" {
		return AuthSourceLocal
	}
	return u.AuthSource
}
