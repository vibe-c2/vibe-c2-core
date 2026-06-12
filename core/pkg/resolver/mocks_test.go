package resolver

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// mockCredRepo is a function-field mock of ICredentialRepository for resolver
// tests. Each method delegates to a corresponding hook field; tests set only
// the hooks they need, and any unset hook panics if called — that's the signal
// that the resolver took an unexpected path through the code under test.
type mockCredRepo struct {
	createFn                       func(ctx context.Context, c *models.Credential) error
	findByIDFn                     func(ctx context.Context, id uuid.UUID) (models.Credential, error)
	findByOperationIDWithCursorFn  func(ctx context.Context, opID uuid.UUID, filter repository.CredentialFilter, sort repository.CredentialSort, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Credential, error)
	countByOperationIDFn           func(ctx context.Context, opID uuid.UUID, filter repository.CredentialFilter) (int64, error)
	distinctTagsByOperationIDFn    func(ctx context.Context, opID uuid.UUID) ([]string, error)
	findByOperationIDsWithCursorFn func(ctx context.Context, opIDs []uuid.UUID, filter repository.CredentialFilter, sort repository.CredentialSort, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Credential, error)
	countByOperationIDsFn          func(ctx context.Context, opIDs []uuid.UUID, filter repository.CredentialFilter) (int64, error)
	distinctTagsByOperationIDsFn   func(ctx context.Context, opIDs []uuid.UUID) ([]string, error)
	updateFn                       func(ctx context.Context, c *models.Credential, updates map[string]interface{}) error
	deleteFn                       func(ctx context.Context, c *models.Credential) error
	deleteByOperationIDFn          func(ctx context.Context, operationID uuid.UUID) error
	addCommentFn                   func(ctx context.Context, credentialID uuid.UUID, comment models.CredentialComment) error
	updateCommentFn                func(ctx context.Context, credentialID, commentID uuid.UUID, text string, updatedAt time.Time) error
	removeCommentFn                func(ctx context.Context, credentialID, commentID uuid.UUID) error
}

func (m *mockCredRepo) Create(ctx context.Context, c *models.Credential) error {
	return m.createFn(ctx, c)
}
func (m *mockCredRepo) FindByID(ctx context.Context, id uuid.UUID) (models.Credential, error) {
	return m.findByIDFn(ctx, id)
}
func (m *mockCredRepo) FindByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, filter repository.CredentialFilter, sort repository.CredentialSort, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Credential, error) {
	return m.findByOperationIDWithCursorFn(ctx, opID, filter, sort, cursor, limit, forward)
}
func (m *mockCredRepo) CountByOperationID(ctx context.Context, opID uuid.UUID, filter repository.CredentialFilter) (int64, error) {
	return m.countByOperationIDFn(ctx, opID, filter)
}
func (m *mockCredRepo) DistinctTagsByOperationID(ctx context.Context, opID uuid.UUID) ([]string, error) {
	return m.distinctTagsByOperationIDFn(ctx, opID)
}
func (m *mockCredRepo) FindByOperationIDsWithCursor(ctx context.Context, opIDs []uuid.UUID, filter repository.CredentialFilter, sort repository.CredentialSort, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Credential, error) {
	return m.findByOperationIDsWithCursorFn(ctx, opIDs, filter, sort, cursor, limit, forward)
}
func (m *mockCredRepo) CountByOperationIDs(ctx context.Context, opIDs []uuid.UUID, filter repository.CredentialFilter) (int64, error) {
	return m.countByOperationIDsFn(ctx, opIDs, filter)
}
func (m *mockCredRepo) DistinctTagsByOperationIDs(ctx context.Context, opIDs []uuid.UUID) ([]string, error) {
	return m.distinctTagsByOperationIDsFn(ctx, opIDs)
}
func (m *mockCredRepo) Update(ctx context.Context, c *models.Credential, updates map[string]interface{}) error {
	return m.updateFn(ctx, c, updates)
}
func (m *mockCredRepo) Delete(ctx context.Context, c *models.Credential) error {
	return m.deleteFn(ctx, c)
}
func (m *mockCredRepo) DeleteByOperationID(ctx context.Context, operationID uuid.UUID) error {
	return m.deleteByOperationIDFn(ctx, operationID)
}
func (m *mockCredRepo) AddComment(ctx context.Context, credentialID uuid.UUID, comment models.CredentialComment) error {
	return m.addCommentFn(ctx, credentialID, comment)
}
func (m *mockCredRepo) UpdateComment(ctx context.Context, credentialID, commentID uuid.UUID, text string, updatedAt time.Time) error {
	return m.updateCommentFn(ctx, credentialID, commentID, text, updatedAt)
}
func (m *mockCredRepo) RemoveComment(ctx context.Context, credentialID, commentID uuid.UUID) error {
	return m.removeCommentFn(ctx, credentialID, commentID)
}

// mockOpRepo is a function-field mock of IOperationRepository.
type mockOpRepo struct {
	createFn                func(ctx context.Context, op *models.Operation) error
	findByIDFn              func(ctx context.Context, id uuid.UUID) (models.Operation, error)
	findAllFn               func(ctx context.Context, search string, offset, limit int64, memberID *uuid.UUID) ([]models.Operation, error)
	findWithCursorFn        func(ctx context.Context, search string, sort repository.OperationSort, cursor *pagination.Cursor, limit int64, forward bool, memberID *uuid.UUID) ([]models.Operation, error)
	countFn                 func(ctx context.Context, search string, memberID *uuid.UUID) (int64, error)
	updateFn                func(ctx context.Context, op *models.Operation, updates map[string]interface{}) error
	deleteFn                func(ctx context.Context, op *models.Operation) error
	addMemberFn             func(ctx context.Context, operationID uuid.UUID, userID uuid.UUID, role models.OperationRole) error
	removeMemberFn          func(ctx context.Context, operationID uuid.UUID, userID uuid.UUID) error
	updateMemberRoleFn      func(ctx context.Context, operationID uuid.UUID, userID uuid.UUID, role models.OperationRole) error
	findByMemberIDFn        func(ctx context.Context, userID uuid.UUID) ([]models.Operation, error)
	removeMemberSafeFn      func(ctx context.Context, operationID uuid.UUID, userID uuid.UUID) error
	updateMemberRoleSafeFn  func(ctx context.Context, operationID uuid.UUID, userID uuid.UUID, role models.OperationRole) error
}

func (m *mockOpRepo) Create(ctx context.Context, op *models.Operation) error {
	return m.createFn(ctx, op)
}
func (m *mockOpRepo) FindByID(ctx context.Context, id uuid.UUID) (models.Operation, error) {
	return m.findByIDFn(ctx, id)
}
func (m *mockOpRepo) FindAll(ctx context.Context, search string, offset, limit int64, memberID *uuid.UUID) ([]models.Operation, error) {
	return m.findAllFn(ctx, search, offset, limit, memberID)
}
func (m *mockOpRepo) FindWithCursor(ctx context.Context, search string, sort repository.OperationSort, cursor *pagination.Cursor, limit int64, forward bool, memberID *uuid.UUID) ([]models.Operation, error) {
	return m.findWithCursorFn(ctx, search, sort, cursor, limit, forward, memberID)
}
func (m *mockOpRepo) Count(ctx context.Context, search string, memberID *uuid.UUID) (int64, error) {
	return m.countFn(ctx, search, memberID)
}
func (m *mockOpRepo) Update(ctx context.Context, op *models.Operation, updates map[string]interface{}) error {
	return m.updateFn(ctx, op, updates)
}
func (m *mockOpRepo) Delete(ctx context.Context, op *models.Operation) error {
	return m.deleteFn(ctx, op)
}
func (m *mockOpRepo) AddMember(ctx context.Context, operationID uuid.UUID, userID uuid.UUID, role models.OperationRole) error {
	return m.addMemberFn(ctx, operationID, userID, role)
}
func (m *mockOpRepo) RemoveMember(ctx context.Context, operationID uuid.UUID, userID uuid.UUID) error {
	return m.removeMemberFn(ctx, operationID, userID)
}
func (m *mockOpRepo) UpdateMemberRole(ctx context.Context, operationID uuid.UUID, userID uuid.UUID, role models.OperationRole) error {
	return m.updateMemberRoleFn(ctx, operationID, userID, role)
}
func (m *mockOpRepo) FindByMemberID(ctx context.Context, userID uuid.UUID) ([]models.Operation, error) {
	return m.findByMemberIDFn(ctx, userID)
}
func (m *mockOpRepo) RemoveMemberSafe(ctx context.Context, operationID uuid.UUID, userID uuid.UUID) error {
	return m.removeMemberSafeFn(ctx, operationID, userID)
}
func (m *mockOpRepo) UpdateMemberRoleSafe(ctx context.Context, operationID uuid.UUID, userID uuid.UUID, role models.OperationRole) error {
	return m.updateMemberRoleSafeFn(ctx, operationID, userID, role)
}

// mockUserRepo is a function-field mock of IUserRepository. MyCredentials
// itself doesn't read users, but the resolver constructor takes the
// dependency, so we keep a stub here for completeness.
type mockUserRepo struct {
	existsByUsernameFn func(ctx context.Context, username string) (bool, error)
	findByUsernameFn   func(ctx context.Context, username string) (models.User, error)
	createFn           func(ctx context.Context, user *models.User) error
	countFn            func(ctx context.Context, search string) (int64, error)
	findAllFn          func(ctx context.Context, search string, offset, limit int64) ([]models.User, error)
	findWithCursorFn   func(ctx context.Context, search string, sort repository.UserSort, cursor *pagination.Cursor, limit int64, forward bool) ([]models.User, error)
	findByIDFn         func(ctx context.Context, id uuid.UUID) (models.User, error)
	findSuggestionsFn  func(ctx context.Context, search string, limit int64) ([]models.User, error)
	updateFn           func(ctx context.Context, user *models.User, updates map[string]interface{}) error
	deleteFn           func(ctx context.Context, user *models.User) error
}

func (m *mockUserRepo) ExistsByUsername(ctx context.Context, username string) (bool, error) {
	return m.existsByUsernameFn(ctx, username)
}
func (m *mockUserRepo) FindByUsername(ctx context.Context, username string) (models.User, error) {
	return m.findByUsernameFn(ctx, username)
}
func (m *mockUserRepo) Create(ctx context.Context, user *models.User) error {
	return m.createFn(ctx, user)
}
func (m *mockUserRepo) Count(ctx context.Context, search string) (int64, error) {
	return m.countFn(ctx, search)
}
func (m *mockUserRepo) FindAll(ctx context.Context, search string, offset, limit int64) ([]models.User, error) {
	return m.findAllFn(ctx, search, offset, limit)
}
func (m *mockUserRepo) FindWithCursor(ctx context.Context, search string, sort repository.UserSort, cursor *pagination.Cursor, limit int64, forward bool) ([]models.User, error) {
	return m.findWithCursorFn(ctx, search, sort, cursor, limit, forward)
}
func (m *mockUserRepo) FindByID(ctx context.Context, id uuid.UUID) (models.User, error) {
	return m.findByIDFn(ctx, id)
}
func (m *mockUserRepo) FindSuggestions(ctx context.Context, search string, limit int64) ([]models.User, error) {
	return m.findSuggestionsFn(ctx, search, limit)
}
func (m *mockUserRepo) Update(ctx context.Context, user *models.User, updates map[string]interface{}) error {
	return m.updateFn(ctx, user, updates)
}
func (m *mockUserRepo) Delete(ctx context.Context, user *models.User) error {
	return m.deleteFn(ctx, user)
}

// compile-time interface conformance checks
var (
	_ repository.ICredentialRepository = (*mockCredRepo)(nil)
	_ repository.IOperationRepository  = (*mockOpRepo)(nil)
	_ repository.IUserRepository       = (*mockUserRepo)(nil)
)
