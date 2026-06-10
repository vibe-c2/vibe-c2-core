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

// mockHostRepo is a function-field mock of IHostRepository. Unset hooks panic
// if called — the signal that the resolver took an unexpected path.
type mockHostRepo struct {
	createFn                      func(ctx context.Context, h *models.Host) error
	findByIDFn                    func(ctx context.Context, id uuid.UUID) (models.Host, error)
	findByOperationIDWithCursorFn func(ctx context.Context, opID uuid.UUID, filter repository.HostFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Host, error)
	countByOperationIDFn          func(ctx context.Context, opID uuid.UUID, filter repository.HostFilter) (int64, error)
	updateFn                      func(ctx context.Context, h *models.Host, updates map[string]interface{}) error
	deleteFn                      func(ctx context.Context, h *models.Host) error
	deleteByOperationIDFn         func(ctx context.Context, operationID uuid.UUID) error
}

func (m *mockHostRepo) Create(ctx context.Context, h *models.Host) error {
	return m.createFn(ctx, h)
}
func (m *mockHostRepo) FindByID(ctx context.Context, id uuid.UUID) (models.Host, error) {
	return m.findByIDFn(ctx, id)
}
func (m *mockHostRepo) FindByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, filter repository.HostFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Host, error) {
	return m.findByOperationIDWithCursorFn(ctx, opID, filter, cursor, limit, forward)
}
func (m *mockHostRepo) CountByOperationID(ctx context.Context, opID uuid.UUID, filter repository.HostFilter) (int64, error) {
	return m.countByOperationIDFn(ctx, opID, filter)
}
func (m *mockHostRepo) Update(ctx context.Context, h *models.Host, updates map[string]interface{}) error {
	return m.updateFn(ctx, h, updates)
}
func (m *mockHostRepo) Delete(ctx context.Context, h *models.Host) error {
	return m.deleteFn(ctx, h)
}
func (m *mockHostRepo) DeleteByOperationID(ctx context.Context, operationID uuid.UUID) error {
	return m.deleteByOperationIDFn(ctx, operationID)
}

var _ repository.IHostRepository = (*mockHostRepo)(nil)

// newHostResolver wires the resolver under test with the given host/op repos.
// userRepo and eventBus are stubbed (nil bus → NopEventBus).
func newHostResolver(hostRepo repository.IHostRepository, opRepo repository.IOperationRepository) IHostResolver {
	return NewHostResolver(hostRepo, opRepo, &mockUserRepo{}, nil)
}

func strptr(s string) *string { return &s }

// --- CreateHost ---

func TestCreateHost_Success_PopulatesCreatedByAndNormalizes(t *testing.T) {
	// Arrange
	caller := uuid.New()
	opID := uuid.New()
	var captured *models.Host

	hostRepo := &mockHostRepo{
		createFn: func(_ context.Context, h *models.Host) error {
			captured = h
			return nil
		},
	}
	opRepo := &mockOpRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.Operation, error) {
			return memberOp(id, caller, models.OperationRoleOperator), nil
		},
	}
	r := newHostResolver(hostRepo, opRepo)

	input := model.CreateHostInput{
		Hostname: "  DC01  ",
		Os:       strptr("Windows Server 2019"),
		Interfaces: []*model.NetworkInterfaceInput{
			{Name: "eth0", Mac: strptr("00:11:22:33:44:55"), Addresses: []string{"10.0.5.12/24", "  "}},
		},
		Routes: []*model.RouteInput{
			{Destination: "0.0.0.0/0", Gateway: strptr("10.0.5.1"), Interface: strptr("eth0")},
		},
	}

	// Act
	host, err := r.CreateHost(newCallerCtx(caller), opID.String(), input)

	// Assert
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if host.CreatedByID != caller {
		t.Errorf("CreatedByID = %s, want %s", host.CreatedByID, caller)
	}
	if host.Hostname != "DC01" {
		t.Errorf("Hostname = %q, want trimmed %q", host.Hostname, "DC01")
	}
	if host.OperationID != opID {
		t.Errorf("OperationID = %s, want %s", host.OperationID, opID)
	}
	if len(host.Interfaces) != 1 || len(host.Interfaces[0].Addresses) != 1 {
		t.Fatalf("expected 1 interface with 1 address (blank dropped), got %+v", host.Interfaces)
	}
	if host.Interfaces[0].Addresses[0] != "10.0.5.12/24" {
		t.Errorf("address = %q, want %q", host.Interfaces[0].Addresses[0], "10.0.5.12/24")
	}
	if captured == nil || captured.HostID != host.HostID {
		t.Error("expected the created host to be persisted via the repo")
	}
}

func TestCreateHost_ViewerForbidden(t *testing.T) {
	caller := uuid.New()
	opID := uuid.New()

	hostRepo := &mockHostRepo{
		createFn: func(_ context.Context, _ *models.Host) error {
			t.Fatal("Create must not be called when authorization fails")
			return nil
		},
	}
	opRepo := &mockOpRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.Operation, error) {
			return memberOp(id, caller, models.OperationRoleViewer), nil
		},
	}
	r := newHostResolver(hostRepo, opRepo)

	_, err := r.CreateHost(newCallerCtx(caller), opID.String(), model.CreateHostInput{Hostname: "x"})
	if err == nil {
		t.Fatal("expected forbidden error for viewer creating a host")
	}
}

func TestCreateHost_EmptyHostnameRejected(t *testing.T) {
	caller := uuid.New()
	opID := uuid.New()
	opRepo := &mockOpRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.Operation, error) {
			return memberOp(id, caller, models.OperationRoleOperator), nil
		},
	}
	r := newHostResolver(&mockHostRepo{}, opRepo)

	_, err := r.CreateHost(newCallerCtx(caller), opID.String(), model.CreateHostInput{Hostname: "   "})
	if err == nil || !strings.Contains(err.Error(), "hostname is required") {
		t.Fatalf("expected hostname-required error, got %v", err)
	}
}

func TestCreateHost_InvalidCIDRRejected(t *testing.T) {
	caller := uuid.New()
	opID := uuid.New()
	opRepo := &mockOpRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.Operation, error) {
			return memberOp(id, caller, models.OperationRoleOperator), nil
		},
	}
	hostRepo := &mockHostRepo{
		createFn: func(_ context.Context, _ *models.Host) error {
			t.Fatal("Create must not run when validation fails")
			return nil
		},
	}
	r := newHostResolver(hostRepo, opRepo)

	input := model.CreateHostInput{
		Hostname:   "h",
		Interfaces: []*model.NetworkInterfaceInput{{Name: "eth0", Addresses: []string{"10.0.5.12"}}}, // missing /prefix
	}
	_, err := r.CreateHost(newCallerCtx(caller), opID.String(), input)
	if err == nil || !strings.Contains(err.Error(), "invalid interface address") {
		t.Fatalf("expected invalid-CIDR error, got %v", err)
	}
}

// --- UpdateHost ---

func TestUpdateHost_PartialUpdateOnlyTouchesProvidedFields(t *testing.T) {
	caller := uuid.New()
	opID := uuid.New()
	hostID := uuid.New()
	existing := models.Host{HostID: hostID, OperationID: opID, Hostname: "old", OS: "linux"}

	var capturedUpdates map[string]interface{}
	hostRepo := &mockHostRepo{
		findByIDFn: func(_ context.Context, _ uuid.UUID) (models.Host, error) { return existing, nil },
		updateFn: func(_ context.Context, _ *models.Host, updates map[string]interface{}) error {
			capturedUpdates = updates
			return nil
		},
	}
	opRepo := &mockOpRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.Operation, error) {
			return memberOp(id, caller, models.OperationRoleOperator), nil
		},
	}
	r := newHostResolver(hostRepo, opRepo)

	_, err := r.UpdateHost(newCallerCtx(caller), hostID.String(), model.UpdateHostInput{Hostname: strptr("new")})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if _, ok := capturedUpdates["hostname"]; !ok {
		t.Error("expected hostname in update set")
	}
	if _, ok := capturedUpdates["os"]; ok {
		t.Error("os was not provided and must not appear in the update set")
	}
}

// --- DeleteHost ---

func TestDeleteHost_ViewerForbidden(t *testing.T) {
	caller := uuid.New()
	opID := uuid.New()
	hostID := uuid.New()
	hostRepo := &mockHostRepo{
		findByIDFn: func(_ context.Context, _ uuid.UUID) (models.Host, error) {
			return models.Host{HostID: hostID, OperationID: opID}, nil
		},
		deleteFn: func(_ context.Context, _ *models.Host) error {
			t.Fatal("Delete must not be called when authorization fails")
			return nil
		},
	}
	opRepo := &mockOpRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.Operation, error) {
			return memberOp(id, caller, models.OperationRoleViewer), nil
		},
	}
	r := newHostResolver(hostRepo, opRepo)

	_, err := r.DeleteHost(newCallerCtx(caller), hostID.String())
	if err == nil {
		t.Fatal("expected forbidden error for viewer deleting a host")
	}
}

// --- Hosts (list) ---

func TestHosts_BuildsConnection(t *testing.T) {
	caller := uuid.New()
	opID := uuid.New()
	hostRepo := &mockHostRepo{
		countByOperationIDFn: func(_ context.Context, _ uuid.UUID, _ repository.HostFilter) (int64, error) {
			return 2, nil
		},
		findByOperationIDWithCursorFn: func(_ context.Context, _ uuid.UUID, _ repository.HostFilter, _ *pagination.Cursor, _ int64, _ bool) ([]models.Host, error) {
			return []models.Host{
				{HostID: uuid.New(), OperationID: opID, Hostname: "a"},
				{HostID: uuid.New(), OperationID: opID, Hostname: "b"},
			}, nil
		},
	}
	opRepo := &mockOpRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.Operation, error) {
			return memberOp(id, caller, models.OperationRoleViewer), nil
		},
	}
	r := newHostResolver(hostRepo, opRepo)

	conn, err := r.Hosts(newCallerCtx(caller), opID.String(), nil, nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if conn.TotalCount != 2 {
		t.Errorf("TotalCount = %d, want 2", conn.TotalCount)
	}
	if len(conn.Edges) != 2 {
		t.Errorf("len(edges) = %d, want 2", len(conn.Edges))
	}
}

func TestHosts_NonMemberForbidden(t *testing.T) {
	caller := uuid.New()
	opID := uuid.New()
	opRepo := &mockOpRepo{
		findByIDFn: func(_ context.Context, id uuid.UUID) (models.Operation, error) {
			return strangerOp(id), nil
		},
	}
	r := newHostResolver(&mockHostRepo{}, opRepo)

	_, err := r.Hosts(newCallerCtx(caller), opID.String(), nil, nil, nil, nil, nil)
	if err == nil {
		t.Fatal("expected forbidden error for non-member listing hosts")
	}
}

// --- normalization unit tests ---

func TestNormalizeRoutes_ValidatesAndDrops(t *testing.T) {
	// default route with valid gateway, plus a fully-empty entry that is dropped.
	in := []*model.RouteInput{
		{Destination: "0.0.0.0/0", Gateway: strptr("10.0.5.1")},
		{Destination: "", Gateway: nil, Interface: nil},
	}
	out, err := normalizeRoutes(in)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(out) != 1 {
		t.Fatalf("expected 1 route (empty dropped), got %d", len(out))
	}
	if out[0].Destination != "0.0.0.0/0" {
		t.Errorf("destination = %q", out[0].Destination)
	}
}

func TestNormalizeRoutes_InvalidGatewayRejected(t *testing.T) {
	in := []*model.RouteInput{{Destination: "10.0.0.0/8", Gateway: strptr("not-an-ip")}}
	if _, err := normalizeRoutes(in); err == nil {
		t.Fatal("expected invalid-gateway error")
	}
}
