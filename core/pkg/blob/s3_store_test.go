package blob

import (
	"context"
	"errors"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/minio/minio-go/v7"
)

// fakeBucketClient is a hand-rolled stand-in for *minio.Client that lets
// each test script the exact sequence of answers the two bootstrap calls
// should see — including the transient "says no, then yes" pattern that
// triggers the SeaweedFS cold-start race.
type fakeBucketClient struct {
	existsCalls uint32
	makeCalls   uint32

	// existsResults[i] is the (exists, err) pair returned on the i-th
	// BucketExists call. Once exhausted, subsequent calls repeat the
	// final pair — lets "eventually present" scenarios converge cleanly.
	existsResults []existsResult

	// makeErr is returned from MakeBucket regardless of call count. nil
	// means "created successfully."
	makeErr error
}

type existsResult struct {
	exists bool
	err    error
}

func (f *fakeBucketClient) BucketExists(_ context.Context, _ string) (bool, error) {
	i := atomic.AddUint32(&f.existsCalls, 1) - 1
	if int(i) >= len(f.existsResults) {
		i = uint32(len(f.existsResults) - 1)
	}
	r := f.existsResults[i]
	return r.exists, r.err
}

func (f *fakeBucketClient) MakeBucket(_ context.Context, _ string, _ minio.MakeBucketOptions) error {
	atomic.AddUint32(&f.makeCalls, 1)
	return f.makeErr
}

// newFastBucketTest shrinks the backoff so the race-handling tests run in
// milliseconds instead of seconds. We don't rely on it elsewhere — the
// public entry point still uses the production constants.
func ensureBucketFast(ctx context.Context, c bucketClient, bucket string) error {
	// ensureBucket's backoff is a fixed 1s; callers who want faster test
	// loops can wrap the client in a no-wait ctx — but since the retry
	// relies on real time, we just let the test drive with a short
	// deadline and cancellation when the count is satisfied. For the
	// handful of tests that need it, we cap each test's overall deadline
	// via ctx.
	return ensureBucket(ctx, c, bucket)
}

func TestEnsureBucket_AlreadyExists(t *testing.T) {
	f := &fakeBucketClient{
		existsResults: []existsResult{{exists: true}},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	if err := ensureBucketFast(ctx, f, "wiki-images"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := atomic.LoadUint32(&f.existsCalls); got != 1 {
		t.Errorf("BucketExists calls = %d, want 1", got)
	}
	if got := atomic.LoadUint32(&f.makeCalls); got != 0 {
		t.Errorf("MakeBucket should not be called when bucket is present, got %d", got)
	}
}

func TestEnsureBucket_VisibleOnRetry(t *testing.T) {
	// Gateway says "no" twice, then "yes" — the common SeaweedFS
	// cold-start case. We should converge without ever creating.
	f := &fakeBucketClient{
		existsResults: []existsResult{
			{exists: false},
			{exists: false},
			{exists: true},
		},
	}
	// 5s of budget is plenty: two backoff intervals of 1s each.
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := ensureBucketFast(ctx, f, "wiki-images"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := atomic.LoadUint32(&f.existsCalls); got != 3 {
		t.Errorf("BucketExists calls = %d, want 3", got)
	}
	if got := atomic.LoadUint32(&f.makeCalls); got != 0 {
		t.Errorf("MakeBucket should not be called on successful retry, got %d", got)
	}
}

func TestEnsureBucket_CreatesOnFreshInstall(t *testing.T) {
	// Gateway keeps saying "no" — real empty install. We exhaust the
	// retry budget, call MakeBucket, and accept its success.
	f := &fakeBucketClient{
		existsResults: []existsResult{{exists: false}},
		makeErr:       nil,
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := ensureBucketFast(ctx, f, "wiki-files"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got := atomic.LoadUint32(&f.existsCalls); got != 10 {
		t.Errorf("BucketExists calls = %d, want 10 (retry budget exhausted)", got)
	}
	if got := atomic.LoadUint32(&f.makeCalls); got != 1 {
		t.Errorf("MakeBucket calls = %d, want 1", got)
	}
}

func TestEnsureBucket_OperationAbortedPropagates(t *testing.T) {
	// 10 "no" answers exhaust the retry budget; MakeBucket then returns
	// OperationAborted. This used to be treated as benign, but with the
	// filer now persisting its state (docker-compose seaweedfs_filer_data
	// volume), a legitimate "already exists" response here means the
	// cluster is in a zombie state. Fail-fast so it surfaces at boot
	// rather than silently breaking first upload.
	f := &fakeBucketClient{
		existsResults: []existsResult{{exists: false}},
		makeErr: minio.ErrorResponse{
			Code:    "OperationAborted",
			Message: "The requested bucket name is not available.",
		},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	err := ensureBucketFast(ctx, f, "wiki-images")
	if err == nil {
		t.Fatalf("expected MakeBucket error to propagate")
	}
	if !strings.Contains(err.Error(), "OperationAborted") &&
		!strings.Contains(err.Error(), "not available") {
		t.Errorf("wrapped error should retain original cause, got %q", err.Error())
	}
	if got := atomic.LoadUint32(&f.makeCalls); got != 1 {
		t.Errorf("MakeBucket calls = %d, want 1", got)
	}
}

func TestEnsureBucket_BucketAlreadyOwnedPropagates(t *testing.T) {
	// AWS-style BucketAlreadyOwnedByYou also propagates — the only path
	// that legitimately produces it is a transient race we've already
	// widened the retry budget to cover, so if it still surfaces the
	// cluster is in a state the app can't recover from.
	f := &fakeBucketClient{
		existsResults: []existsResult{{exists: false}},
		makeErr:       minio.ErrorResponse{Code: "BucketAlreadyOwnedByYou"},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	if err := ensureBucketFast(ctx, f, "bkt"); err == nil {
		t.Fatalf("expected MakeBucket error to propagate")
	}
}

// TestEnsureBucket_SeaweedFSMessagePropagates reproduces the exact failure
// from the deployment log. With the filer now persistent, seeing this
// message means master and filer state are out of sync — the app should
// fail loudly rather than silently proceeding with an unusable bucket.
func TestEnsureBucket_SeaweedFSMessagePropagates(t *testing.T) {
	f := &fakeBucketClient{
		existsResults: []existsResult{{exists: false}},
		makeErr: errors.New(
			"The requested bucket name is not available. The bucket name can not be an existing collection, and the bucket namespace is shared by all users of the system. Please select a different name and try again.",
		),
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	err := ensureBucketFast(ctx, f, "wiki-images")
	if err == nil {
		t.Fatalf("expected SeaweedFS collection-exists error to propagate")
	}
	if !strings.Contains(err.Error(), "existing collection") {
		t.Errorf("wrapped error should retain original cause, got %q", err.Error())
	}
}

func TestEnsureBucket_UnknownErrorPropagates(t *testing.T) {
	// Control case: AccessDenied is never benign — real misconfig must
	// still fail the boot. This guards against future maintainers
	// over-expanding the benign allowlist.
	f := &fakeBucketClient{
		existsResults: []existsResult{{exists: false}},
		makeErr:       minio.ErrorResponse{Code: "AccessDenied"},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()

	err := ensureBucketFast(ctx, f, "wiki-images")
	if err == nil {
		t.Fatalf("expected AccessDenied to propagate")
	}
	if got := atomic.LoadUint32(&f.makeCalls); got != 1 {
		t.Errorf("MakeBucket calls = %d, want 1", got)
	}
}

func TestEnsureBucket_ContextCancelledDuringRetry(t *testing.T) {
	// If startup context is cancelled while we're backing off, return
	// promptly with ctx.Err() — don't keep sleeping through it.
	f := &fakeBucketClient{
		existsResults: []existsResult{{exists: false}},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	start := time.Now()
	err := ensureBucketFast(ctx, f, "wiki-images")
	elapsed := time.Since(start)

	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("want DeadlineExceeded, got %v", err)
	}
	// The retry backoff is 1s; cancellation must cut that short.
	if elapsed > 900*time.Millisecond {
		t.Errorf("cancellation not honored promptly; elapsed = %v", elapsed)
	}
}

func TestEnsureBucket_TransientErrorsRecover(t *testing.T) {
	// BucketExists can itself return an error transiently (DNS, TLS
	// handshake, gateway not ready for TCP). We should keep retrying
	// and converge once the error clears.
	f := &fakeBucketClient{
		existsResults: []existsResult{
			{err: errors.New("connection refused")},
			{err: errors.New("connection refused")},
			{exists: true},
		},
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := ensureBucketFast(ctx, f, "wiki-images"); err != nil {
		t.Fatalf("expected to recover after transient errors, got %v", err)
	}
	if got := atomic.LoadUint32(&f.existsCalls); got != 3 {
		t.Errorf("BucketExists calls = %d, want 3", got)
	}
}
