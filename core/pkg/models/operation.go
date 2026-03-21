package models

import (
	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

type Operation struct {
	field.DefaultField `bson:",inline"`
	OperationID        uuid.UUID   `bson:"operation_id" json:"operation_id"`
	Name               string      `bson:"name" json:"name"`
	Description        string      `bson:"description" json:"description"`
	MemberIDs          []uuid.UUID `bson:"member_ids" json:"member_ids"`
}
