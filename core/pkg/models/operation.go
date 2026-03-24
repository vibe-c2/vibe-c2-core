package models

import (
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
)

// OperationRole represents a user's role within an operation.
// Roles form a hierarchy: admin > operator > viewer.
type OperationRole string

const (
	OperationRoleAdmin    OperationRole = "admin"
	OperationRoleOperator OperationRole = "operator"
	OperationRoleViewer   OperationRole = "viewer"
)

// operationRoleLevel maps roles to their hierarchy level (higher = more privileged).
var operationRoleLevel = map[OperationRole]int{
	OperationRoleViewer:   1,
	OperationRoleOperator: 2,
	OperationRoleAdmin:    3,
}

// IsValid returns true if the role is a recognized operation role.
func (r OperationRole) IsValid() bool {
	_, ok := operationRoleLevel[r]
	return ok
}

// HasAtLeast returns true if this role is equal to or higher than the required role.
func (r OperationRole) HasAtLeast(required OperationRole) bool {
	return operationRoleLevel[r] >= operationRoleLevel[required]
}

// MarshalGQL writes the role as an uppercase GraphQL enum value (e.g. "admin" -> ADMIN).
func (r OperationRole) MarshalGQL(w io.Writer) {
	fmt.Fprint(w, strings.ToUpper(string(r)))
}

// UnmarshalGQL reads a GraphQL enum value and converts to lowercase (e.g. ADMIN -> "admin").
func (r *OperationRole) UnmarshalGQL(v interface{}) error {
	str, ok := v.(string)
	if !ok {
		return fmt.Errorf("OperationRole must be a string")
	}
	role := OperationRole(strings.ToLower(str))
	if !role.IsValid() {
		return fmt.Errorf("invalid OperationRole: %s", str)
	}
	*r = role
	return nil
}

// OperationMember represents a user's membership in an operation with their role.
type OperationMember struct {
	UserID uuid.UUID     `bson:"user_id" json:"user_id"`
	Role   OperationRole `bson:"role" json:"role"`
}

type Operation struct {
	field.DefaultField `bson:",inline"`
	OperationID        uuid.UUID         `bson:"operation_id" json:"operation_id"`
	Name               string            `bson:"name" json:"name"`
	Description        string            `bson:"description" json:"description"`
	Members            []OperationMember `bson:"members" json:"members"`
}
