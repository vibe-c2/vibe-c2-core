package models

import (
	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

type User struct {
	field.DefaultField `bson:",inline"`
	UserID             uuid.UUID `bson:"user_id" json:"user_id"`
	Username           string    `bson:"username" json:"username"`
	Email              string    `bson:"email" json:"email"`
	Password           string    `bson:"password" json:"-"`
	Role               string    `bson:"role" json:"role"`
	Active             bool      `bson:"active" json:"active"`
}
