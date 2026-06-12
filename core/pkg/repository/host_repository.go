package repository

import (
	"context"

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

// HostSortField identifies a Mongo column the hosts list can be ordered by.
// The string value is the field path used in the sort and in the keyset
// cursor filter.
type HostSortField string

const (
	HostSortFieldCreatedAt HostSortField = "createAt"
	HostSortFieldHostname  HostSortField = "hostname"
	HostSortFieldOS        HostSortField = "os"
)

// HostSort bundles the sort column and direction for the hosts list query.
// The zero value is NOT valid — use DefaultHostSort() (createAt descending,
// the historical order) when the caller doesn't choose.
type HostSort struct {
	Field     HostSortField
	Ascending bool
}

// DefaultHostSort returns the historical list order: newest first.
func DefaultHostSort() HostSort {
	return HostSort{Field: HostSortFieldCreatedAt, Ascending: false}
}

// SortKey maps the host sort to the pagination layer's representation.
// hostname/os are string columns, so their cursors carry the string sort key;
// createAt keeps the legacy time-keyed cursor shape.
func (s HostSort) SortKey() pagination.SortKey {
	return pagination.SortKey{
		Field:     string(s.Field),
		Ascending: s.Ascending,
		String:    s.Field != HostSortFieldCreatedAt,
	}
}

// Cursor encodes the edge cursor for a host row under this sort — the value
// of the active sort column plus the _id tiebreaker.
func (s HostSort) Cursor(h *models.Host) string {
	switch s.Field {
	case HostSortFieldHostname:
		return pagination.EncodeStringCursor(h.Hostname, h.Id)
	case HostSortFieldOS:
		return pagination.EncodeStringCursor(h.OS, h.Id)
	default:
		return pagination.EncodeCursor(h.CreateAt, h.Id)
	}
}

// IHostRepository defines the interface for Host database operations. It is a
// trimmed sibling of ICredentialRepository — per-operation only, no tags,
// comments, or cross-operation fan-out.
type IHostRepository interface {
	Create(ctx context.Context, h *models.Host) error
	FindByID(ctx context.Context, id uuid.UUID) (models.Host, error)
	FindByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, filter HostFilter, sort HostSort, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Host, error)
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
		// Collated indexes backing the hostname / os column sorts. One index
		// per column serves both directions (a reversed sort walks the index
		// backwards); see the credential repository's index comment for the
		// full rationale.
		{Key: []string{"operation_id", "hostname", "_id"}, IndexOptions: new(options.IndexOptions).SetCollation(caseInsensitiveSortCollation)},
		{Key: []string{"operation_id", "os", "_id"}, IndexOptions: new(options.IndexOptions).SetCollation(caseInsensitiveSortCollation)},
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

func (r *hostRepository) FindByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, filter HostFilter, sort HostSort, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Host, error) {
	key := sort.SortKey()
	if err := key.ValidateCursor(cursor); err != nil {
		return nil, err
	}

	q := r.coll.Find(ctx, pagination.ApplyCursorFilterKey(buildHostFilter(opID, filter), cursor, forward, key))
	if key.String {
		q = q.Collation(caseInsensitiveSortCollation)
	}

	var hosts []models.Host
	err := q.
		Sort(pagination.SortFieldsKey(forward, key)...).
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
		rx := bson.M{"$regex": searchPattern(f.Search), "$options": "i"}
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
