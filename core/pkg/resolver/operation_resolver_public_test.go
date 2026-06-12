package resolver

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// Tests for the synthetic Public operation surface on operationResolver:
// the five mutation refusals, the CreateOperation reserved-name guard, and
// the MyOperationRole implicit-operator branch.

// mustNotCall returns a panicking stub — set as the *Fn fields the test
// expects to be untouched, so any accidental repo hit fails loudly instead
// of silently masking a regression.
func panicRepo() *mockOpRepo {
	panicAny := func() {
		panic("repo method should not have been called for Public")
	}
	return &mockOpRepo{
		createFn:               func(context.Context, *models.Operation) error { panicAny(); return nil },
		findByIDFn:             func(context.Context, uuid.UUID) (models.Operation, error) { panicAny(); return models.Operation{}, nil },
		findAllFn:              func(context.Context, string, int64, int64, *uuid.UUID) ([]models.Operation, error) { panicAny(); return nil, nil },
		findWithCursorFn:       func(context.Context, string, repository.OperationSort, *pagination.Cursor, int64, bool, *uuid.UUID) ([]models.Operation, error) { panicAny(); return nil, nil },
		countFn:                func(context.Context, string, *uuid.UUID) (int64, error) { panicAny(); return 0, nil },
		updateFn:               func(context.Context, *models.Operation, map[string]interface{}) error { panicAny(); return nil },
		deleteFn:               func(context.Context, *models.Operation) error { panicAny(); return nil },
		addMemberFn:            func(context.Context, uuid.UUID, uuid.UUID, models.OperationRole) error { panicAny(); return nil },
		removeMemberFn:         func(context.Context, uuid.UUID, uuid.UUID) error { panicAny(); return nil },
		updateMemberRoleFn:     func(context.Context, uuid.UUID, uuid.UUID, models.OperationRole) error { panicAny(); return nil },
		findByMemberIDFn:       func(context.Context, uuid.UUID) ([]models.Operation, error) { panicAny(); return nil, nil },
		removeMemberSafeFn:     func(context.Context, uuid.UUID, uuid.UUID) error { panicAny(); return nil },
		updateMemberRoleSafeFn: func(context.Context, uuid.UUID, uuid.UUID, models.OperationRole) error { panicAny(); return nil },
	}
}

func newOpResolver(opRepo *mockOpRepo) *operationResolver {
	return &operationResolver{operationRepo: opRepo, userRepo: &mockUserRepo{}}
}

func TestOperationResolver_MyOperationRole_Public(t *testing.T) {
	r := newOpResolver(panicRepo())
	ctx := newCallerCtx(uuid.New())

	role, err := r.MyOperationRole(ctx, models.PublicOperationID.String())
	if err != nil {
		t.Fatalf("MyOperationRole(public): %v", err)
	}
	if role == nil || *role != models.OperationRoleOperator {
		t.Fatalf("MyOperationRole(public): got %v want operator", role)
	}
}

// Mutation refusals: every Public-targeted Update/Delete/AddMember/
// RemoveMember/UpdateMemberRole must error before the repo is touched.
func TestOperationResolver_MutationRefusals_Public(t *testing.T) {
	pub := models.PublicOperationID.String()
	someUser := uuid.New().String()

	cases := []struct {
		name string
		call func(*operationResolver) error
	}{
		{"UpdateOperation", func(r *operationResolver) error {
			_, err := r.UpdateOperation(newCallerCtx(uuid.New()), pub, model.UpdateOperationInput{})
			return err
		}},
		{"DeleteOperation", func(r *operationResolver) error {
			_, err := r.DeleteOperation(newCallerCtx(uuid.New()), pub)
			return err
		}},
		{"AddOperationMember", func(r *operationResolver) error {
			_, err := r.AddOperationMember(newCallerCtx(uuid.New()), pub, someUser, models.OperationRoleOperator)
			return err
		}},
		{"RemoveOperationMember", func(r *operationResolver) error {
			_, err := r.RemoveOperationMember(newCallerCtx(uuid.New()), pub, someUser)
			return err
		}},
		{"UpdateOperationMemberRole", func(r *operationResolver) error {
			_, err := r.UpdateOperationMemberRole(newCallerCtx(uuid.New()), pub, someUser, models.OperationRoleViewer)
			return err
		}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := newOpResolver(panicRepo())
			err := tc.call(r)
			if err == nil {
				t.Fatalf("%s on Public must error", tc.name)
			}
			if !strings.Contains(err.Error(), "Public") {
				t.Fatalf("%s error should mention Public: %v", tc.name, err)
			}
		})
	}
}

// CreateOperation must refuse the reserved name "Public" case-insensitively.
func TestOperationResolver_CreateOperation_ReservedName(t *testing.T) {
	for _, name := range []string{"Public", "public", "PUBLIC", "  Public  "} {
		t.Run(name, func(t *testing.T) {
			r := newOpResolver(panicRepo())
			input := model.CreateOperationInput{Name: name}
			_, err := r.CreateOperation(newCallerCtx(uuid.New()), input)
			if err == nil {
				t.Fatalf("CreateOperation(name=%q) should be refused", name)
			}
			if !strings.Contains(err.Error(), "reserved") {
				t.Fatalf("error should mention reservation: %v", err)
			}
		})
	}
}
