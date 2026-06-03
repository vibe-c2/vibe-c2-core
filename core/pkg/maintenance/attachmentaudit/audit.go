// Package attachmentaudit is a READ-ONLY damage report for wiki attachments.
// It answers one question: which wiki_images / wiki_files metadata rows point
// at an object that no longer exists in storage?
//
// Background: a now-fixed garbage-collector bug deleted attachment blobs that
// were still referenced by documents. The fix stops further loss, but blobs
// already deleted are unrecoverable. This tool quantifies the existing damage
// so you can decide what to do with the dead references (leave them showing
// the "image unavailable" placeholder, clear them, or ask owners to
// re-upload).
//
// It NEVER writes or deletes anything — it only lists metadata, issues HEAD
// requests against the object store, and prints a report. Safe to run against
// production at any time.
//
// It runs as a subcommand of the main binary (see core/main.go) so it ships
// inside the same production image:
//
//	docker compose run --rm core wiki-attachment-audit
//	docker compose run --rm core wiki-attachment-audit -concurrency 32
//
// Locally: go run . wiki-attachment-audit
package attachmentaudit

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sort"
	"sync"

	"github.com/google/uuid"
	minio "github.com/minio/minio-go/v7"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/blob"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/environment"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.mongodb.org/mongo-driver/v2/bson"
)

// attachment is the common shape we audit, projected from either collection
// so the storage check and reporting can treat images and files uniformly.
type attachment struct {
	kind      string // "image" or "file"
	id        uuid.UUID
	opID      uuid.UUID
	docID     uuid.UUID
	objectKey string
	label     string // filename for files; empty for images
}

// result is the verdict for one attachment after the storage check.
type result struct {
	att     attachment
	missing bool  // blob is gone (object store returned not-found)
	err     error // non-nil = inconclusive (transient/unknown), NOT counted as missing
}

// Run executes the read-only audit: it lists every attachment, checks each
// blob's existence in the object store with `concurrency` parallel HEAD
// requests, and prints a grouped damage report. It never mutates anything.
func Run(ctx context.Context, concurrency int) error {
	if concurrency < 1 {
		concurrency = 1
	}

	e := environment.GetEnvironmentSettings()

	db, err := database.NewDatabase(ctx)
	if err != nil {
		return fmt.Errorf("connect mongo: %w", err)
	}

	imageStore, err := blob.NewS3Store(ctx, blob.S3Config{
		Endpoint:  e.SeaweedFSS3Endpoint,
		AccessKey: e.SeaweedFSS3AccessKey,
		SecretKey: e.SeaweedFSS3SecretKey,
		Bucket:    e.WikiImageBucket,
	})
	if err != nil {
		return fmt.Errorf("init image store: %w", err)
	}
	fileStore, err := blob.NewS3Store(ctx, blob.S3Config{
		Endpoint:  e.SeaweedFSS3Endpoint,
		AccessKey: e.SeaweedFSS3AccessKey,
		SecretKey: e.SeaweedFSS3SecretKey,
		Bucket:    e.WikiFileBucket,
	})
	if err != nil {
		return fmt.Errorf("init file store: %w", err)
	}

	atts, err := loadAttachments(ctx, db)
	if err != nil {
		return fmt.Errorf("load attachments: %w", err)
	}
	log.Printf("scanning %d attachment(s) with concurrency %d ...", len(atts), concurrency)

	results := checkAll(ctx, atts, imageStore, fileStore, concurrency)
	report(ctx, db, results)
	return nil
}

// loadAttachments reads every wiki_images and wiki_files row and projects them
// into the uniform attachment shape. Direct collection reads (like
// cmd/seed-timeline) keep the tool independent of the repositories' query
// surface — we genuinely want ALL rows, not the sweeper's "older than" subset.
func loadAttachments(ctx context.Context, db database.Database) ([]attachment, error) {
	var out []attachment

	var images []models.WikiImage
	if err := db.Collection("wiki_images").Find(ctx, bson.M{}).All(&images); err != nil {
		return nil, fmt.Errorf("list wiki_images: %w", err)
	}
	for _, img := range images {
		out = append(out, attachment{
			kind:      "image",
			id:        img.ImageID,
			opID:      img.OperationID,
			docID:     img.DocumentID,
			objectKey: img.ObjectKey,
		})
	}

	var files []models.WikiFile
	if err := db.Collection("wiki_files").Find(ctx, bson.M{}).All(&files); err != nil {
		return nil, fmt.Errorf("list wiki_files: %w", err)
	}
	for _, f := range files {
		out = append(out, attachment{
			kind:      "file",
			id:        f.FileID,
			opID:      f.OperationID,
			docID:     f.DocumentID,
			objectKey: f.ObjectKey,
			label:     f.Filename,
		})
	}

	return out, nil
}

// checkAll runs the storage existence check across a bounded worker pool.
func checkAll(ctx context.Context, atts []attachment, imageStore, fileStore blob.ObjectStore, concurrency int) []result {
	jobs := make(chan attachment)
	results := make([]result, len(atts))
	indexOf := make(map[uuid.UUID]int, len(atts))
	for i, a := range atts {
		indexOf[a.id] = i
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	for w := 0; w < concurrency; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for a := range jobs {
				store := imageStore
				if a.kind == "file" {
					store = fileStore
				}
				missing, err := blobMissing(ctx, store, a.objectKey)
				mu.Lock()
				results[indexOf[a.id]] = result{att: a, missing: missing, err: err}
				mu.Unlock()
			}
		}()
	}
	for _, a := range atts {
		jobs <- a
	}
	close(jobs)
	wg.Wait()

	return results
}

// blobMissing returns (true, nil) when the object store reports the key as
// not-found, (false, nil) when it exists, and (false, err) when the result is
// inconclusive (network blip, auth, etc.). We are deliberately conservative:
// only a genuine not-found counts as missing, so transient errors never
// inflate the damage count.
func blobMissing(ctx context.Context, store blob.ObjectStore, key string) (bool, error) {
	_, err := store.Head(ctx, key)
	if err == nil {
		return false, nil
	}
	var er minio.ErrorResponse
	if errors.As(err, &er) {
		if er.StatusCode == 404 || er.Code == "NoSuchKey" {
			return true, nil
		}
	}
	return false, err
}

// report prints the human-readable summary, grouped by operation and document.
func report(ctx context.Context, db database.Database, results []result) {
	var missing []attachment
	var inconclusive []result
	scanned := len(results)
	for _, r := range results {
		switch {
		case r.err != nil:
			inconclusive = append(inconclusive, r)
		case r.missing:
			missing = append(missing, r.att)
		}
	}

	fmt.Printf("\n=== Wiki attachment damage report ===\n")
	fmt.Printf("scanned:       %d\n", scanned)
	fmt.Printf("broken (gone): %d\n", len(missing))
	fmt.Printf("inconclusive:  %d\n", len(inconclusive))

	if len(missing) == 0 {
		fmt.Printf("\nNo missing blobs found. Nothing to clean up.\n")
	} else {
		opNames := resolveOperationNames(ctx, db, missing)
		docNames := resolveDocumentNames(ctx, db, missing)
		printGrouped(missing, opNames, docNames)
	}

	if len(inconclusive) > 0 {
		fmt.Printf("\n--- inconclusive (storage error, re-run to confirm) ---\n")
		for _, r := range inconclusive {
			fmt.Printf("  %-5s %s  key=%s  err=%v\n", r.att.kind, r.att.id, r.att.objectKey, r.err)
		}
	}
	fmt.Println()
}

// printGrouped lays the missing attachments out under operation → document so
// the report reads as "these documents have dead links", not UUID soup.
func printGrouped(missing []attachment, opNames map[uuid.UUID]string, docNames map[uuid.UUID]string) {
	byOp := make(map[uuid.UUID][]attachment)
	for _, a := range missing {
		byOp[a.opID] = append(byOp[a.opID], a)
	}

	opIDs := make([]uuid.UUID, 0, len(byOp))
	for id := range byOp {
		opIDs = append(opIDs, id)
	}
	sort.Slice(opIDs, func(i, j int) bool {
		return opNames[opIDs[i]] < opNames[opIDs[j]]
	})

	fmt.Printf("\n--- broken attachments by operation / document ---\n")
	for _, opID := range opIDs {
		fmt.Printf("\noperation %q (%s)\n", nameOr(opNames, opID, "unknown"), opID)
		byDoc := make(map[uuid.UUID][]attachment)
		for _, a := range byOp[opID] {
			byDoc[a.docID] = append(byDoc[a.docID], a)
		}
		docIDs := make([]uuid.UUID, 0, len(byDoc))
		for id := range byDoc {
			docIDs = append(docIDs, id)
		}
		sort.Slice(docIDs, func(i, j int) bool {
			return docNames[docIDs[i]] < docNames[docIDs[j]]
		})
		for _, docID := range docIDs {
			fmt.Printf("  document %q (%s)\n", nameOr(docNames, docID, "DELETED"), docID)
			for _, a := range byDoc[docID] {
				label := a.label
				if label == "" {
					label = "(image)"
				}
				fmt.Printf("    %-5s %s  %s\n", a.kind, a.id, label)
			}
		}
	}
}

// resolveOperationNames batch-loads operation names for the missing set.
func resolveOperationNames(ctx context.Context, db database.Database, missing []attachment) map[uuid.UUID]string {
	ids := uniqueOpIDs(missing)
	out := make(map[uuid.UUID]string, len(ids))
	if len(ids) == 0 {
		return out
	}
	var ops []models.Operation
	if err := db.Collection("operations").Find(ctx, bson.M{"operation_id": bson.M{"$in": ids}}).All(&ops); err != nil {
		log.Printf("warning: resolve operation names: %v", err)
		return out
	}
	for _, op := range ops {
		out[op.OperationID] = op.Name
	}
	return out
}

// resolveDocumentNames batch-loads document titles for the missing set. Reads
// through soft-deletes; a doc absent from the result was hard-deleted (its
// orphaned attachment rows are themselves cleanup candidates).
func resolveDocumentNames(ctx context.Context, db database.Database, missing []attachment) map[uuid.UUID]string {
	ids := uniqueDocIDs(missing)
	out := make(map[uuid.UUID]string, len(ids))
	if len(ids) == 0 {
		return out
	}
	var docs []models.WikiDocument
	if err := db.Collection("wiki_documents").Find(ctx, bson.M{"document_id": bson.M{"$in": ids}}).All(&docs); err != nil {
		log.Printf("warning: resolve document names: %v", err)
		return out
	}
	for _, d := range docs {
		out[d.DocumentID] = d.Title
	}
	return out
}

func uniqueOpIDs(atts []attachment) []uuid.UUID {
	seen := make(map[uuid.UUID]struct{})
	var out []uuid.UUID
	for _, a := range atts {
		if _, ok := seen[a.opID]; !ok {
			seen[a.opID] = struct{}{}
			out = append(out, a.opID)
		}
	}
	return out
}

func uniqueDocIDs(atts []attachment) []uuid.UUID {
	seen := make(map[uuid.UUID]struct{})
	var out []uuid.UUID
	for _, a := range atts {
		if _, ok := seen[a.docID]; !ok {
			seen[a.docID] = struct{}{}
			out = append(out, a.docID)
		}
	}
	return out
}

func nameOr(m map[uuid.UUID]string, id uuid.UUID, fallback string) string {
	if v, ok := m[id]; ok && v != "" {
		return v
	}
	return fallback
}
