package database

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/qiniu/qmgo"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/environment"
)

// Database is a proxy interface over qmgo for MongoDB operations.
// It provides collection access, transaction support, and lifecycle management.
type Database interface {
	Close(ctx context.Context) error
	Ping(timeout int64) error
	Collection(name string) Collection
	DoTransaction(ctx context.Context, fn func(ctx context.Context) (interface{}, error)) (interface{}, error)

	// EnsureIndexes creates a collection's indexes. It deliberately returns
	// nothing: repository constructors are single-value, and an error return
	// here would just be dropped at 21 call sites — which is the bug this
	// replaces. Failures are recorded on the Database and reported once by
	// IndexSetupErr, which startup checks. See indexes.go.
	EnsureIndexes(ctx context.Context, collection string, models []opts.IndexModel)
	IndexSetupErr() error
}

// QmgoDatabase implements Database by wrapping a qmgo Client and Database.
type QmgoDatabase struct {
	client *qmgo.Client
	db     *qmgo.Database
	indexRecord
}

func (d *QmgoDatabase) Close(ctx context.Context) error {
	return d.client.Close(ctx)
}

func (d *QmgoDatabase) Ping(timeout int64) error {
	return d.client.Ping(timeout)
}

func (d *QmgoDatabase) Collection(name string) Collection {
	return &QmgoCollection{coll: d.db.Collection(name)}
}

func (d *QmgoDatabase) DoTransaction(ctx context.Context, fn func(ctx context.Context) (interface{}, error)) (interface{}, error) {
	return d.client.DoTransaction(ctx, fn)
}

// NewDatabase connects to MongoDB using MONGO_URI and MONGO_DATABASE env vars.
// Retries up to 3 times on connection failure.
func NewDatabase(ctx context.Context) (Database, error) {
	env := environment.GetEnvironmentSettings()

	if env.MongoURI == "" {
		return nil, fmt.Errorf("MONGO_URI is not configured")
	}
	if env.MongoDatabase == "" {
		return nil, fmt.Errorf("MONGO_DATABASE is not configured")
	}
	return Connect(ctx, env.MongoURI, env.MongoDatabase)
}

// Connect opens a connection to an explicitly named database, with the same
// retry and ping behaviour as NewDatabase.
//
// NewDatabase resolves the URI and database name from the environment and
// delegates here. Taking them as arguments keeps "where the settings come
// from" separate from "how the connection is made", which is what lets a test
// point at a scratch database without the process-wide environment deciding
// for it — writing test rows into a developer's own database is a mistake worth
// making structurally impossible.
func Connect(ctx context.Context, uri, dbName string) (Database, error) {
	var client *qmgo.Client
	var err error

	for i := 1; i <= 3; i++ {
		client, err = qmgo.NewClient(ctx, &qmgo.Config{Uri: uri})
		if err == nil {
			break
		}
		log.Printf("Attempt %d: failed to connect to MongoDB: %v", i, err)
		if i < 3 {
			time.Sleep(3 * time.Second)
		}
	}

	if err != nil {
		return nil, fmt.Errorf("failed to connect to MongoDB after 3 attempts: %w", err)
	}

	if err := client.Ping(10); err != nil {
		_ = client.Close(ctx) // already returning an error; nothing to add
		return nil, fmt.Errorf("MongoDB ping failed: %w", err)
	}

	log.Println("MongoDB connection established successfully.")

	return &QmgoDatabase{
		client: client,
		db:     client.Database(dbName),
	}, nil
}
