package models

import (
	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

type User struct {
	field.DefaultField `bson:",inline"`
	UserID             uuid.UUID `bson:"user_id" json:"user_id"`
	Username           string    `bson:"username" json:"username"`
	Password           string    `bson:"password" json:"-"`
	Roles              []string  `bson:"roles" json:"roles"`
	Active             bool      `bson:"active" json:"active"`
	// HiddenIdentities are usernames this operator has chosen to hide from the
	// host topology Users lens (e.g. an Ansible "default" account that floods
	// the graph). Stored normalized (trimmed, lowercased); a nil/absent value
	// means "nothing hidden" and marshals to an empty GraphQL list.
	HiddenIdentities []string `bson:"hidden_identities" json:"hidden_identities"`
}
