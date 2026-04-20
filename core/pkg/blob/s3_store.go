package blob

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// S3Config configures the SeaweedFS-backed object store.
type S3Config struct {
	Endpoint  string // e.g. http://localhost:8333
	AccessKey string
	SecretKey string
	Bucket    string
}

// S3Store is a minio-go-backed ObjectStore. SeaweedFS's S3 gateway is the
// intended target, but any S3-compatible endpoint works.
type S3Store struct {
	client *minio.Client
	bucket string
}

// NewS3Store connects to the endpoint and ensures the bucket exists.
func NewS3Store(ctx context.Context, cfg S3Config) (*S3Store, error) {
	if cfg.Endpoint == "" {
		return nil, errors.New("blob: S3 endpoint is required")
	}
	if cfg.Bucket == "" {
		return nil, errors.New("blob: S3 bucket is required")
	}

	endpoint, secure, err := parseEndpoint(cfg.Endpoint)
	if err != nil {
		return nil, fmt.Errorf("blob: invalid endpoint: %w", err)
	}

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.AccessKey, cfg.SecretKey, ""),
		Secure: secure,
	})
	if err != nil {
		return nil, fmt.Errorf("blob: new minio client: %w", err)
	}

	ensureCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	exists, err := client.BucketExists(ensureCtx, cfg.Bucket)
	if err != nil {
		return nil, fmt.Errorf("blob: bucket exists check: %w", err)
	}
	if !exists {
		if err := client.MakeBucket(ensureCtx, cfg.Bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, fmt.Errorf("blob: create bucket %q: %w", cfg.Bucket, err)
		}
	}

	return &S3Store{client: client, bucket: cfg.Bucket}, nil
}

func (s *S3Store) Put(ctx context.Context, key string, body io.Reader, size int64, contentType string) error {
	_, err := s.client.PutObject(ctx, s.bucket, key, body, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return fmt.Errorf("blob: put %q: %w", key, err)
	}
	return nil
}

func (s *S3Store) Get(ctx context.Context, key string) (io.ReadCloser, ObjectInfo, error) {
	obj, err := s.client.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, ObjectInfo{}, fmt.Errorf("blob: get %q: %w", key, err)
	}

	// Stat up front so the caller knows size/content-type before streaming.
	// minio-go lazily opens the body so Stat failures surface here.
	stat, err := obj.Stat()
	if err != nil {
		obj.Close()
		return nil, ObjectInfo{}, fmt.Errorf("blob: stat %q: %w", key, err)
	}

	return obj, ObjectInfo{
		ContentType:   stat.ContentType,
		ContentLength: stat.Size,
		ETag:          stat.ETag,
	}, nil
}

func (s *S3Store) Head(ctx context.Context, key string) (ObjectInfo, error) {
	stat, err := s.client.StatObject(ctx, s.bucket, key, minio.StatObjectOptions{})
	if err != nil {
		return ObjectInfo{}, fmt.Errorf("blob: head %q: %w", key, err)
	}
	return ObjectInfo{
		ContentType:   stat.ContentType,
		ContentLength: stat.Size,
		ETag:          stat.ETag,
	}, nil
}

func (s *S3Store) Delete(ctx context.Context, key string) error {
	if err := s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{}); err != nil {
		return fmt.Errorf("blob: delete %q: %w", key, err)
	}
	return nil
}

// parseEndpoint normalizes endpoints like "http://host:8333" or "host:8333"
// into (host:port, secure) as minio-go expects.
func parseEndpoint(endpoint string) (string, bool, error) {
	if !strings.Contains(endpoint, "://") {
		return endpoint, false, nil
	}
	u, err := url.Parse(endpoint)
	if err != nil {
		return "", false, err
	}
	host := u.Host
	if host == "" {
		return "", false, fmt.Errorf("missing host in %q", endpoint)
	}
	return host, u.Scheme == "https", nil
}
