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
//
// Delegated agent keys take a separate path — see authorizeAgent.
func AuthorizeOperationRole(ctx context.Context, op *models.Operation, minRole models.OperationRole) error {
	auth := gqlctx.AuthFromContext(ctx)

	if auth.Agent != nil {
		return authorizeAgent(auth, op, minRole)
	}

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

// authorizeAgent resolves an agent-key caller. It mirrors the human path with
// two deliberate differences:
//
//  1. No app-admin bypass. An agent owned by an app admin is NOT an app admin.
//     The owner's global role is exactly the authority the key was meant to
//     narrow, so honouring the short-circuit would make MaxRole decorative and
//     make the most privileged accounts the ones whose agents are unbounded.
//
//  2. Every role the owner holds is capped by MaxRole. The result is an
//     intersection: the agent can reach an operation only if the owner is a
//     member AND the key is scoped to it, at the lower of the two roles.
//
// Whatever this function does, it can only ever return a subset of what the
// same owner would have been granted on the human path.
func authorizeAgent(auth gqlctx.AuthInfo, op *models.Operation, minRole models.OperationRole) error {
	agent := auth.Agent

	if !agent.AllowsOperation(op.OperationID) {
		return fmt.Errorf("forbidden: agent key is not scoped to this operation")
	}

	capped := func(role models.OperationRole) error {
		effective := models.CapRole(role, agent.MaxRole)
		if effective.HasAtLeast(minRole) {
			return nil
		}
		return fmt.Errorf("forbidden: agent key is capped at '%s' role, this requires '%s'", agent.MaxRole, minRole)
	}

	// Public operation: implicit operator, same as a human — but still capped,
	// so a viewer-capped key cannot write to Public.
	if models.IsPublicOperation(op.OperationID) {
		if minRole == models.OperationRoleAdmin {
			return fmt.Errorf("forbidden: public operation has no admins")
		}
		return capped(models.OperationRoleOperator)
	}

	callerUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return fmt.Errorf("forbidden: invalid caller ID")
	}

	for _, m := range op.Members {
		if m.UserID == callerUID {
			return capped(m.Role)
		}
	}

	return fmt.Errorf("forbidden: agent owner is not a member of this operation")
}

// IsAppAdmin returns true if the caller has the app-level "admin" role.
// Agent callers are never app admins regardless of who owns the key — see
// authorizeAgent for why.
func IsAppAdmin(auth gqlctx.AuthInfo) bool {
	if auth.Agent != nil {
		return false
	}
	for _, role := range auth.Roles {
		if role == "admin" {
			return true
		}
	}
	return false
}
