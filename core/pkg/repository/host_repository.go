package repository

import (
	"context"
	"regexp"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/v2/bson"
)

const hostCollection = "hosts"

// HostFilter bundles optional list filters for hosts. Kept deliberately small:
// a single free-text Search matched case-insensitively against the hostname,
// OS string, and any interface address. Topology views fetch the whole host
// set, so there is no per-field / tag / status filtering to mirror here.
type HostFilter struct {
	Search string
}

// IHostRepository defines the interface for Host database operations. It is a
// trimmed sibling of ICredentialRepository — per-operation only, no tags,
// comments, or cross-operation fan-out.
type IHostRepository interface {
	Create(ctx context.Context, h *models.Host) error
	FindByID(ctx context.Context, id uuid.UUID) (models.Host, error)
	FindByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, filter HostFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Host, error)
	CountByOperationID(ctx context.Context, opID uuid.UUID, filter HostFilter) (int64, error)
	Update(ctx context.Context, h *models.Host, updates map[string]interface{}) error
	Delete(ctx context.Context, h *models.Host) error
	// DeleteByOperationID purges every host in the operation. Called from the
	// operation-delete cascade.
	DeleteByOperationID(ctx context.Context, operationID uuid.UUID) error
}

type hostRepository struct {
	coll database.Collection
}

func NewHostRepository(db database.Database) IHostRepository {
	coll := db.Collection(hostCollection)

	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		{Key: []string{"host_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"operation_id"}},
		{Key: []string{"operation_id", "-createAt", "-_id"}}, // Supports cursor-based pagination
	})

	return &hostRepository{coll: coll}
}

func (r *hostRepository) Create(ctx context.Context, h *models.Host) error {
	_, err := r.coll.InsertOne(ctx, h)
	return err
}

func (r *hostRepository) FindByID(ctx context.Context, id uuid.UUID) (models.Host, error) {
	var h models.Host
	err := r.coll.FindOne(ctx, bson.M{"host_id": id}).One(&h)
	return h, err
}

func (r *hostRepository) FindByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, filter HostFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Host, error) {
	q := buildHostFilter(opID, filter)

	if cursorFilter := pagination.BuildCursorFilter(cursor, forward); len(cursorFilter) > 0 {
		for k, v := range cursorFilter {
			q[k] = v
		}
	}

	var hosts []models.Host
	err := r.coll.Find(ctx, q).
		Sort(pagination.SortFields(forward)...).
		Limit(limit).
		All(&hosts)

	if !forward && len(hosts) > 0 {
		for i, j := 0, len(hosts)-1; i < j; i, j = i+1, j-1 {
			hosts[i], hosts[j] = hosts[j], hosts[i]
		}
	}

	return hosts, err
}

func (r *hostRepository) CountByOperationID(ctx context.Context, opID uuid.UUID, filter HostFilter) (int64, error) {
	return r.coll.Count(ctx, buildHostFilter(opID, filter))
}

func (r *hostRepository) Update(ctx context.Context, h *models.Host, updates map[string]interface{}) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"host_id": h.HostID, "operation_id": h.OperationID},
		bson.M{"$set": updates},
	)
}

func (r *hostRepository) Delete(ctx context.Context, h *models.Host) error {
	return r.coll.Remove(ctx,
		bson.M{"host_id": h.HostID, "operation_id": h.OperationID},
	)
}

func (r *hostRepository) DeleteByOperationID(ctx context.Context, operationID uuid.UUID) error {
	_, err := r.coll.RemoveAll(ctx, bson.M{"operation_id": operationID})
	return err
}

func buildHostFilter(opID uuid.UUID, f HostFilter) bson.M {
	q := bson.M{"operation_id": opID}
	if f.Search != "" {
		escaped := regexp.QuoteMeta(f.Search)
		rx := bson.M{"$regex": escaped, "$options": "i"}
		q["$or"] = bson.A{
			bson.M{"hostname": rx},
			bson.M{"os": rx},
			// Regex against an array field matches if any element matches —
			// finds a host by any of its interface addresses.
			bson.M{"interfaces.addresses": rx},
		}
	}
	return q
}
