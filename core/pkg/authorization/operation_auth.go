package authorization

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// AuthorizeOperationRole checks if the caller is an app-level admin OR has
// at least the required role in the given operation. Returns nil if authorized.
//
// This is the shared authorization check used by all resolvers that need
// operation-level role enforcement (operations, wiki, findings, etc.).
//
// Public operation special case: any authenticated caller is implicitly an
// operator on the synthetic Public operation. Admin-level requests against
// Public are forbidden — Public has no admins, by design.
func AuthorizeOperationRole(ctx context.Context, op *models.Operation, minRole models.OperationRole) error {
	auth := gqlctx.AuthFromContext(ctx)

	// App-level admins always have full access
	for _, role := range auth.Roles {
		if role == "admin" {
			return nil
		}
	}

	callerUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return fmt.Errorf("forbidden: invalid caller ID")
	}

	// Public operation: implicit operator for any authenticated caller.
	// Operator satisfies both viewer and operator role requirements; admin
	// requirements are refused because Public has no admins. The Operation
	// mutation resolvers refuse Public-targeted writes up front so this
	// branch should only ever be hit by read paths and wiki mutations.
	if models.IsPublicOperation(op.OperationID) {
		if minRole == models.OperationRoleAdmin {
			return fmt.Errorf("forbidden: public operation has no admins")
		}
		return nil
	}

	for _, m := range op.Members {
		if m.UserID == callerUID {
			if m.Role.HasAtLeast(minRole) {
				return nil
			}
			return fmt.Errorf("forbidden: requires at least '%s' role in this operation", minRole)
		}
	}

	return fmt.Errorf("forbidden: not a member of this operation")
}

// IsAppAdmin returns true if the caller has the app-level "admin" role.
func IsAppAdmin(auth gqlctx.AuthInfo) bool {
	for _, role := range auth.Roles {
		if role == "admin" {
			return true
		}
	}
	return false
}
