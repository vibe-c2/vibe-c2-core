package authorization

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// agentCtx builds the auth context an agent-key request produces: the OWNER's
// identity and roles, plus the key's ceiling.
func agentCtx(ownerID uuid.UUID, agent *gqlctx.AgentInfo, roles ...string) context.Context {
	return gqlctx.WithAuthInfo(context.Background(), gqlctx.AuthInfo{
		UserID: ownerID.String(),
		Roles:  roles,
		Agent:  agent,
	})
}

func opWithMember(userID uuid.UUID, role models.OperationRole) models.Operation {
	return models.Operation{
		OperationID: uuid.New(),
		Name:        "Nightfall",
		Members:     []models.OperationMember{{UserID: userID, Role: role}},
	}
}

// The core invariant: an agent's effective role is the LOWER of what its owner
// holds in the operation and what the key is capped at. It can never exceed
// either.
func TestAuthorizeAgent_RoleIsCapped(t *testing.T) {
	owner := uuid.New()

	cases := []struct {
		name       string
		memberRole models.OperationRole
		maxRole    models.OperationRole
		minRole    models.OperationRole
		wantErr    bool
	}{
		{"operator member, operator cap, viewer required", models.OperationRoleOperator, models.OperationRoleOperator, models.OperationRoleViewer, false},
		{"operator member, operator cap, operator required", models.OperationRoleOperator, models.OperationRoleOperator, models.OperationRoleOperator, false},
		{"operator member, VIEWER cap, operator required", models.OperationRoleOperator, models.OperationRoleViewer, models.OperationRoleOperator, true},
		{"operator member, viewer cap, viewer required", models.OperationRoleOperator, models.OperationRoleViewer, models.OperationRoleViewer, false},
		{"viewer member, OPERATOR cap, operator required", models.OperationRoleViewer, models.OperationRoleOperator, models.OperationRoleOperator, true},
		{"admin member, operator cap, admin required", models.OperationRoleAdmin, models.OperationRoleOperator, models.OperationRoleAdmin, true},
		{"admin member, operator cap, operator required", models.OperationRoleAdmin, models.OperationRoleOperator, models.OperationRoleOperator, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			op := opWithMember(owner, tc.memberRole)
			ctx := agentCtx(owner, &gqlctx.AgentInfo{Name: "Claude", MaxRole: tc.maxRole}, "user")

			err := AuthorizeOperationRole(ctx, &op, tc.minRole)
			if (err != nil) != tc.wantErr {
				t.Fatalf("member=%s cap=%s min=%s: err = %v, wantErr = %v",
					tc.memberRole, tc.maxRole, tc.minRole, err, tc.wantErr)
			}
		})
	}
}

// The single most important property in this package: the app-admin
// short-circuit must NOT apply to agents. If it did, MaxRole would be
// decorative and the most privileged accounts would be exactly the ones whose
// agents were unbounded.
func TestAuthorizeAgent_AppAdminOwnerDoesNotBypassCap(t *testing.T) {
	owner := uuid.New()
	op := opWithMember(owner, models.OperationRoleAdmin)
	ctx := agentCtx(owner, &gqlctx.AgentInfo{Name: "Claude", MaxRole: models.OperationRoleViewer}, "admin")

	// A human app-admin would sail through any of these.
	for _, minRole := range []models.OperationRole{models.OperationRoleOperator, models.OperationRoleAdmin} {
		if err := AuthorizeOperationRole(ctx, &op, minRole); err == nil {
			t.Fatalf("viewer-capped agent of an app admin was granted %s", minRole)
		}
	}

	// ...and viewer is still allowed, so the cap narrows rather than blocks.
	if err := AuthorizeOperationRole(ctx, &op, models.OperationRoleViewer); err != nil {
		t.Fatalf("viewer-capped agent refused viewer access: %v", err)
	}
}

// IsAppAdmin is consulted directly by a few resolvers, so it must agree with
// AuthorizeOperationRole rather than leaving a second, laxer door open.
func TestIsAppAdmin_FalseForAgents(t *testing.T) {
	owner := uuid.New()

	human := gqlctx.AuthInfo{UserID: owner.String(), Roles: []string{"admin"}}
	if !IsAppAdmin(human) {
		t.Fatal("expected a human app admin to be recognised")
	}

	agent := human
	agent.Agent = &gqlctx.AgentInfo{Name: "Claude", MaxRole: models.OperationRoleOperator}
	if IsAppAdmin(agent) {
		t.Fatal("an agent owned by an app admin must not be an app admin")
	}
}

// OperationScopes narrows which operations the key may touch at all. Empty
// means "wherever the owner is a member" — it is a filter, never a grant.
func TestAuthorizeAgent_OperationScopes(t *testing.T) {
	owner := uuid.New()
	op := opWithMember(owner, models.OperationRoleOperator)
	other := uuid.New()

	t.Run("empty scope allows any operation the owner belongs to", func(t *testing.T) {
		ctx := agentCtx(owner, &gqlctx.AgentInfo{MaxRole: models.OperationRoleOperator}, "user")
		if err := AuthorizeOperationRole(ctx, &op, models.OperationRoleViewer); err != nil {
			t.Fatalf("unscoped key refused: %v", err)
		}
	})

	t.Run("in-scope operation allowed", func(t *testing.T) {
		ctx := agentCtx(owner, &gqlctx.AgentInfo{
			MaxRole:         models.OperationRoleOperator,
			OperationScopes: []uuid.UUID{other, op.OperationID},
		}, "user")
		if err := AuthorizeOperationRole(ctx, &op, models.OperationRoleViewer); err != nil {
			t.Fatalf("in-scope operation refused: %v", err)
		}
	})

	t.Run("out-of-scope operation refused", func(t *testing.T) {
		ctx := agentCtx(owner, &gqlctx.AgentInfo{
			MaxRole:         models.OperationRoleOperator,
			OperationScopes: []uuid.UUID{other},
		}, "user")
		err := AuthorizeOperationRole(ctx, &op, models.OperationRoleViewer)
		if err == nil {
			t.Fatal("out-of-scope operation was allowed")
		}
		if !strings.Contains(err.Error(), "not scoped") {
			t.Fatalf("expected a scope-specific error, got %v", err)
		}
	})

	t.Run("scope does not grant membership", func(t *testing.T) {
		stranger := models.Operation{OperationID: uuid.New(), Name: "Not mine"}
		ctx := agentCtx(owner, &gqlctx.AgentInfo{
			MaxRole:         models.OperationRoleOperator,
			OperationScopes: []uuid.UUID{stranger.OperationID},
		}, "user")
		if err := AuthorizeOperationRole(ctx, &stranger, models.OperationRoleViewer); err == nil {
			t.Fatal("scoping a key to an operation the owner is not a member of granted access")
		}
	})
}

// Non-members are refused with an agent-specific message, so an operator
// reading logs can tell "my key is too narrow" from "I lost access".
func TestAuthorizeAgent_OwnerNotAMember(t *testing.T) {
	owner := uuid.New()
	op := opWithMember(uuid.New(), models.OperationRoleAdmin) // someone else's operation
	ctx := agentCtx(owner, &gqlctx.AgentInfo{MaxRole: models.OperationRoleOperator}, "user")

	err := AuthorizeOperationRole(ctx, &op, models.OperationRoleViewer)
	if err == nil {
		t.Fatal("agent reached an operation its owner is not a member of")
	}
	if !strings.Contains(err.Error(), "not a member") {
		t.Fatalf("expected a membership error, got %v", err)
	}
}

// The Public operation grants implicit operator to humans. Agents get the same
// implicit role, but still capped — so a read-only key cannot write to Public.
func TestAuthorizeAgent_PublicOperation(t *testing.T) {
	owner := uuid.New()
	publicOp := models.SynthesizePublicOperation()

	cases := []struct {
		name    string
		maxRole models.OperationRole
		minRole models.OperationRole
		wantErr bool
	}{
		{"operator cap, viewer required", models.OperationRoleOperator, models.OperationRoleViewer, false},
		{"operator cap, operator required", models.OperationRoleOperator, models.OperationRoleOperator, false},
		{"viewer cap, viewer required", models.OperationRoleViewer, models.OperationRoleViewer, false},
		{"viewer cap, operator required", models.OperationRoleViewer, models.OperationRoleOperator, true},
		{"operator cap, admin required", models.OperationRoleOperator, models.OperationRoleAdmin, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := agentCtx(owner, &gqlctx.AgentInfo{MaxRole: tc.maxRole}, "user")
			err := AuthorizeOperationRole(ctx, &publicOp, tc.minRole)
			if (err != nil) != tc.wantErr {
				t.Fatalf("cap=%s min=%s: err = %v, wantErr = %v", tc.maxRole, tc.minRole, err, tc.wantErr)
			}
		})
	}
}

// An operation scope narrows which *operations* a key may act in. Public is
// not one of the owner's operations — it is a shared space every authenticated
// user already has — so scoping a key to an engagement says nothing about it.
// Withholding Public from a scoped key cut agents off from the shared wiki
// their operator was looking straight at.
//
// Still capped, and still no admin: the scope list is not what contains a key
// on Public, MaxRole is.
func TestAuthorizeAgent_PublicIsNotNarrowedByScope(t *testing.T) {
	owner := uuid.New()
	elsewhere := uuid.New()
	publicOp := models.SynthesizePublicOperation()

	cases := []struct {
		name    string
		maxRole models.OperationRole
		minRole models.OperationRole
		wantErr bool
	}{
		{"scoped elsewhere, reads Public", models.OperationRoleOperator, models.OperationRoleViewer, false},
		{"scoped elsewhere, writes Public", models.OperationRoleOperator, models.OperationRoleOperator, false},
		{"scoped elsewhere, viewer cap cannot write Public", models.OperationRoleViewer, models.OperationRoleOperator, true},
		{"scoped elsewhere, still no admin on Public", models.OperationRoleOperator, models.OperationRoleAdmin, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			agent := &gqlctx.AgentInfo{
				MaxRole:         tc.maxRole,
				OperationScopes: []uuid.UUID{elsewhere},
			}
			err := AuthorizeOperationRole(agentCtx(owner, agent, "user"), &publicOp, tc.minRole)
			if (err != nil) != tc.wantErr {
				t.Fatalf("cap=%s min=%s: err = %v, wantErr = %v", tc.maxRole, tc.minRole, err, tc.wantErr)
			}
		})
	}
}

// The scope list must still bite everywhere else — the Public carve-out is a
// carve-out, not a hole.
func TestAuthorizeAgent_ScopeStillRefusesOtherOperations(t *testing.T) {
	owner := uuid.New()
	scoped := uuid.New()
	op := opWithMember(owner, models.OperationRoleOperator)

	agent := &gqlctx.AgentInfo{
		MaxRole:         models.OperationRoleOperator,
		OperationScopes: []uuid.UUID{scoped},
	}
	err := AuthorizeOperationRole(agentCtx(owner, agent, "user"), &op, models.OperationRoleViewer)
	if err == nil {
		t.Fatal("agent reached an operation its key is not scoped to")
	}
}

// Whatever the inputs, an agent must never be granted something the same owner
// would have been refused on the human path. This is the property the rest of
// the file's cases are specific instances of.
func TestAuthorizeAgent_NeverExceedsTheHumanPath(t *testing.T) {
	owner := uuid.New()
	roleSet := []models.OperationRole{models.OperationRoleViewer, models.OperationRoleOperator, models.OperationRoleAdmin}

	for _, ownerRoles := range [][]string{{"user"}, {"admin"}} {
		for _, memberRole := range roleSet {
			for _, maxRole := range []models.OperationRole{models.OperationRoleViewer, models.OperationRoleOperator} {
				for _, minRole := range roleSet {
					op := opWithMember(owner, memberRole)

					humanErr := AuthorizeOperationRole(authCtx(owner, ownerRoles...), &op, minRole)
					agentErr := AuthorizeOperationRole(
						agentCtx(owner, &gqlctx.AgentInfo{MaxRole: maxRole}, ownerRoles...), &op, minRole)

					if humanErr != nil && agentErr == nil {
						t.Fatalf("agent granted what the human path refused: ownerRoles=%v member=%s cap=%s min=%s",
							ownerRoles, memberRole, maxRole, minRole)
					}
				}
			}
		}
	}
}
