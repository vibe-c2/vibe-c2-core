package repository

import (
	"context"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const schemeNetworkPointCollection = "scheme_network_points"

// ISchemeNetworkPointRepository defines the interface for SchemeNetworkPoint database operations.
type ISchemeNetworkPointRepository interface {
	// CRUD for the network point itself
	Create(ctx context.Context, point *models.SchemeNetworkPoint) error
	FindByID(ctx context.Context, id uuid.UUID) (models.SchemeNetworkPoint, error)
	FindByOperationID(ctx context.Context, operationID uuid.UUID, search string, offset, limit int64) ([]models.SchemeNetworkPoint, error)
	CountByOperationID(ctx context.Context, operationID uuid.UUID, search string) (int64, error)
	Update(ctx context.Context, point *models.SchemeNetworkPoint, updates map[string]interface{}) error
	Delete(ctx context.Context, point *models.SchemeNetworkPoint) error
	DeleteByOperationID(ctx context.Context, operationID uuid.UUID) error

	// Embedded port operations (same $push/$pull pattern as OperationMember)
	AddPort(ctx context.Context, pointID uuid.UUID, port models.SchemeNetworkPort) error
	RemovePort(ctx context.Context, pointID uuid.UUID, portID uuid.UUID) error
	UpdatePort(ctx context.Context, pointID uuid.UUID, portID uuid.UUID, updates map[string]interface{}) error
}

type schemeNetworkPointRepository struct {
	coll database.Collection
}

func NewSchemeNetworkPointRepository(db database.Database) ISchemeNetworkPointRepository {
	coll := db.Collection(schemeNetworkPointCollection)

	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		{Key: []string{"point_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"operation_id"}},
		{Key: []string{"names"}},
	})

	return &schemeNetworkPointRepository{coll: coll}
}

func (r *schemeNetworkPointRepository) Create(ctx context.Context, point *models.SchemeNetworkPoint) error {
	_, err := r.coll.InsertOne(ctx, point)
	return err
}

func (r *schemeNetworkPointRepository) FindByID(ctx context.Context, id uuid.UUID) (models.SchemeNetworkPoint, error) {
	var point models.SchemeNetworkPoint
	err := r.coll.FindOne(ctx, bson.M{"point_id": id}).One(&point)
	return point, err
}

func (r *schemeNetworkPointRepository) FindByOperationID(ctx context.Context, operationID uuid.UUID, search string, offset, limit int64) ([]models.SchemeNetworkPoint, error) {
	var points []models.SchemeNetworkPoint
	err := r.coll.Find(ctx, buildSchemeNetworkPointFilter(operationID, search)).
		Sort("-createAt").
		Skip(offset).
		Limit(limit).
		All(&points)

	return points, err
}

func (r *schemeNetworkPointRepository) CountByOperationID(ctx context.Context, operationID uuid.UUID, search string) (int64, error) {
	return r.coll.Count(ctx, buildSchemeNetworkPointFilter(operationID, search))
}

func (r *schemeNetworkPointRepository) Update(ctx context.Context, point *models.SchemeNetworkPoint, updates map[string]interface{}) error {
	return r.coll.UpdateOne(ctx, bson.M{"point_id": point.PointID}, bson.M{"$set": updates})
}

func (r *schemeNetworkPointRepository) Delete(ctx context.Context, point *models.SchemeNetworkPoint) error {
	return r.coll.Remove(ctx, bson.M{"point_id": point.PointID})
}

func (r *schemeNetworkPointRepository) DeleteByOperationID(ctx context.Context, operationID uuid.UUID) error {
	_, err := r.coll.RemoveAll(ctx, bson.M{"operation_id": operationID})
	return err
}

// AddPort adds a port to a network point using $push.
func (r *schemeNetworkPointRepository) AddPort(ctx context.Context, pointID uuid.UUID, port models.SchemeNetworkPort) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"point_id": pointID},
		bson.M{"$push": bson.M{"ports": port}},
	)
}

// RemovePort removes a port from a network point using $pull.
func (r *schemeNetworkPointRepository) RemovePort(ctx context.Context, pointID uuid.UUID, portID uuid.UUID) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"point_id": pointID},
		bson.M{"$pull": bson.M{"ports": bson.M{"port_id": portID}}},
	)
}

// UpdatePort updates a specific port's fields using the positional $ operator.
func (r *schemeNetworkPointRepository) UpdatePort(ctx context.Context, pointID uuid.UUID, portID uuid.UUID, updates map[string]interface{}) error {
	// Build positional update: {"ports.$.field": value}
	set := bson.M{}
	for k, v := range updates {
		set["ports.$."+k] = v
	}

	return r.coll.UpdateOne(ctx,
		bson.M{
			"point_id":      pointID,
			"ports.port_id": portID,
		},
		bson.M{"$set": set},
	)
}

func buildSchemeNetworkPointFilter(operationID uuid.UUID, search string) bson.M {
	filter := bson.M{"operation_id": operationID}
	if search == "" {
		return filter
	}
	regex := bson.M{"$regex": search, "$options": "i"}
	filter["$or"] = bson.A{
		bson.M{"names": regex},
		bson.M{"description": regex},
		bson.M{"tags": regex},
	}
	return filter
}
