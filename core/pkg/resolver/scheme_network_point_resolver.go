package resolver

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// ISchemeNetworkPointResolver defines the business logic methods for the SchemeNetworkPoint entity.
// These map 1:1 to the GraphQL query, mutation, and field resolvers for SchemeNetworkPoint.
type ISchemeNetworkPointResolver interface {
	// Mutations
	CreateSchemeNetworkPoint(ctx context.Context, operationID string, input model.CreateSchemeNetworkPointInput) (*models.SchemeNetworkPoint, error)
	UpdateSchemeNetworkPoint(ctx context.Context, id string, input model.UpdateSchemeNetworkPointInput) (*models.SchemeNetworkPoint, error)
	DeleteSchemeNetworkPoint(ctx context.Context, id string) (bool, error)

	// Port mutations (embedded doc management)
	AddSchemeNetworkPort(ctx context.Context, pointID string, input model.CreateSchemeNetworkPortInput) (*models.SchemeNetworkPoint, error)
	UpdateSchemeNetworkPort(ctx context.Context, pointID string, portID string, input model.UpdateSchemeNetworkPortInput) (*models.SchemeNetworkPoint, error)
	RemoveSchemeNetworkPort(ctx context.Context, pointID string, portID string) (*models.SchemeNetworkPoint, error)

	// Queries
	SchemeNetworkPoint(ctx context.Context, id string) (*models.SchemeNetworkPoint, error)
	SchemeNetworkPoints(ctx context.Context, operationID string, search *string, offset *int, limit *int) (*model.SchemeNetworkPointPagination, error)

	// Field resolvers for SchemeNetworkPoint type
	ID(ctx context.Context, obj *models.SchemeNetworkPoint) (string, error)
	OperationIDField(ctx context.Context, obj *models.SchemeNetworkPoint) (string, error)
	Ports(ctx context.Context, obj *models.SchemeNetworkPoint) ([]*models.SchemeNetworkPort, error)
	CreatedAt(ctx context.Context, obj *models.SchemeNetworkPoint) (string, error)
	UpdatedAt(ctx context.Context, obj *models.SchemeNetworkPoint) (string, error)

	// Field resolver for SchemeNetworkPort type
	PortID(ctx context.Context, obj *models.SchemeNetworkPort) (string, error)
}

type schemeNetworkPointResolver struct {
	pointRepo     repository.ISchemeNetworkPointRepository
	operationRepo repository.IOperationRepository
}

// NewSchemeNetworkPointResolver creates a new scheme network point resolver with the given dependencies.
func NewSchemeNetworkPointResolver(
	pointRepo repository.ISchemeNetworkPointRepository,
	operationRepo repository.IOperationRepository,
) ISchemeNetworkPointResolver {
	return &schemeNetworkPointResolver{
		pointRepo:     pointRepo,
		operationRepo: operationRepo,
	}
}

// authorizeForOperation checks if the caller has at least the required role in the operation.
// Follows the same pattern as operationResolver.authorizeOperationRole.
func (r *schemeNetworkPointResolver) authorizeForOperation(ctx context.Context, operationID uuid.UUID, minRole models.OperationRole) error {
	auth := gqlctx.AuthFromContext(ctx)

	// App-level admins always have full access
	for _, role := range auth.Roles {
		if role == "admin" {
			return nil
		}
	}

	// Fetch the operation to check membership
	op, err := r.operationRepo.FindByID(ctx, operationID)
	if err != nil {
		return fmt.Errorf("operation not found: %w", err)
	}

	callerUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return fmt.Errorf("forbidden: invalid caller ID")
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

// CreateSchemeNetworkPoint creates a new network point in an operation.
// Requires at least operator role in the operation.
//
// Example:
//
//	mutation {
//	    createSchemeNetworkPoint(operationId: "...", input: {
//	        names: ["192.168.1.1", "server.local"]
//	        description: "Main web server"
//	        tags: ["web", "production"]
//	    }) {
//	        id names description tags
//	    }
//	}
func (r *schemeNetworkPointResolver) CreateSchemeNetworkPoint(ctx context.Context, operationID string, input model.CreateSchemeNetworkPointInput) (*models.SchemeNetworkPoint, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	// Validate names: at least one non-empty entry required
	validNames := validateNames(input.Names)
	if len(validNames) == 0 {
		return nil, fmt.Errorf("at least one non-empty name is required")
	}

	description := ""
	if input.Description != nil {
		description = *input.Description
	}

	var tags []string
	if input.Tags != nil {
		tags = input.Tags
	}

	point := &models.SchemeNetworkPoint{
		PointID:     uuid.New(),
		OperationID: opUID,
		Names:       validNames,
		Description: description,
		Tags:        tags,
		Ports:       []models.SchemeNetworkPort{},
	}

	if err := r.pointRepo.Create(ctx, point); err != nil {
		return nil, fmt.Errorf("failed to create network point: %w", err)
	}

	return point, nil
}

// UpdateSchemeNetworkPoint modifies an existing network point.
// Requires at least operator role in the operation.
func (r *schemeNetworkPointResolver) UpdateSchemeNetworkPoint(ctx context.Context, id string, input model.UpdateSchemeNetworkPointInput) (*models.SchemeNetworkPoint, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid network point ID: %w", err)
	}

	point, err := r.pointRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("network point not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, point.OperationID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	updates := make(map[string]interface{})
	if input.Names != nil {
		validNames := validateNames(input.Names)
		if len(validNames) == 0 {
			return nil, fmt.Errorf("at least one non-empty name is required")
		}
		updates["names"] = validNames
	}
	if input.Description != nil {
		updates["description"] = *input.Description
	}
	if input.Tags != nil {
		updates["tags"] = input.Tags
	}

	if len(updates) == 0 {
		return &point, nil
	}

	if err := r.pointRepo.Update(ctx, &point, updates); err != nil {
		return nil, fmt.Errorf("failed to update network point: %w", err)
	}

	updated, err := r.pointRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated network point: %w", err)
	}

	return &updated, nil
}

// DeleteSchemeNetworkPoint removes a network point by ID.
// Requires at least operator role in the operation.
func (r *schemeNetworkPointResolver) DeleteSchemeNetworkPoint(ctx context.Context, id string) (bool, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return false, fmt.Errorf("invalid network point ID: %w", err)
	}

	point, err := r.pointRepo.FindByID(ctx, uid)
	if err != nil {
		return false, fmt.Errorf("network point not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, point.OperationID, models.OperationRoleOperator); err != nil {
		return false, err
	}

	if err := r.pointRepo.Delete(ctx, &point); err != nil {
		return false, fmt.Errorf("failed to delete network point: %w", err)
	}
	return true, nil
}

// AddSchemeNetworkPort adds a port to a network point.
// Requires at least operator role in the operation.
func (r *schemeNetworkPointResolver) AddSchemeNetworkPort(ctx context.Context, pointID string, input model.CreateSchemeNetworkPortInput) (*models.SchemeNetworkPoint, error) {
	pUID, err := uuid.Parse(pointID)
	if err != nil {
		return nil, fmt.Errorf("invalid network point ID: %w", err)
	}

	point, err := r.pointRepo.FindByID(ctx, pUID)
	if err != nil {
		return nil, fmt.Errorf("network point not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, point.OperationID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	protocol := ""
	if input.Protocol != nil {
		protocol = *input.Protocol
	}
	service := ""
	if input.Service != nil {
		service = *input.Service
	}
	notes := ""
	if input.Notes != nil {
		notes = *input.Notes
	}

	port := models.SchemeNetworkPort{
		PortID:   uuid.New(),
		Number:   input.Number,
		Protocol: protocol,
		Service:  service,
		Notes:    notes,
	}

	if err := r.pointRepo.AddPort(ctx, pUID, port); err != nil {
		return nil, fmt.Errorf("failed to add port: %w", err)
	}

	updated, err := r.pointRepo.FindByID(ctx, pUID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated network point: %w", err)
	}

	return &updated, nil
}

// UpdateSchemeNetworkPort updates a port on a network point.
// Requires at least operator role in the operation.
func (r *schemeNetworkPointResolver) UpdateSchemeNetworkPort(ctx context.Context, pointID string, portID string, input model.UpdateSchemeNetworkPortInput) (*models.SchemeNetworkPoint, error) {
	pUID, err := uuid.Parse(pointID)
	if err != nil {
		return nil, fmt.Errorf("invalid network point ID: %w", err)
	}

	portUID, err := uuid.Parse(portID)
	if err != nil {
		return nil, fmt.Errorf("invalid port ID: %w", err)
	}

	point, err := r.pointRepo.FindByID(ctx, pUID)
	if err != nil {
		return nil, fmt.Errorf("network point not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, point.OperationID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	// Verify port exists
	portFound := false
	for _, p := range point.Ports {
		if p.PortID == portUID {
			portFound = true
			break
		}
	}
	if !portFound {
		return nil, fmt.Errorf("port not found on this network point")
	}

	updates := make(map[string]interface{})
	if input.Number != nil {
		updates["number"] = *input.Number
	}
	if input.Protocol != nil {
		updates["protocol"] = *input.Protocol
	}
	if input.Service != nil {
		updates["service"] = *input.Service
	}
	if input.Notes != nil {
		updates["notes"] = *input.Notes
	}

	if len(updates) == 0 {
		return &point, nil
	}

	if err := r.pointRepo.UpdatePort(ctx, pUID, portUID, updates); err != nil {
		return nil, fmt.Errorf("failed to update port: %w", err)
	}

	updated, err := r.pointRepo.FindByID(ctx, pUID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated network point: %w", err)
	}

	return &updated, nil
}

// RemoveSchemeNetworkPort removes a port from a network point.
// Requires at least operator role in the operation.
func (r *schemeNetworkPointResolver) RemoveSchemeNetworkPort(ctx context.Context, pointID string, portID string) (*models.SchemeNetworkPoint, error) {
	pUID, err := uuid.Parse(pointID)
	if err != nil {
		return nil, fmt.Errorf("invalid network point ID: %w", err)
	}

	portUID, err := uuid.Parse(portID)
	if err != nil {
		return nil, fmt.Errorf("invalid port ID: %w", err)
	}

	point, err := r.pointRepo.FindByID(ctx, pUID)
	if err != nil {
		return nil, fmt.Errorf("network point not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, point.OperationID, models.OperationRoleOperator); err != nil {
		return nil, err
	}

	if err := r.pointRepo.RemovePort(ctx, pUID, portUID); err != nil {
		return nil, fmt.Errorf("failed to remove port: %w", err)
	}

	updated, err := r.pointRepo.FindByID(ctx, pUID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated network point: %w", err)
	}

	return &updated, nil
}

// SchemeNetworkPoint returns a single network point by ID.
// Requires at least viewer role in the operation.
func (r *schemeNetworkPointResolver) SchemeNetworkPoint(ctx context.Context, id string) (*models.SchemeNetworkPoint, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return nil, fmt.Errorf("invalid network point ID: %w", err)
	}

	point, err := r.pointRepo.FindByID(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("network point not found: %w", err)
	}

	if err := r.authorizeForOperation(ctx, point.OperationID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	return &point, nil
}

// SchemeNetworkPoints returns a paginated list of network points for an operation.
// Requires at least viewer role in the operation.
//
// Example:
//
//	query {
//	    schemeNetworkPoints(operationId: "...", search: "192.168", limit: 10) {
//	        totalCount
//	        points { id names description tags ports { id number protocol service } }
//	    }
//	}
func (r *schemeNetworkPointResolver) SchemeNetworkPoints(ctx context.Context, operationID string, search *string, offset *int, limit *int) (*model.SchemeNetworkPointPagination, error) {
	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	if err := r.authorizeForOperation(ctx, opUID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	s := ""
	if search != nil {
		s = *search
	}
	off := int64(0)
	if offset != nil {
		off = int64(*offset)
	}
	lim := int64(20)
	if limit != nil {
		lim = int64(*limit)
	}

	total, err := r.pointRepo.CountByOperationID(ctx, opUID, s)
	if err != nil {
		return nil, fmt.Errorf("failed to count network points: %w", err)
	}

	points, err := r.pointRepo.FindByOperationID(ctx, opUID, s, off, lim)
	if err != nil {
		return nil, fmt.Errorf("failed to list network points: %w", err)
	}

	ptrs := make([]*models.SchemeNetworkPoint, len(points))
	for i := range points {
		ptrs[i] = &points[i]
	}

	hasNext := off+lim < total
	hasPrev := off > 0

	return &model.SchemeNetworkPointPagination{
		Points:          ptrs,
		TotalCount:      int(total),
		HasNextPage:     hasNext,
		HasPreviousPage: hasPrev,
	}, nil
}

// ID converts the SchemeNetworkPoint's UUID to a GraphQL ID string.
func (r *schemeNetworkPointResolver) ID(ctx context.Context, obj *models.SchemeNetworkPoint) (string, error) {
	return obj.PointID.String(), nil
}

// OperationIDField converts the OperationID UUID to a GraphQL ID string.
func (r *schemeNetworkPointResolver) OperationIDField(ctx context.Context, obj *models.SchemeNetworkPoint) (string, error) {
	return obj.OperationID.String(), nil
}

// Ports returns the network point's port list as pointers for GraphQL resolution.
func (r *schemeNetworkPointResolver) Ports(ctx context.Context, obj *models.SchemeNetworkPoint) ([]*models.SchemeNetworkPort, error) {
	if len(obj.Ports) == 0 {
		return []*models.SchemeNetworkPort{}, nil
	}

	ptrs := make([]*models.SchemeNetworkPort, len(obj.Ports))
	for i := range obj.Ports {
		ptrs[i] = &obj.Ports[i]
	}
	return ptrs, nil
}

// CreatedAt converts the qmgo DefaultField timestamp to an ISO 8601 string.
func (r *schemeNetworkPointResolver) CreatedAt(ctx context.Context, obj *models.SchemeNetworkPoint) (string, error) {
	return obj.CreateAt.Format(time.RFC3339), nil
}

// UpdatedAt converts the qmgo DefaultField timestamp to an ISO 8601 string.
func (r *schemeNetworkPointResolver) UpdatedAt(ctx context.Context, obj *models.SchemeNetworkPoint) (string, error) {
	return obj.UpdateAt.Format(time.RFC3339), nil
}

// PortID converts the SchemeNetworkPort's UUID to a GraphQL ID string.
func (r *schemeNetworkPointResolver) PortID(ctx context.Context, obj *models.SchemeNetworkPort) (string, error) {
	return obj.PortID.String(), nil
}

// validateNames filters out empty/whitespace-only names and trims whitespace.
func validateNames(names []string) []string {
	var valid []string
	for _, n := range names {
		trimmed := strings.TrimSpace(n)
		if trimmed != "" {
			valid = append(valid, trimmed)
		}
	}
	return valid
}
