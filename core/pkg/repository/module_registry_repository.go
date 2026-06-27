package repository

import (
	"context"
	"errors"
	"time"

	"github.com/qiniu/qmgo"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/v2/bson"
)

const moduleRegistryCollection = "module_registry"

// IModuleRegistryRepository is the durable system-of-record for module
// instances and their lifecycle state. Keyed by Instance (globally unique).
type IModuleRegistryRepository interface {
	// Upsert records a registration (idempotent takeover): sets status=registered,
	// refreshes registered_at, and clears any prior dead/deregistered markers so
	// re-registering an instance revives it.
	Upsert(ctx context.Context, reg *models.Module) error
	// TouchHeartbeat refreshes liveness fields on a registered instance. The
	// bool is false when no registered instance matched (→ unknown_instance).
	TouchHeartbeat(ctx context.Context, instance, status string, metrics map[string]any, at time.Time) (bool, error)
	// MarkDeregistered transitions a registered instance to deregistered. The
	// bool is false when no registered instance matched (→ unknown_instance).
	MarkDeregistered(ctx context.Context, instance, reason string, at time.Time) (bool, error)
	// FindStaleRegistered returns registered instances whose most recent
	// liveness signal predates cutoff — the reaper's input.
	FindStaleRegistered(ctx context.Context, cutoff time.Time, limit int64) ([]models.Module, error)
	// MarkDead transitions the named instances to dead.
	MarkDead(ctx context.Context, instances []string, at time.Time) error
	FindByInstance(ctx context.Context, instance string) (models.Module, error)
	ListActive(ctx context.Context) ([]models.Module, error)
	// List returns module rows filtered to the given lifecycle statuses, newest
	// registration first. A nil/empty statuses slice returns every row (all
	// states) — the admin Modules page shows registered, deregistered, and dead
	// together. Distinct from ListActive, which is the registered-only hot path
	// used by the active-set lookups.
	List(ctx context.Context, statuses []string) ([]models.Module, error)
}

type moduleRegistryRepository struct {
	coll database.Collection
}

func NewModuleRegistryRepository(db database.Database) IModuleRegistryRepository {
	coll := db.Collection(moduleRegistryCollection)

	coll.CreateIndexes(context.Background(), []opts.IndexModel{
		{Key: []string{"instance"}, IndexOptions: new(options.IndexOptions).SetUnique(true)},
		// Reaper scans by status; module_type for operator queries.
		{Key: []string{"status"}},
		{Key: []string{"module_type"}},
	})

	return &moduleRegistryRepository{coll: coll}
}

// --- pure builders (unit-tested without a broker or Mongo) ---

// instanceFilter matches a single instance regardless of status.
func instanceFilter(instance string) bson.M {
	return bson.M{"instance": instance}
}

// registeredInstanceFilter matches an instance only while it is registered —
// heartbeat/deregister on a dead/deregistered row must report unknown_instance.
func registeredInstanceFilter(instance string) bson.M {
	return bson.M{"instance": instance, "status": models.ModuleStatusRegistered}
}

// heartbeatUpdate sets the liveness fields recorded on each heartbeat.
func heartbeatUpdate(status string, metrics map[string]any, at time.Time) bson.M {
	set := bson.M{"last_heartbeat_at": at}
	if status != "" {
		set["last_status"] = status
	}
	if metrics != nil {
		set["last_metrics"] = metrics
	}
	return bson.M{"$set": set}
}

// deregisterUpdate transitions a row to deregistered.
func deregisterUpdate(reason string, at time.Time) bson.M {
	return bson.M{"$set": bson.M{
		"status":            models.ModuleStatusDeregistered,
		"deregistered_at":   at,
		"deregister_reason": reason,
	}}
}

// markDeadUpdate transitions matched rows to dead.
func markDeadUpdate(at time.Time) bson.M {
	return bson.M{"$set": bson.M{
		"status":           models.ModuleStatusDead,
		"declared_dead_at": at,
	}}
}

// takeoverUpdate writes a re-registration over an existing row in place: it
// refreshes the descriptor + registered_at and unsets every prior end-state /
// stale-liveness marker, so a dead or deregistered instance is revived.
func takeoverUpdate(reg *models.Module) bson.M {
	return bson.M{
		"$set": bson.M{
			"module_type":   reg.Type,
			"module_name":   reg.Name,
			"version":       reg.Version,
			"rpc_queue":     reg.RPCQueue,
			"description":   reg.Description,
			"status":        models.ModuleStatusRegistered,
			"registered_at": reg.RegisteredAt,
		},
		"$unset": bson.M{
			"deregistered_at":   "",
			"deregister_reason": "",
			"declared_dead_at":  "",
			"last_heartbeat_at": "",
			"last_status":       "",
			"last_metrics":      "",
		},
	}
}

// listFilter scopes a registry listing to the given statuses. Empty/nil returns
// every row (no status constraint).
func listFilter(statuses []string) bson.M {
	if len(statuses) == 0 {
		return bson.M{}
	}
	return bson.M{"status": bson.M{"$in": statuses}}
}

// staleRegisteredFilter matches registered rows whose effective last-seen time
// (last_heartbeat_at, falling back to registered_at for an instance that has
// never beaten) is strictly before cutoff.
func staleRegisteredFilter(cutoff time.Time) bson.M {
	return bson.M{
		"status": models.ModuleStatusRegistered,
		"$expr": bson.M{
			"$lt": bson.A{
				bson.M{"$ifNull": bson.A{"$last_heartbeat_at", "$registered_at"}},
				cutoff,
			},
		},
	}
}

// --- repository methods ---

func (r *moduleRegistryRepository) Upsert(ctx context.Context, reg *models.Module) error {
	reg.Status = models.ModuleStatusRegistered
	if reg.RegisteredAt.IsZero() {
		reg.RegisteredAt = time.Now().UTC()
	}
	// A fresh registration supersedes any prior lifecycle end-state.
	reg.DeregisteredAt = nil
	reg.DeregisterReason = ""
	reg.DeclaredDeadAt = nil

	// Atomic-ish idempotent takeover without whole-document replace (which would
	// fight the immutable _id): update the existing row in place, or insert a
	// new one. The unique index on instance closes the insert race — a losing
	// concurrent insert falls back to update.
	_, err := r.FindByInstance(ctx, reg.Instance)
	if err == nil {
		return r.coll.UpdateOne(ctx, instanceFilter(reg.Instance), takeoverUpdate(reg))
	}
	if !errors.Is(err, qmgo.ErrNoSuchDocuments) {
		return err
	}

	_, err = r.coll.InsertOne(ctx, reg)
	if err != nil && mongo.IsDuplicateKeyError(err) {
		// Lost the insert race: an instance row appeared between our find and
		// insert. Retry as an in-place update.
		return r.coll.UpdateOne(ctx, instanceFilter(reg.Instance), takeoverUpdate(reg))
	}
	return err
}

func (r *moduleRegistryRepository) TouchHeartbeat(ctx context.Context, instance, status string, metrics map[string]any, at time.Time) (bool, error) {
	err := r.coll.UpdateOne(ctx, registeredInstanceFilter(instance), heartbeatUpdate(status, metrics, at))
	if errors.Is(err, qmgo.ErrNoSuchDocuments) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (r *moduleRegistryRepository) MarkDeregistered(ctx context.Context, instance, reason string, at time.Time) (bool, error) {
	err := r.coll.UpdateOne(ctx, registeredInstanceFilter(instance), deregisterUpdate(reason, at))
	if errors.Is(err, qmgo.ErrNoSuchDocuments) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}

func (r *moduleRegistryRepository) FindStaleRegistered(ctx context.Context, cutoff time.Time, limit int64) ([]models.Module, error) {
	var out []models.Module
	q := r.coll.Find(ctx, staleRegisteredFilter(cutoff)).Sort("registered_at")
	if limit > 0 {
		q = q.Limit(limit)
	}
	err := q.All(&out)
	return out, err
}

func (r *moduleRegistryRepository) MarkDead(ctx context.Context, instances []string, at time.Time) error {
	if len(instances) == 0 {
		return nil
	}
	_, err := r.coll.UpdateAll(ctx,
		bson.M{"instance": bson.M{"$in": instances}, "status": models.ModuleStatusRegistered},
		markDeadUpdate(at),
	)
	return err
}

func (r *moduleRegistryRepository) FindByInstance(ctx context.Context, instance string) (models.Module, error) {
	var reg models.Module
	err := r.coll.FindOne(ctx, instanceFilter(instance)).One(&reg)
	return reg, err
}

func (r *moduleRegistryRepository) ListActive(ctx context.Context) ([]models.Module, error) {
	var out []models.Module
	err := r.coll.Find(ctx, bson.M{"status": models.ModuleStatusRegistered}).All(&out)
	return out, err
}

func (r *moduleRegistryRepository) List(ctx context.Context, statuses []string) ([]models.Module, error) {
	var out []models.Module
	err := r.coll.Find(ctx, listFilter(statuses)).Sort("-registered_at").All(&out)
	return out, err
}
