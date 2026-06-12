package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/v2/bson"
)

const credentialCollection = "credentials"

// CredentialSearchField identifies a single Mongo field path that the text
// search may target. The string value is the field path used directly in the
// query, so adding a member is enough to make it searchable.
type CredentialSearchField string

const (
	CredentialSearchFieldName       CredentialSearchField = "name"
	CredentialSearchFieldUsername   CredentialSearchField = "username"
	CredentialSearchFieldPassword   CredentialSearchField = "password"
	CredentialSearchFieldProperties CredentialSearchField = "properties.value"
)

// defaultCredentialSearchFields is the field set used when the caller does not
// restrict the search. Preserves the historical behaviour of matching name,
// username, password, and property values in one pass.
var defaultCredentialSearchFields = []CredentialSearchField{
	CredentialSearchFieldName,
	CredentialSearchFieldUsername,
	CredentialSearchFieldPassword,
	CredentialSearchFieldProperties,
}

// CredentialFilter bundles the optional list filters for credentials.
// All fields are independent — combining them ANDs them together at the
// MongoDB query level.
type CredentialFilter struct {
	// Search matches case-insensitively against the fields named in
	// SearchFields (defaulting to name, username, password, and the values of
	// operator-defined properties). Property *names* are intentionally
	// excluded — they're labels, not content, and matching them would surface
	// false positives whenever a generic label like "port" or "url" appears in
	// a query.
	Search string
	// SearchFields restricts which fields Search matches against. Empty means
	// "all default fields" (see defaultCredentialSearchFields). Ignored when
	// Search is empty.
	SearchFields []CredentialSearchField
	// Type, if non-nil, restricts to credentials of this type.
	Type *models.CredentialType
	// Tags, if non-empty, requires every listed tag to be present ($all).
	Tags []string
	// ValidOnly: nil = both, true = isValid=true only, false = isValid=false only.
	ValidOnly *bool
}

// ICredentialRepository defines the interface for Credential database operations.
type ICredentialRepository interface {
	Create(ctx context.Context, c *models.Credential) error
	FindByID(ctx context.Context, id uuid.UUID) (models.Credential, error)
	FindByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, filter CredentialFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Credential, error)
	CountByOperationID(ctx context.Context, opID uuid.UUID, filter CredentialFilter) (int64, error)
	DistinctTagsByOperationID(ctx context.Context, opID uuid.UUID) ([]string, error)

	// Multi-operation variants — used by the "global / cross-operation" Findings
	// view where the caller has selected several operations to search across.
	// Each method matches `{operation_id: {$in: opIDs}}` and otherwise behaves
	// identically to its single-op sibling. An empty opIDs slice MUST short-circuit
	// to a no-match result without hitting the DB; callers rely on that to model
	// "explicit empty selection".
	//
	// Index note: the existing {operation_id, -createAt, -_id} compound index
	// supports these queries via index union. Acceptable for moderate fan-out
	// (~tens of ops); revisit for very large op sets.
	FindByOperationIDsWithCursor(ctx context.Context, opIDs []uuid.UUID, filter CredentialFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Credential, error)
	CountByOperationIDs(ctx context.Context, opIDs []uuid.UUID, filter CredentialFilter) (int64, error)
	DistinctTagsByOperationIDs(ctx context.Context, opIDs []uuid.UUID) ([]string, error)

	Update(ctx context.Context, c *models.Credential, updates map[string]interface{}) error
	Delete(ctx context.Context, c *models.Credential) error
	DeleteByOperationID(ctx context.Context, operationID uuid.UUID) error

	// Embedded comment operations
	AddComment(ctx context.Context, credentialID uuid.UUID, comment models.CredentialComment) error
	UpdateComment(ctx context.Context, credentialID, commentID uuid.UUID, text string, updatedAt time.Time) error
	RemoveComment(ctx context.Context, credentialID, commentID uuid.UUID) error
}

type credentialRepository struct {
	coll database.Collection
}

func NewCredentialRepository(db database.Database) ICredentialRepository {
	coll := db.Collection(credentialCollection)

	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		{Key: []string{"credential_id"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		{Key: []string{"operation_id"}},
		{Key: []string{"operation_id", "tags"}},
		{Key: []string{"operation_id", "type"}},
		{Key: []string{"operation_id", "is_valid"}},
		{Key: []string{"operation_id", "-createAt", "-_id"}}, // Supports cursor-based pagination
	})

	return &credentialRepository{coll: coll}
}

func (r *credentialRepository) Create(ctx context.Context, c *models.Credential) error {
	_, err := r.coll.InsertOne(ctx, c)
	return err
}

func (r *credentialRepository) FindByID(ctx context.Context, id uuid.UUID) (models.Credential, error) {
	var c models.Credential
	err := r.coll.FindOne(ctx, bson.M{"credential_id": id}).One(&c)
	return c, err
}

func (r *credentialRepository) FindByOperationIDWithCursor(ctx context.Context, opID uuid.UUID, filter CredentialFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Credential, error) {
	q := pagination.ApplyCursorFilter(buildCredentialFilter(opID, filter), cursor, forward)

	var creds []models.Credential
	err := r.coll.Find(ctx, q).
		Sort(pagination.SortFields(forward)...).
		Limit(limit).
		All(&creds)

	if !forward && len(creds) > 0 {
		for i, j := 0, len(creds)-1; i < j; i, j = i+1, j-1 {
			creds[i], creds[j] = creds[j], creds[i]
		}
	}

	return creds, err
}

func (r *credentialRepository) CountByOperationID(ctx context.Context, opID uuid.UUID, filter CredentialFilter) (int64, error) {
	return r.coll.Count(ctx, buildCredentialFilter(opID, filter))
}

// DistinctTagsByOperationID returns the deduplicated tag set across all
// credentials in the operation, used to drive the tag autocomplete UI.
func (r *credentialRepository) DistinctTagsByOperationID(ctx context.Context, opID uuid.UUID) ([]string, error) {
	var tags []string
	err := r.coll.Find(ctx, bson.M{"operation_id": opID}).Distinct("tags", &tags)
	if err != nil {
		return nil, err
	}
	return tags, nil
}

// FindByOperationIDsWithCursor lists credentials across multiple operations.
// Returns an empty slice (and no error) when opIDs is empty so callers can
// model "explicit empty selection" without a DB round-trip.
func (r *credentialRepository) FindByOperationIDsWithCursor(ctx context.Context, opIDs []uuid.UUID, filter CredentialFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.Credential, error) {
	if len(opIDs) == 0 {
		return []models.Credential{}, nil
	}

	q := pagination.ApplyCursorFilter(buildCredentialFilterMulti(opIDs, filter), cursor, forward)

	var creds []models.Credential
	err := r.coll.Find(ctx, q).
		Sort(pagination.SortFields(forward)...).
		Limit(limit).
		All(&creds)

	if !forward && len(creds) > 0 {
		for i, j := 0, len(creds)-1; i < j; i, j = i+1, j-1 {
			creds[i], creds[j] = creds[j], creds[i]
		}
	}

	return creds, err
}

// CountByOperationIDs counts credentials matching the filter across multiple
// operations. Empty opIDs ⇒ 0 with no DB call.
func (r *credentialRepository) CountByOperationIDs(ctx context.Context, opIDs []uuid.UUID, filter CredentialFilter) (int64, error) {
	if len(opIDs) == 0 {
		return 0, nil
	}
	return r.coll.Count(ctx, buildCredentialFilterMulti(opIDs, filter))
}

// DistinctTagsByOperationIDs returns the deduplicated tag set across all
// credentials in the given operations. Empty opIDs ⇒ empty slice, no DB call.
func (r *credentialRepository) DistinctTagsByOperationIDs(ctx context.Context, opIDs []uuid.UUID) ([]string, error) {
	if len(opIDs) == 0 {
		return []string{}, nil
	}
	var tags []string
	err := r.coll.Find(ctx, bson.M{"operation_id": bson.M{"$in": opIDs}}).Distinct("tags", &tags)
	if err != nil {
		return nil, err
	}
	return tags, nil
}

func (r *credentialRepository) Update(ctx context.Context, c *models.Credential, updates map[string]interface{}) error {
	// Defense-in-depth: filter includes operation_id so a resolver bug cannot
	// accidentally mutate a credential belonging to a different operation.
	return r.coll.UpdateOne(ctx,
		bson.M{"credential_id": c.CredentialID, "operation_id": c.OperationID},
		bson.M{"$set": updates},
	)
}

func (r *credentialRepository) Delete(ctx context.Context, c *models.Credential) error {
	return r.coll.Remove(ctx,
		bson.M{"credential_id": c.CredentialID, "operation_id": c.OperationID},
	)
}

func (r *credentialRepository) DeleteByOperationID(ctx context.Context, operationID uuid.UUID) error {
	_, err := r.coll.RemoveAll(ctx, bson.M{"operation_id": operationID})
	return err
}

// AddComment appends a comment to a credential's embedded comments array.
func (r *credentialRepository) AddComment(ctx context.Context, credentialID uuid.UUID, comment models.CredentialComment) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"credential_id": credentialID},
		bson.M{"$push": bson.M{"comments": comment}},
	)
}

// UpdateComment changes a single comment's text via the positional $ operator.
func (r *credentialRepository) UpdateComment(ctx context.Context, credentialID, commentID uuid.UUID, text string, updatedAt time.Time) error {
	return r.coll.UpdateOne(ctx,
		bson.M{
			"credential_id":       credentialID,
			"comments.comment_id": commentID,
		},
		bson.M{"$set": bson.M{
			"comments.$.text":       text,
			"comments.$.updated_at": updatedAt,
		}},
	)
}

// RemoveComment pulls a comment out of the embedded comments array.
func (r *credentialRepository) RemoveComment(ctx context.Context, credentialID, commentID uuid.UUID) error {
	return r.coll.UpdateOne(ctx,
		bson.M{"credential_id": credentialID},
		bson.M{"$pull": bson.M{"comments": bson.M{"comment_id": commentID}}},
	)
}

// buildCredentialFilter composes a MongoDB filter from a CredentialFilter,
// always scoped to the given operation.
func buildCredentialFilter(opID uuid.UUID, f CredentialFilter) bson.M {
	return applyCredentialFilter(bson.M{"operation_id": opID}, f)
}

// buildCredentialFilterMulti is the multi-operation variant of
// buildCredentialFilter. The operation predicate becomes {$in: opIDs} and the
// rest of the filter shape is identical.
func buildCredentialFilterMulti(opIDs []uuid.UUID, f CredentialFilter) bson.M {
	return applyCredentialFilter(bson.M{"operation_id": bson.M{"$in": opIDs}}, f)
}

// applyCredentialFilter layers Type / ValidOnly / Tags / Search constraints
// on top of a base filter (operation predicate). Shared between the single-op
// and multi-op builders.
func applyCredentialFilter(q bson.M, f CredentialFilter) bson.M {
	if f.Type != nil {
		q["type"] = *f.Type
	}
	if f.ValidOnly != nil {
		q["is_valid"] = *f.ValidOnly
	}
	if len(f.Tags) > 0 {
		q["tags"] = bson.M{"$all": f.Tags}
	}
	if f.Search != "" {
		rx := bson.M{"$regex": searchPattern(f.Search), "$options": "i"}
		fields := f.SearchFields
		if len(fields) == 0 {
			fields = defaultCredentialSearchFields
		}
		or := make(bson.A, 0, len(fields))
		for _, field := range fields {
			or = append(or, bson.M{string(field): rx})
		}
		q["$or"] = or
	}

	return q
}
