package resolver

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// Authorization branch coverage for MyCredentials. These are the first
// resolver-level tests in this package; mocks live in mocks_test.go.
//
// Five branches the resolver must honour, sourced directly from the
// resolveAccessibleOperationIDs doc-comment and the
// "findings-global-mode-followups" task brief:
//
//  1. operationIDs == nil with N memberships → FindByMemberID hit, query
//     fans out across the membership set.
//  2. operationIDs == nil with zero memberships → empty connection, NO
//     fan-out query (the resolver must short-circuit).
//  3. operationIDs == [] → empty connection, NO repo call at all.
//  4. operationIDs contains an op the caller is not a member of → forbidden
//     error surfaced verbatim from AuthorizeOperationRole.
//  5. operationIDs longer than the cap → "too many operations selected".
//
// Plus the app-admin invariant (Task 9 from the follow-up plan):
//  6. App-admin with operationIDs == nil → returns the admin's *membership
//     set*, NOT every operation in the system. This is a documented invariant
//     that's only enforced by code today.

func newCallerCtx(userID uuid.UUID, roles ...string) context.Context {
	return gqlctx.WithAuthInfo(context.Background(), gqlctx.AuthInfo{
		UserID: userID.String(),
		Roles:  roles,
	})
}

// member returns an Operation with the caller present as the given role.
func memberOp(opID uuid.UUID, caller uuid.UUID, role models.OperationRole) models.Operation {
	return models.Operation{
		OperationID: opID,
		Name:        "op-" + opID.String()[:8],
		Members: []models.OperationMember{
			{UserID: caller, Role: role},
		},
	}
}

// strangerOp returns an Operation the caller is NOT a member of.
func strangerOp(opID uuid.UUID) models.Operation {
	return models.Operation{
		OperationID: opID,
		Name:        "stranger-" + opID.String()[:8],
		Members:     []models.OperationMember{}, // no caller
	}
}

func TestMyCredentials_NilOpIDs_UsesMembershipSet(t *testing.T) {
	caller := uuid.New()
	op1 := uuid.New()
	op2 := uuid.New()

	var capturedOpIDs []uuid.UUID

	credRepo := &mockCredRepo{
		countByOperationIDsFn: func(_ context.Context, opIDs []uuid.UUID, _ repository.CredentialFilter) (int64, error) {
			capturedOpIDs = opIDs
			return 0, nil
		},
		findByOperationIDsWithCursorFn: func(_ context.Context, opIDs []uuid.UUID, _ repository.CredentialFilter, _ *pagination.Cursor, _ int64, _ bool) ([]models.Credential, error) {
			return nil, nil
		},
	}
	opRepo := &mockOpRepo{
		findByMemberIDFn: func(_ context.Context, uid uuid.UUID) ([]models.Operation, error) {
			if uid != caller {
				t.Fatalf("FindByMemberID called with wrong user: got %s want %s", uid, caller)
			}
			return []models.Operation{
				memberOp(op1, caller, models.OperationRoleViewer),
				memberOp(op2, caller, models.OperationRoleOperator),
			}, nil
		},
	}

	r := &credentialResolver{credRepo: credRepo, operationRepo: opRepo, userRepo: &mockUserRepo{}}
	ctx := newCallerCtx(caller)

	conn, err := r.MyCredentials(ctx, nil, nil, nil, nil, nil, nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if conn.TotalCount != 0 {
		t.Fatalf("totalCount: got %d want 0", conn.TotalCount)
	}
	if len(capturedOpIDs) != 2 {
		t.Fatalf("opIDs sent to repo: got %d want 2 (%v)", len(capturedOpIDs), capturedOpIDs)
	}
	got := map[uuid.UUID]bool{capturedOpIDs[0]: true, capturedOpIDs[1]: true}
	if !got[op1] || !got[op2] {
		t.Fatalf("opIDs sent to repo did not match membership set: got %v want {%s,%s}", capturedOpIDs, op1, op2)
	}
}

func TestMyCredentials_NilOpIDs_ZeroMembership_ShortCircuits(t *testing.T) {
	caller := uuid.New()

	credRepo := &mockCredRepo{
		// Hooks intentionally left nil — any call panics. The resolver MUST NOT
		// query credentials when the caller has zero memberships.
	}
	opRepo := &mockOpRepo{
		findByMemberIDFn: func(_ context.Context, _ uuid.UUID) ([]models.Operation, error) {
			return []models.Operation{}, nil
		},
	}

	r := &credentialResolver{credRepo: credRepo, operationRepo: opRepo, userRepo: &mockUserRepo{}}
	ctx := newCallerCtx(caller)

	conn, err := r.MyCredentials(ctx, nil, nil, nil, nil, nil, nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if conn.TotalCount != 0 || len(conn.Edges) != 0 {
		t.Fatalf("expected empty connection, got totalCount=%d edges=%d", conn.TotalCount, len(conn.Edges))
	}
}

func TestMyCredentials_EmptyOpIDs_ShortCircuits(t *testing.T) {
	caller := uuid.New()

	// All hooks left nil — any DB call would panic. With explicit empty input
	// the resolver must not touch operations or credentials.
	credRepo := &mockCredRepo{}
	opRepo := &mockOpRepo{}

	r := &credentialResolver{credRepo: credRepo, operationRepo: opRepo, userRepo: &mockUserRepo{}}
	ctx := newCallerCtx(caller)

	conn, err := r.MyCredentials(ctx, []string{}, nil, nil, nil, nil, nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if conn.TotalCount != 0 || len(conn.Edges) != 0 {
		t.Fatalf("expected empty connection, got totalCount=%d edges=%d", conn.TotalCount, len(conn.Edges))
	}
}

func TestMyCredentials_ExplicitOpIDs_NotMember_Forbidden(t *testing.T) {
	caller := uuid.New()
	memberID := uuid.New()
	strangerID := uuid.New()

	credRepo := &mockCredRepo{
		// No hooks — the resolver must reject before any credential query.
	}
	opRepo := &mockOpRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.Operation, error) {
			switch id {
			case memberID:
				return memberOp(memberID, caller, models.OperationRoleViewer), nil
			case strangerID:
				return strangerOp(strangerID), nil
			default:
				return models.Operation{}, errors.New("not found")
			}
		},
	}

	r := &credentialResolver{credRepo: credRepo, operationRepo: opRepo, userRepo: &mockUserRepo{}}
	ctx := newCallerCtx(caller)

	_, err := r.MyCredentials(ctx, []string{memberID.String(), strangerID.String()}, nil, nil, nil, nil, nil, nil, nil, nil)
	if err == nil {
		t.Fatal("expected forbidden error, got nil")
	}
	if !strings.Contains(err.Error(), "forbidden") {
		t.Fatalf("expected forbidden error, got: %v", err)
	}
}

func TestMyCredentials_ExplicitOpIDs_OverCap_Rejected(t *testing.T) {
	caller := uuid.New()

	credRepo := &mockCredRepo{}
	// The cap check runs before any FindByID call, so opRepo hooks stay nil.
	opRepo := &mockOpRepo{}

	r := &credentialResolver{credRepo: credRepo, operationRepo: opRepo, userRepo: &mockUserRepo{}}
	ctx := newCallerCtx(caller)

	tooMany := make([]string, myCredentialsOpCap+1)
	for i := range tooMany {
		tooMany[i] = uuid.New().String()
	}

	_, err := r.MyCredentials(ctx, tooMany, nil, nil, nil, nil, nil, nil, nil, nil)
	if err == nil {
		t.Fatal("expected over-cap error, got nil")
	}
	if !strings.Contains(err.Error(), "too many operations selected") {
		t.Fatalf("expected over-cap error, got: %v", err)
	}
}

// TestMyCredentials_AppAdmin_NilOpIDs_ReturnsMembershipSet pins the documented
// invariant from resolveAccessibleOperationIDs: app-admins with operationIDs=nil
// receive their own membership set, NOT every operation in the system. Admins
// who want all ops must pick them explicitly.
func TestMyCredentials_AppAdmin_NilOpIDs_ReturnsMembershipSet(t *testing.T) {
	admin := uuid.New()
	adminOp := uuid.New()

	var findByMemberCalled int
	var capturedOpIDs []uuid.UUID

	credRepo := &mockCredRepo{
		countByOperationIDsFn: func(_ context.Context, opIDs []uuid.UUID, _ repository.CredentialFilter) (int64, error) {
			capturedOpIDs = opIDs
			return 0, nil
		},
		findByOperationIDsWithCursorFn: func(_ context.Context, _ []uuid.UUID, _ repository.CredentialFilter, _ *pagination.Cursor, _ int64, _ bool) ([]models.Credential, error) {
			return nil, nil
		},
	}
	opRepo := &mockOpRepo{
		findByMemberIDFn: func(_ context.Context, uid uuid.UUID) ([]models.Operation, error) {
			findByMemberCalled++
			if uid != admin {
				t.Fatalf("FindByMemberID called with wrong user: got %s want %s", uid, admin)
			}
			return []models.Operation{
				memberOp(adminOp, admin, models.OperationRoleAdmin),
			}, nil
		},
		// FindAll / Count are not used — if the admin branch ever delegates to
		// "every operation in the system" it would call one of these. Leaving
		// them nil ensures any drift gets caught.
	}

	r := &credentialResolver{credRepo: credRepo, operationRepo: opRepo, userRepo: &mockUserRepo{}}
	ctx := newCallerCtx(admin, "admin")

	_, err := r.MyCredentials(ctx, nil, nil, nil, nil, nil, nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if findByMemberCalled != 1 {
		t.Fatalf("FindByMemberID call count: got %d want 1", findByMemberCalled)
	}
	if len(capturedOpIDs) != 1 || capturedOpIDs[0] != adminOp {
		t.Fatalf("opIDs sent to repo: got %v want [%s]", capturedOpIDs, adminOp)
	}
}
