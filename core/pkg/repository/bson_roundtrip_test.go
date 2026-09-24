package repository

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo"
	"go.mongodb.org/mongo-driver/bson"
)

// TestBSONRoundTrip runs the filter shapes the repositories actually build
// against a real MongoDB, to check how they encode on the wire.
//
// The unit tests here are pure-function: they assert on the bson.M a builder
// returns and never encode one. That leaves the encoding path itself
// unverified, which is where a change of bson package or an upgrade of qmgo
// would show up — the repositories were on mongo-driver/v2's bson while qmgo
// executed every query through v1's, and the two happened to agree because
// bson.M is map[string]interface{} in both.
//
// Opt-in: set INTEGRATION_MONGO_URI to a disposable database. It writes to
// bson_roundtrip.probe and drops it afterwards. Skipped in CI, which has no
// broker or database.
//
// It drives qmgo directly rather than database.Collection because the
// encoding is qmgo's; the wrapper only forwards.
func TestBSONRoundTrip(t *testing.T) {
	uri := os.Getenv("INTEGRATION_MONGO_URI")
	if uri == "" {
		t.Skip("INTEGRATION_MONGO_URI not set; skipping repository integration test")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	cli, err := qmgo.NewClient(ctx, &qmgo.Config{Uri: uri})
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer func() { _ = cli.Close(ctx) }()
	coll := cli.Database("bson_roundtrip").Collection("probe")
	defer func() { _ = coll.DropCollection(ctx) }()

	opID, docID := uuid.New(), uuid.New()
	now := time.Now().UTC().Truncate(time.Millisecond)

	type probe struct {
		DocumentID uuid.UUID   `bson:"document_id"`
		OpID       uuid.UUID   `bson:"operation_id"`
		Title      string      `bson:"title"`
		DeletedAt  *time.Time  `bson:"deleted_at"`
		PathIDs    []uuid.UUID `bson:"path_ids"`
		Score      int         `bson:"score"`
	}
	rows := []interface{}{
		probe{DocumentID: docID, OpID: opID, Title: "alpha", Score: 7, PathIDs: []uuid.UUID{opID}},
		probe{DocumentID: uuid.New(), OpID: opID, Title: "beta", Score: 3, DeletedAt: &now},
		probe{DocumentID: uuid.New(), OpID: uuid.New(), Title: "other-op", Score: 9},
	}
	if _, err := coll.InsertMany(ctx, rows); err != nil {
		t.Fatalf("insert: %v", err)
	}

	// Every construct the repositories actually use: uuid equality, nil
	// matching, $in over a uuid slice, $or with bson.A, $regex, and a range.
	cases := []struct {
		name   string
		filter bson.M
		want   int
	}{
		{"uuid equality", bson.M{"operation_id": opID}, 2},
		{"nil deleted_at", bson.M{"operation_id": opID, "deleted_at": nil}, 1},
		{"in over uuids", bson.M{"document_id": bson.M{"$in": []uuid.UUID{docID}}}, 1},
		{"multikey uuid array", bson.M{"path_ids": opID}, 1},
		{"or with bson.A", bson.M{"$or": bson.A{
			bson.M{"title": "alpha"},
			bson.M{"title": "beta"},
		}}, 2},
		{"regex", bson.M{"title": bson.M{"$regex": `\balpha\b`, "$options": "i"}}, 1},
		{"range", bson.M{"score": bson.M{"$gte": 5}}, 2},
		{"nested and", bson.M{"operation_id": opID, "score": bson.M{"$lt": 5}}, 1},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			n, err := coll.Find(ctx, c.filter).Count()
			if err != nil {
				t.Fatalf("count: %v", err)
			}
			if int(n) != c.want {
				t.Errorf("filter %v matched %d, want %d", c.filter, n, c.want)
			}
		})
	}
}
