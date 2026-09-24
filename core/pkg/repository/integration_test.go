package repository

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/qiniu/qmgo/field"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
)

// Repository integration tests.
//
// The unit tests in this package are pure-function: they assert on the bson.M a
// builder returns and never execute a query. That leaves the half of this layer
// that only a server can answer — keyset pagination, sort direction, the _id
// tiebreaker, projections, the text-search branches — unverified, and those are
// exactly the behaviours that break silently. A reversed sort or a page that
// drops a row returns plausible data, not an error.
//
// Opt-in through INTEGRATION_MONGO_URI, so CI and `make test` are unaffected.
// Each test gets its own database named after itself and drops it at the end,
// so a failing run leaves nothing behind and two runs cannot collide:
//
//	INTEGRATION_MONGO_URI=mongodb://user:pass@localhost:27018 \
//	  go test ./pkg/repository/ -run Integration -v
//
// These are written against repository interfaces rather than qmgo, so they
// keep their meaning if the ODM underneath is ever replaced — which is the
// other reason they exist.

// integrationDB connects to a scratch database for one test and registers its
// teardown. It skips the test when INTEGRATION_MONGO_URI is unset.
func integrationDB(t *testing.T) database.Database {
	t.Helper()

	uri := os.Getenv("INTEGRATION_MONGO_URI")
	if uri == "" {
		t.Skip("INTEGRATION_MONGO_URI not set; skipping repository integration test")
	}

	// A database per test, so tests are independent, can run in any order, and
	// two concurrent runs of the suite do not interfere.
	//
	// Mongo caps a database name at 63 bytes, so the test name is what gets
	// trimmed — never the unique suffix. Truncating the whole string instead
	// would cut the suffix off the longest test names and hand two concurrent
	// runs the same database, which fails in a way that looks like a flaky
	// test rather than a name collision.
	const maxDBName = 63
	suffix := fmt.Sprintf("_%d", time.Now().UnixNano())
	prefix := "itest_"
	testName := t.Name()
	if room := maxDBName - len(prefix) - len(suffix); len(testName) > room {
		testName = testName[:room]
	}
	name := prefix + testName + suffix

	db, err := database.Connect(context.Background(), uri, name)
	if err != nil {
		t.Fatalf("connect to %s: %v", uri, err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cancel()
		// Drop the collections these tests can create. The database itself is
		// per-test and left empty; an empty database costs nothing and dropping
		// one needs privileges a test user may not have.
		for _, c := range []string{
			wikiDocumentCollection, credentialCollection, taskCollection,
			hostCollection, hashCollection, userCollection, operationCollection,
			wikiDocumentBackupCollection,
		} {
			_ = db.Collection(c).DropCollection(ctx)
		}
		if err := db.Close(ctx); err != nil {
			t.Logf("warning: could not close connection: %v", err)
		}
	})
	return db
}

func testCtx(t *testing.T) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	t.Cleanup(cancel)
	return ctx
}

// pageAll walks a cursor-paginated list one small page at a time and returns
// the rows in the order the caller would see them.
//
// This is the shape almost every test here uses, because the property that
// matters is not what a single page contains but that walking the whole list
// in small steps sees every row exactly once, in the same order a single large
// fetch would. That one invariant catches a reversed comparison, an off-by-one
// at the page boundary, a missing _id tiebreaker, and a cursor filter that
// drops or repeats rows at the seam.
//
// fetch receives the cursor for the next page and the page size, and returns
// the rows; cursorOf encodes a row's cursor exactly as the resolver would.
// pageAll stops when a page comes back short, and fails the test if it takes
// more steps than there could be rows — the symptom of a cursor that does not
// advance.
func pageAll[T any](
	t *testing.T,
	pageSize int64,
	total int,
	fetch func(cursor *pagination.Cursor, limit int64) ([]T, error),
	cursorOf func(*T) string,
) []T {
	t.Helper()

	var (
		out    []T
		cursor *pagination.Cursor
		steps  int
	)
	maxSteps := total + 2 // one extra page to see the short read, one for slack

	for {
		steps++
		if steps > maxSteps {
			t.Fatalf("pagination did not terminate after %d pages of %d "+
				"(collected %d rows of %d) — the cursor is not advancing",
				steps, pageSize, len(out), total)
		}

		page, err := fetch(cursor, pageSize)
		if err != nil {
			t.Fatalf("page %d: %v", steps, err)
		}
		out = append(out, page...)
		if int64(len(page)) < pageSize {
			return out
		}

		last := &page[len(page)-1]
		decoded, err := pagination.DecodeCursor(cursorOf(last))
		if err != nil {
			t.Fatalf("page %d: decode cursor: %v", steps, err)
		}
		cursor = &decoded
	}
}

// assertSameOrder fails with a readable diff when two row orders disagree. It
// reports the first divergence rather than dumping both lists, since the usual
// failure is one row out of place or missing.
func assertSameOrder(t *testing.T, what string, got, want []string) {
	t.Helper()

	if len(got) != len(want) {
		t.Errorf("%s: got %d rows, want %d\n got:  %v\n want: %v",
			what, len(got), len(want), got, want)
		// Still report the first divergence below when there is one to find.
	}
	for i := 0; i < len(got) && i < len(want); i++ {
		if got[i] != want[i] {
			t.Errorf("%s: first divergence at index %d: got %q, want %q\n got:  %v\n want: %v",
				what, i, got[i], want[i], got, want)
			return
		}
	}
}

// assertNoDuplicates catches the other half of a broken cursor: a page seam
// that repeats a row rather than skipping one.
func assertNoDuplicates(t *testing.T, what string, ids []string) {
	t.Helper()
	seen := make(map[string]int, len(ids))
	for i, id := range ids {
		if prev, dup := seen[id]; dup {
			t.Errorf("%s: %q appears at both index %d and %d", what, id, prev, i)
			return
		}
		seen[id] = i
	}
}

// seedClock hands out timestamps for seeded rows.
//
// step > 0 gives every row a distinct sort value; step == 0 gives them all the
// same one, which is how the _id tiebreaker gets exercised. Without a tie in
// the data, a missing tiebreaker looks correct.
type seedClock struct {
	base time.Time
	step time.Duration
	n    int
}

func newSeedClock(step time.Duration) *seedClock {
	// Truncated to milliseconds: BSON datetimes have millisecond precision, so
	// a finer step would collide in the database and make ordering ambiguous
	// for reasons unrelated to the code under test.
	return &seedClock{
		base: time.Now().UTC().Truncate(time.Millisecond).Add(-24 * time.Hour),
		step: step,
	}
}

func (c *seedClock) next() time.Time {
	t := c.base.Add(time.Duration(c.n) * c.step)
	c.n++
	return t
}

// createdAt builds the embedded qmgo timestamp field with an explicit
// creation time. qmgo only fills CreateAt when it is zero, so a seeded value
// survives the insert — which is what lets these tests lay out a known order
// instead of depending on how fast the inserts run.
func createdAt(at time.Time) field.DefaultField {
	return field.DefaultField{CreateAt: at, UpdateAt: at}
}
