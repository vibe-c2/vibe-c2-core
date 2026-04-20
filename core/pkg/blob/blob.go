// Package blob provides an S3-compatible object store abstraction used for
// wiki image uploads. The production implementation talks to the SeaweedFS S3
// gateway; tests can substitute a fake.
package blob

import (
	"context"
	"io"
)

// ObjectInfo describes a stored object's metadata.
type ObjectInfo struct {
	ContentType   string
	ContentLength int64
	ETag          string
}

// ObjectStore is the small interface the rest of the app depends on.
// Interfaces live where they're used per Go convention.
type ObjectStore interface {
	// Put uploads an object. Size must be known up-front so the S3 client can
	// avoid a multipart upload for small images.
	Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) error

	// Get streams the object body. Caller must Close the reader.
	Get(ctx context.Context, key string) (io.ReadCloser, ObjectInfo, error)

	// Head returns metadata without fetching the body.
	Head(ctx context.Context, key string) (ObjectInfo, error)

	// Delete removes the object. Absence is not an error.
	Delete(ctx context.Context, key string) error
}
