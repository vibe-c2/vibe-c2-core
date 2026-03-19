package database

import (
	"context"

	"github.com/qiniu/qmgo"
	opts "github.com/qiniu/qmgo/options"
)

// Collection is a proxy interface over a qmgo MongoDB collection.
type Collection interface {
	InsertOne(ctx context.Context, doc interface{}) (*qmgo.InsertOneResult, error)
	InsertMany(ctx context.Context, docs interface{}) (*qmgo.InsertManyResult, error)
	Find(ctx context.Context, filter interface{}) qmgo.QueryI
	FindOne(ctx context.Context, filter interface{}) qmgo.QueryI
	UpdateOne(ctx context.Context, filter, update interface{}) error
	UpdateAll(ctx context.Context, filter, update interface{}) (*qmgo.UpdateResult, error)
	UpdateID(ctx context.Context, id, update interface{}) error
	Upsert(ctx context.Context, filter, replacement interface{}) (*qmgo.UpdateResult, error)
	Remove(ctx context.Context, filter interface{}) error
	RemoveAll(ctx context.Context, filter interface{}) (*qmgo.DeleteResult, error)
	RemoveID(ctx context.Context, id interface{}) error
	Count(ctx context.Context, filter interface{}) (int64, error)
	Aggregate(ctx context.Context, pipeline interface{}) qmgo.AggregateI
	CreateIndexes(ctx context.Context, indexes []opts.IndexModel) error
	DropCollection(ctx context.Context) error
}

// QmgoCollection implements Collection by delegating to a qmgo.Collection.
type QmgoCollection struct {
	coll *qmgo.Collection
}

func (c *QmgoCollection) InsertOne(ctx context.Context, doc interface{}) (*qmgo.InsertOneResult, error) {
	return c.coll.InsertOne(ctx, doc)
}

func (c *QmgoCollection) InsertMany(ctx context.Context, docs interface{}) (*qmgo.InsertManyResult, error) {
	return c.coll.InsertMany(ctx, docs)
}

func (c *QmgoCollection) Find(ctx context.Context, filter interface{}) qmgo.QueryI {
	return c.coll.Find(ctx, filter)
}

func (c *QmgoCollection) FindOne(ctx context.Context, filter interface{}) qmgo.QueryI {
	return c.coll.Find(ctx, filter).Limit(1)
}

func (c *QmgoCollection) UpdateOne(ctx context.Context, filter, update interface{}) error {
	return c.coll.UpdateOne(ctx, filter, update)
}

func (c *QmgoCollection) UpdateAll(ctx context.Context, filter, update interface{}) (*qmgo.UpdateResult, error) {
	return c.coll.UpdateAll(ctx, filter, update)
}

func (c *QmgoCollection) UpdateID(ctx context.Context, id, update interface{}) error {
	return c.coll.UpdateId(ctx, id, update)
}

func (c *QmgoCollection) Upsert(ctx context.Context, filter, replacement interface{}) (*qmgo.UpdateResult, error) {
	return c.coll.Upsert(ctx, filter, replacement)
}

func (c *QmgoCollection) Remove(ctx context.Context, filter interface{}) error {
	return c.coll.Remove(ctx, filter)
}

func (c *QmgoCollection) RemoveAll(ctx context.Context, filter interface{}) (*qmgo.DeleteResult, error) {
	return c.coll.RemoveAll(ctx, filter)
}

func (c *QmgoCollection) RemoveID(ctx context.Context, id interface{}) error {
	return c.coll.RemoveId(ctx, id)
}

func (c *QmgoCollection) Count(ctx context.Context, filter interface{}) (int64, error) {
	return c.coll.Find(ctx, filter).Count()
}

func (c *QmgoCollection) Aggregate(ctx context.Context, pipeline interface{}) qmgo.AggregateI {
	return c.coll.Aggregate(ctx, pipeline)
}

func (c *QmgoCollection) CreateIndexes(ctx context.Context, indexes []opts.IndexModel) error {
	return c.coll.CreateIndexes(ctx, indexes)
}

func (c *QmgoCollection) DropCollection(ctx context.Context) error {
	return c.coll.DropCollection(ctx)
}
