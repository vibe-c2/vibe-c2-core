package resolver

import (
	"context"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/authorization"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// IHostResolver defines the business logic methods for the Host entity. These
// map 1:1 to the GraphQL query, mutation, and field resolvers for Host.
type IHostResolver interface {
	// Mutations
	CreateHost(ctx context.Context, operationID string, input model.CreateHostInput) (*models.Host, error)
	UpdateHost(ctx context.Context, id string, input model.UpdateHostInput) (*models.Host, error)
	DeleteHost(ctx context.Context, id string) (bool, error)

	// Queries
	Host(ctx context.Context, id string) (*models.Host, error)
	Hosts(ctx context.Context, operationID string, search *string, first *int, after *string, last *int, before *string) (*model.HostConnection, error)

	// Field resolvers for Host type
	ID(ctx context.Context, obj *models.Host) (string, error)
	OperationIDField(ctx context.Context, obj *models.Host) (string, error)
	Operation(ctx context.Context, obj *models.Host) (*models.Operation, error)
	CreatedBy(ctx context.Context, obj *models.Host) (*models.User, error)
	CreatedAt(ctx context.Context, obj *models.Host) (string, error)
	UpdatedAt(ctx context.Context, obj *models.Host) (string, error)
}

type hostResolver struct {
	hostRepo      repository.IHostRepository
	operationRepo repository.IOperationRepository
	userRepo      repository.IUserRepository
	eventBus      eventbus.IEventBus
}

// NewHostResolver creates a new host resolver with the given dependencies.
func NewHostResolver(
	hostRepo repository.IHostRepository,
	operationRepo repository.IOperationRepository,
	userRepo repository.IUserRepository,
	bus eventbus.IEventBus,
) IHostResolver {
	if bus == nil {
		bus = eventbus.NewNopEventBus()
	}
	return &hostResolver{
		hostRepo:      hostRepo,
		operationRepo: operationRepo,
		userRepo:      userRepo,
		eventBus:      bus,
	}
}

// authorizeForOperation enforces a minimum operation role on the caller.
func (r *hostResolver) authorizeForOperation(ctx context.Context, operationID uuid.UUID, minRole models.OperationRole) error {
	op, err := r.operationRepo.FindByID(ctx, operationID)
	if err != nil {
		return fmt.Errorf("operation not found: %w", err)
	}
	return authorization.AuthorizeOperationRole(ctx, &op, minRole)
}

// CreateHost creates a new host in an operation.
// Requires at least operator role in the operation.
func (r *hostResolver) CreateHost(ctx context.Context, operationID string, input model.CreateHostInput) (*models.Host, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	hostname := strings.TrimSpace(input.Hostname)
	if hostname == "" {
		return nil, fmt.Errorf("hostname is required")
	}

	interfaces, err := normalizeInterfaces(input.Interfaces)
	if err != nil {
		return nil, err
	}
	routes, err := normalizeRoutes(input.Routes)
	if err != nil {
		return nil, err
	}

	auth := gqlctx.AuthFromContext(ctx)
	callerUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid caller ID: %w", err)
	}

	host := &models.Host{
		HostID:      uuid.New(),
		OperationID: opUID,
		Hostname:    hostname,
		Interfaces:  interfaces,
		Routes:      routes,
		OS:          strings.TrimSpace(strDeref(input.Os)),
		CreatedByID: callerUID,
	}

	if err := r.hostRepo.Create(ctx, host); err != nil {
		return nil, fmt.Errorf("failed to create host: %w", err)
	}

	r.eventBus.Publish(eventbus.NewHostCreatedEvent(
		eventbus.UserActor(auth.UserID),
		eventbus.HostEventPayload{
			HostID:      host.HostID.String(),
			OperationID: host.OperationID.String(),
		},
	))

	return host, nil
}

// UpdateHost applies a partial update to an existing host.
// Requires at least operator role in the operation.
func (r *hostResolver) UpdateHost(ctx context.Context, id string, input model.UpdateHostInput) (*models.Host, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid host ID: %w", err)
	}

	host, err := r.hostRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("host not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, host.OperationID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	updates := make(map[string]interface{})
	if input.Hostname != nil {
		hostname := strings.TrimSpace(*input.Hostname)
		if hostname == "" {
			return nil, fmt.Errorf("hostname cannot be empty")
		}
		updates["hostname"] = hostname
	}
	if input.Interfaces != nil {
		interfaces, err := normalizeInterfaces(input.Interfaces)
		if err != nil {
			return nil, err
		}
		updates["interfaces"] = interfaces
	}
	if input.Routes != nil {
		routes, err := normalizeRoutes(input.Routes)
		if err != nil {
			return nil, err
		}
		updates["routes"] = routes
	}
	if input.Os != nil {
		updates["os"] = strings.TrimSpace(*input.Os)
	}

	if len(updates) == 0 {
		return &host, nil
	}

	if err := r.hostRepo.Update(ctx, &host, updates); err != nil {
		return nil, fmt.Errorf("failed to update host: %w", err)
	}

	updated, err := r.hostRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated host: %w", err)
	}

	auth := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewHostUpdatedEvent(
		eventbus.UserActor(auth.UserID),
		eventbus.HostEventPayload{
			HostID:      updated.HostID.String(),
			OperationID: updated.OperationID.String(),
		},
	))

	return &updated, nil
}

// DeleteHost removes a host by ID.
// Requires at least operator role in the operation.
func (r *hostResolver) DeleteHost(ctx context.Context, id string) (bool, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return false, fmt.Errorf("invalid host ID: %w", err)
	}

	host, err := r.hostRepo.FindByID(ctx, uid)
	if err != nil {
		return false, fmt.Errorf("host not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, host.OperationID, models.OperationRoleOperator); err != nil {
		return false, err
	}

	if err := r.hostRepo.Delete(ctx, &host); err != nil {
		return false, fmt.Errorf("failed to delete host: %w", err)
	}

	auth := gqlctx.AuthFromContext(ctx)
	r.eventBus.Publish(eventbus.NewHostDeletedEvent(
		eventbus.UserActor(auth.UserID),
		eventbus.HostEventPayload{
			HostID:      host.HostID.String(),
			OperationID: host.OperationID.String(),
		},
	))

	return true, nil
}

// Host returns a single host by ID.
// Requires at least viewer role in the operation.
func (r *hostResolver) Host(ctx context.Context, id string) (*models.Host, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid host ID: %w", err)
	}

	host, err := r.hostRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("host not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, host.OperationID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	return &host, nil
}

// Hosts returns a cursor-paginated list of hosts for an operation.
// Requires at least viewer role in the operation.
func (r *hostResolver) Hosts(ctx context.Context, operationID string, search *string, first *int, after *string, last *int, before *string) (*model.HostConnection, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	args, err := pagination.ParseArgs(first, after, last, before)
	if err != nil {
		return nil, fmt.Errorf("invalid pagination args: %w", err)
	}

	filter := repository.HostFilter{}
	if search != nil {
		filter.Search = strings.TrimSpace(*search)
	}

	total, err := r.hostRepo.CountByOperationID(ctx, opUID, filter)
	if err != nil {
		return nil, fmt.Errorf("failed to count hosts: %w", err)
	}

	hosts, err := r.hostRepo.FindByOperationIDWithCursor(ctx, opUID, filter, args.Cursor, args.Limit+1, args.Forward)
	if err != nil {
		return nil, fmt.Errorf("failed to list hosts: %w", err)
	}

	hasMore := int64(len(hosts)) > args.Limit
	if hasMore {
		hosts = hosts[:args.Limit]
	}

	edges := make([]*model.HostEdge, len(hosts))
	for i := range hosts {
		cursor := pagination.EncodeCursor(hosts[i].CreateAt, hosts[i].Id)
		edges[i] = &model.HostEdge{
			Node:   &hosts[i],
			Cursor: cursor,
		}
	}

	pageInfo := pagination.PageInfo{
		HasNextPage:     args.Forward && hasMore,
		HasPreviousPage: (!args.Forward && hasMore) || (args.Forward && args.Cursor != nil),
	}
	if len(edges) > 0 {
		pageInfo.StartCursor = &edges[0].Cursor
		pageInfo.EndCursor = &edges[len(edges)-1].Cursor
	}

	return &model.HostConnection{
		Edges:      edges,
		PageInfo:   &pageInfo,
		TotalCount: int(total),
	}, nil
}

// ID converts the Host's UUID to a GraphQL ID string.
func (r *hostResolver) ID(ctx context.Context, obj *models.Host) (string, error) {
	return obj.HostID.String(), nil
}

// OperationIDField converts the OperationID UUID to a GraphQL ID string.
func (r *hostResolver) OperationIDField(ctx context.Context, obj *models.Host) (string, error) {
	return obj.OperationID.String(), nil
}

// Operation resolves the host's parent Operation via a DB lookup. Authorization
// is upstream: the host was already returned to the caller, which means they
// had at least viewer access to its operation via the parent query.
func (r *hostResolver) Operation(ctx context.Context, obj *models.Host) (*models.Operation, error) {
	op, err := r.operationRepo.FindByID(ctx, obj.OperationID)
	if err != nil {
		return nil, fmt.Errorf("failed to load operation: %w", err)
	}
	return &op, nil
}

// CreatedBy resolves the User who created the host, or nil if that user was
// deleted. A missing creator is nullable rather than failing the whole query.
func (r *hostResolver) CreatedBy(ctx context.Context, obj *models.Host) (*models.User, error) {
	if obj.CreatedByID == uuid.Nil {
		return nil, nil
	}
	user, err := r.userRepo.FindByID(ctx, obj.CreatedByID)
	if err != nil {
		return nil, nil
	}
	return &user, nil
}

// CreatedAt converts the qmgo DefaultField timestamp to an ISO 8601 string.
func (r *hostResolver) CreatedAt(ctx context.Context, obj *models.Host) (string, error) {
	return obj.CreateAt.Format(time.RFC3339), nil
}

// UpdatedAt converts the qmgo DefaultField timestamp to an ISO 8601 string.
func (r *hostResolver) UpdatedAt(ctx context.Context, obj *models.Host) (string, error) {
	return obj.UpdateAt.Format(time.RFC3339), nil
}

// --- helpers ---
// strDeref lives in helpers.go.

// normalizeInterfaces trims each interface, validates that every address parses
// as CIDR (the prefix length is load-bearing for topology derivation), and
// drops fully-empty entries. Returns a non-nil empty slice for nil input to
// keep BSON arrays consistent.
func normalizeInterfaces(in []*model.NetworkInterfaceInput) ([]models.Interface, error) {
	if len(in) == 0 {
		return []models.Interface{}, nil
	}
	out := make([]models.Interface, 0, len(in))
	for _, iface := range in {
		if iface == nil {
			continue
		}
		name := strings.TrimSpace(iface.Name)
		mac := strings.TrimSpace(strDeref(iface.Mac))
		addresses := make([]string, 0, len(iface.Addresses))
		for _, a := range iface.Addresses {
			addr := strings.TrimSpace(a)
			if addr == "" {
				continue
			}
			if _, _, err := net.ParseCIDR(addr); err != nil {
				return nil, fmt.Errorf("invalid interface address %q (expected CIDR, e.g. 10.0.5.12/24)", addr)
			}
			addresses = append(addresses, addr)
		}
		if name == "" && mac == "" && len(addresses) == 0 {
			continue
		}
		out = append(out, models.Interface{Name: name, MAC: mac, Addresses: addresses})
	}
	return out, nil
}

// normalizeRoutes trims each route, validates the destination as CIDR and the
// gateway (when present) as an IP, and drops fully-empty entries.
func normalizeRoutes(in []*model.RouteInput) ([]models.Route, error) {
	if len(in) == 0 {
		return []models.Route{}, nil
	}
	out := make([]models.Route, 0, len(in))
	for _, rt := range in {
		if rt == nil {
			continue
		}
		destination := strings.TrimSpace(rt.Destination)
		gateway := strings.TrimSpace(strDeref(rt.Gateway))
		iface := strings.TrimSpace(strDeref(rt.Interface))
		if destination == "" && gateway == "" && iface == "" {
			continue
		}
		if destination == "" {
			return nil, fmt.Errorf("route destination is required")
		}
		if _, _, err := net.ParseCIDR(destination); err != nil {
			return nil, fmt.Errorf("invalid route destination %q (expected CIDR, e.g. 0.0.0.0/0)", destination)
		}
		if gateway != "" && net.ParseIP(gateway) == nil {
			return nil, fmt.Errorf("invalid route gateway %q (expected an IP address)", gateway)
		}
		out = append(out, models.Route{Destination: destination, Gateway: gateway, Interface: iface})
	}
	return out, nil
}
