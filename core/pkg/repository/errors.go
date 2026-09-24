package repository

import (
	"errors"

	"github.com/qiniu/qmgo"
	"go.mongodb.org/mongo-driver/mongo"
)

// ErrNotFound reports that a lookup matched no row.
//
// Why this exists: "the row is gone" and "the database did not answer" arrive
// at a caller as the same non-nil error, and a lot of field resolvers used to
// treat both as the former — returning null for a deleted author. Under load,
// which is exactly when a query times out, that turns an outage into a page of
// silently missing names instead of an error anyone can see. api_key_resolver
// spelled the trade-off out and accepted it "for now"; IsNotFound is what
// makes the distinction cheap enough to stop accepting.
//
// Return it from a repository method that decides on its own that there is no
// row. A miss that comes back from the ODM already has its own error, so
// callers ask with IsNotFound rather than comparing against this directly.
var ErrNotFound = errors.New("not found")

// IsNotFound reports whether err means "no row matched", as opposed to a
// failure to find out.
//
// Callers use this instead of errors.Is(err, ErrNotFound): a miss on a read
// path surfaces as the ODM's own sentinel, not as ErrNotFound, and there are
// two of them — qmgo.ErrNoSuchDocuments from the qmgo query API and
// mongo.ErrNoDocuments from the raw driver, which the repositories that need
// text indexes or bulk writes use directly. Both mean the same thing, and
// which one a caller gets is an implementation detail of the repository it
// happens to be talking to.
//
// Keeping that knowledge here is also what stops it spreading: pkg/resolver,
// pkg/modulegate and pkg/skills each imported qmgo solely to name its
// not-found error, which made the choice of ODM visible three layers up.
func IsNotFound(err error) bool {
	return errors.Is(err, ErrNotFound) ||
		errors.Is(err, qmgo.ErrNoSuchDocuments) ||
		errors.Is(err, mongo.ErrNoDocuments)
}
