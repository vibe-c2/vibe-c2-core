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
}
