package authorization

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

func authCtx(userID uuid.UUID, roles ...string) context.Context {
	return gqlctx.WithAuthInfo(context.Background(), gqlctx.AuthInfo{
		UserID: userID.String(),
		Roles:  roles,
	})
}

// Public-operation special case: any authenticated non-admin caller is
// implicitly an operator. The branch is exercised here through the
// synthesized struct that operationRepo.FindByID returns for the Public
// ID — we mirror that struct here so the test doesn't depend on the repo.
func TestAuthorizeOperationRole_PublicOperation(t *testing.T) {
	caller := uuid.New()
	publicOp := models.SynthesizePublicOperation()

	cases := []struct {
		name    string
		minRole models.OperationRole
		wantErr bool
	}{
		{"viewer required, allowed", models.OperationRoleViewer, false},
		{"operator required, allowed", models.OperationRoleOperator, false},
		{"admin required, refused", models.OperationRoleAdmin, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := AuthorizeOperationRole(authCtx(caller), &publicOp, tc.minRole)
			if (err != nil) != tc.wantErr {
				t.Fatalf("AuthorizeOperationRole(public, %s) err = %v, wantErr=%v",
					tc.minRole, err, tc.wantErr)
			}
		})
	}
}

// Public + invalid caller id should still be denied — the implicit-operator
// rule applies to authenticated callers, not to malformed auth contexts.
func TestAuthorizeOperationRole_PublicOperation_InvalidCaller(t *testing.T) {
	publicOp := models.SynthesizePublicOperation()
	ctx := gqlctx.WithAuthInfo(context.Background(), gqlctx.AuthInfo{
		UserID: "not-a-uuid",
		Roles:  []string{"user"},
	})

	err := AuthorizeOperationRole(ctx, &publicOp, models.OperationRoleOperator)
	if err == nil || !strings.Contains(err.Error(), "invalid caller ID") {
		t.Fatalf("want invalid-caller error, got %v", err)
	}
}

// App-level admin shortcut must still fire before the Public branch — admins
// remain authorized even for admin-level requests against Public, because
// the app-admin role bypasses operation-level role checks entirely.
func TestAuthorizeOperationRole_AppAdminBypassesPublicRefusal(t *testing.T) {
	publicOp := models.SynthesizePublicOperation()
	ctx := authCtx(uuid.New(), "admin")

	if err := AuthorizeOperationRole(ctx, &publicOp, models.OperationRoleAdmin); err != nil {
		t.Fatalf("app admin should bypass Public admin refusal: %v", err)
	}
}

// Regression: existing Members-loop behaviour must not change for non-public
// operations.
func TestAuthorizeOperationRole_RegularOperation_RoleHierarchy(t *testing.T) {
	caller := uuid.New()
	op := models.Operation{
		OperationID: uuid.New(),
		Members: []models.OperationMember{
			{UserID: caller, Role: models.OperationRoleOperator},
		},
	}

	if err := AuthorizeOperationRole(authCtx(caller), &op, models.OperationRoleViewer); err != nil {
		t.Fatalf("operator should satisfy viewer requirement: %v", err)
	}
	if err := AuthorizeOperationRole(authCtx(caller), &op, models.OperationRoleOperator); err != nil {
		t.Fatalf("operator should satisfy operator requirement: %v", err)
	}
	if err := AuthorizeOperationRole(authCtx(caller), &op, models.OperationRoleAdmin); err == nil {
		t.Fatal("operator must NOT satisfy admin requirement")
	}

	stranger := authCtx(uuid.New())
	if err := AuthorizeOperationRole(stranger, &op, models.OperationRoleViewer); err == nil {
		t.Fatal("non-member must be refused")
	}
}
