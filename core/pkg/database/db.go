package database

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/qiniu/qmgo"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/environment"
)

// Database is a proxy interface over qmgo for MongoDB operations.
// It provides collection access, transaction support, and lifecycle management.
type Database interface {
	Close(ctx context.Context) error
	Ping(timeout int64) error
	Collection(name string) Collection
	DoTransaction(ctx context.Context, fn func(ctx context.Context) (interface{}, error)) (interface{}, error)
}

// QmgoDatabase implements Database by wrapping a qmgo Client and Database.
type QmgoDatabase struct {
	client *qmgo.Client
	db     *qmgo.Database
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

	uri := env.MongoURI
	if uri == "" {
		return nil, fmt.Errorf("MONGO_URI is not configured")
	}

	dbName := env.MongoDatabase
	if dbName == "" {
		return nil, fmt.Errorf("MONGO_DATABASE is not configured")
	}

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
		client.Close(ctx)
		return nil, fmt.Errorf("MongoDB ping failed: %w", err)
	}

	log.Println("MongoDB connection established successfully.")

	return &QmgoDatabase{
		client: client,
		db:     client.Database(dbName),
	}, nil
}
