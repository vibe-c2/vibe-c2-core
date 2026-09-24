package database

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"

	opts "github.com/qiniu/qmgo/options"
)

// Index setup, and why its errors are not optional.
//
// Every repository declares its indexes in its constructor. A failure there is
// not cosmetic: MongoDB answers the query anyway, by scanning the collection.
// The service comes up healthy, every read still returns correct rows, and the
// only symptom is latency that grows with the data — which is precisely the
// failure you do not want to discover from a production graph.
//
// The common cause is a changed definition. Adding a field to an existing
// index, or changing its options, makes the server reject the new spec with
// IndexOptionsConflict / IndexKeySpecsConflict because an index of that name
// already exists with different terms. The old index stays and the new one
// never appears, so the query it was written for silently falls back to a
// scan. That needs a deliberate drop or a migration, which means it has to
// reach a human rather than a log line nobody reads.
//
// Repository constructors return a single value, so EnsureIndexes records
// failures on the Database instead of returning them. App startup drains the
// record once every repository is built (see IndexSetupErr) and refuses to
// boot if anything failed.

// EnsureIndexes creates the given indexes on a collection, recording any
// failure for IndexSetupErr to report. Safe to call concurrently.
func (d *QmgoDatabase) EnsureIndexes(ctx context.Context, collection string, models []opts.IndexModel) {
	if len(models) == 0 {
		return
	}
	if err := d.Collection(collection).CreateIndexes(ctx, models); err != nil {
		d.indexMu.Lock()
		d.indexErrs = append(d.indexErrs, &IndexSetupError{
			Collection: collection,
			Keys:       indexKeys(models),
			Err:        err,
		})
		d.indexMu.Unlock()
	}
}

// IndexSetupErr reports every index that failed to build since startup, or nil
// if they all succeeded.
func (d *QmgoDatabase) IndexSetupErr() error {
	d.indexMu.Lock()
	defer d.indexMu.Unlock()
	if len(d.indexErrs) == 0 {
		return nil
	}
	joined := make([]error, len(d.indexErrs))
	for i, e := range d.indexErrs {
		joined[i] = e
	}
	return errors.Join(joined...)
}

// IndexSetupError is one collection's failed index build.
type IndexSetupError struct {
	Collection string
	Keys       []string
	Err        error
}

func (e *IndexSetupError) Error() string {
	msg := fmt.Sprintf("index setup failed for collection %q (indexes: %s): %v",
		e.Collection, strings.Join(e.Keys, "; "), e.Err)
	if e.IsConflict() {
		msg += " — an index of this name already exists with different terms;" +
			" drop the old index or rename the new one before deploying"
	}
	return msg
}

func (e *IndexSetupError) Unwrap() error { return e.Err }

// IsConflict reports whether the failure is MongoDB refusing a changed
// definition, as opposed to a transient or permission error. This is the case
// that needs a migration rather than a retry.
func (e *IndexSetupError) IsConflict() bool {
	s := e.Err.Error()
	return strings.Contains(s, "IndexOptionsConflict") ||
		strings.Contains(s, "IndexKeySpecsConflict") ||
		strings.Contains(s, "already exists with different") ||
		strings.Contains(s, "different name")
}

// indexKeys renders the key sets for the error message, so the log names the
// index that failed rather than just the collection.
func indexKeys(models []opts.IndexModel) []string {
	out := make([]string, 0, len(models))
	for _, m := range models {
		out = append(out, "{"+strings.Join(m.Key, ",")+"}")
	}
	return out
}

// indexRecord is embedded in QmgoDatabase; kept here so the index-setup
// concern stays in one file.
type indexRecord struct {
	indexMu   sync.Mutex
	indexErrs []*IndexSetupError
}
