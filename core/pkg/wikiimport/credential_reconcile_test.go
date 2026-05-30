package wikiimport

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// fakeCredRepo is a stub for repository.ICredentialRepository sufficient
// for reconciler tests. Only Create + FindByID are exercised; the other
// methods panic so any future code that accidentally couples to them
// surfaces immediately rather than silently no-oping.
type fakeCredRepo struct {
	byID    map[uuid.UUID]models.Credential
	created []models.Credential
}

func newFakeCredRepo() *fakeCredRepo {
	return &fakeCredRepo{byID: map[uuid.UUID]models.Credential{}}
}

func (f *fakeCredRepo) Create(_ context.Context, c *models.Credential) error {
	f.byID[c.CredentialID] = *c
	f.created = append(f.created, *c)
	return nil
}

func (f *fakeCredRepo) FindByID(_ context.Context, id uuid.UUID) (models.Credential, error) {
	if c, ok := f.byID[id]; ok {
		return c, nil
	}
	return models.Credential{}, errors.New("not found")
}

// --- the rest of ICredentialRepository (unused in these tests) ---

func (f *fakeCredRepo) FindByOperationIDWithCursor(context.Context, uuid.UUID, repository.CredentialFilter, *pagination.Cursor, int64, bool) ([]models.Credential, error) {
	panic("unused")
}
func (f *fakeCredRepo) CountByOperationID(context.Context, uuid.UUID, repository.CredentialFilter) (int64, error) {
	panic("unused")
}
func (f *fakeCredRepo) DistinctTagsByOperationID(context.Context, uuid.UUID) ([]string, error) {
	panic("unused")
}
func (f *fakeCredRepo) FindByOperationIDsWithCursor(context.Context, []uuid.UUID, repository.CredentialFilter, *pagination.Cursor, int64, bool) ([]models.Credential, error) {
	panic("unused")
}
func (f *fakeCredRepo) CountByOperationIDs(context.Context, []uuid.UUID, repository.CredentialFilter) (int64, error) {
	panic("unused")
}
func (f *fakeCredRepo) DistinctTagsByOperationIDs(context.Context, []uuid.UUID) ([]string, error) {
	panic("unused")
}
func (f *fakeCredRepo) Update(context.Context, *models.Credential, map[string]interface{}) error {
	panic("unused")
}
func (f *fakeCredRepo) Delete(context.Context, *models.Credential) error    { panic("unused") }
func (f *fakeCredRepo) DeleteByOperationID(context.Context, uuid.UUID) error { panic("unused") }
func (f *fakeCredRepo) AddComment(context.Context, uuid.UUID, models.CredentialComment) error {
	panic("unused")
}
func (f *fakeCredRepo) UpdateComment(context.Context, uuid.UUID, uuid.UUID, string, time.Time) error {
	panic("unused")
}
func (f *fakeCredRepo) RemoveComment(context.Context, uuid.UUID, uuid.UUID) error { panic("unused") }

// --- tests ---

func fenceOf(payload string) string {
	return "```" + credentialFenceInfo + "\n" + payload + "\n```"
}

func TestReconciler_ReusesExistingSameOpCredential(t *testing.T) {
	opID := uuid.New()
	credID := uuid.New()
	repo := newFakeCredRepo()
	repo.byID[credID] = models.Credential{CredentialID: credID, OperationID: opID, Name: "existing"}

	body := "para\n\n" + fenceOf(`{
  "id": "`+credID.String()+`",
  "name": "ignored-on-reuse"
}`)
	rec := NewCredentialReconciler(repo, opID)
	out, res := rec.ReconcileBody(context.Background(), body, uuid.New())
	if res.Reused != 1 || res.Created != 0 {
		t.Fatalf("expected Reused=1 Created=0, got %+v", res)
	}
	if len(repo.created) != 0 {
		t.Fatalf("reuse path must not Create; got %d", len(repo.created))
	}
	if !strings.Contains(out, credID.String()) {
		t.Fatalf("rewritten body lost reused id: %q", out)
	}
}

func TestReconciler_CreatesWhenIDExistsInDifferentOperation(t *testing.T) {
	docOp := uuid.New()
	otherOp := uuid.New()
	credID := uuid.New()
	repo := newFakeCredRepo()
	repo.byID[credID] = models.Credential{
		CredentialID: credID,
		OperationID:  otherOp,
		Name:         "other-op-cred",
	}

	body := fenceOf(`{
  "id": "` + credID.String() + `",
  "name": "imported",
  "type": "PASSWORD",
  "username": "u",
  "password": "p",
  "isValid": true,
  "tags": ["t1"]
}`)
	rec := NewCredentialReconciler(repo, docOp)
	out, res := rec.ReconcileBody(context.Background(), body, uuid.New())
	if res.Created != 1 || res.Reused != 0 {
		t.Fatalf("expected Created=1 Reused=0, got %+v", res)
	}
	if len(repo.created) != 1 {
		t.Fatalf("expected one fresh credential, got %d", len(repo.created))
	}
	got := repo.created[0]
	if got.OperationID != docOp {
		t.Fatalf("created cred has wrong op: %s vs %s", got.OperationID, docOp)
	}
	if got.CredentialID == credID {
		t.Fatalf("created cred reused cross-op id (must be fresh)")
	}
	if got.Name != "imported" || got.Type != models.CredentialTypePassword ||
		got.Username != "u" || got.Password != "p" || !got.IsValid {
		t.Fatalf("created cred missing payload fields: %+v", got)
	}
	if len(got.Tags) != 1 || got.Tags[0] != "t1" {
		t.Fatalf("tags lost: %+v", got.Tags)
	}
	if strings.Contains(out, credID.String()) {
		t.Fatalf("rewritten body still carries cross-op id: %q", out)
	}
	if !strings.Contains(out, got.CredentialID.String()) {
		t.Fatalf("rewritten body missing new id: %q", out)
	}
}

func TestReconciler_CreatesWhenIDMissingAnywhere(t *testing.T) {
	opID := uuid.New()
	missing := uuid.New()
	repo := newFakeCredRepo()
	body := fenceOf(`{
  "id": "` + missing.String() + `",
  "name": "fresh"
}`)
	rec := NewCredentialReconciler(repo, opID)
	out, res := rec.ReconcileBody(context.Background(), body, uuid.New())
	if res.Created != 1 {
		t.Fatalf("expected Created=1, got %+v", res)
	}
	if repo.created[0].Name != "fresh" {
		t.Fatalf("name not carried into created credential: %+v", repo.created[0])
	}
	if strings.Contains(out, missing.String()) {
		t.Fatalf("original id should be rewritten: %q", out)
	}
}

func TestReconciler_TombstonesPassThrough(t *testing.T) {
	opID := uuid.New()
	credID := uuid.New()
	repo := newFakeCredRepo()
	body := fenceOf(`{
  "id": "` + credID.String() + `",
  "deleted": true
}`)
	rec := NewCredentialReconciler(repo, opID)
	_, res := rec.ReconcileBody(context.Background(), body, uuid.New())
	if res.Tombstoned != 1 || res.Created != 0 || res.Reused != 0 {
		t.Fatalf("expected tombstone-only result, got %+v", res)
	}
	if len(repo.created) != 0 {
		t.Fatalf("tombstone must not create a credential, got %d", len(repo.created))
	}
}

func TestReconciler_RepeatedIDProcessedOnce(t *testing.T) {
	opID := uuid.New()
	credID := uuid.New()
	repo := newFakeCredRepo()
	repo.byID[credID] = models.Credential{CredentialID: credID, OperationID: opID}
	idStr := credID.String()
	body := fenceOf(`{"id":"`+idStr+`"}`) + "\n\npara\n\n" + fenceOf(`{"id":"`+idStr+`"}`)

	rec := NewCredentialReconciler(repo, opID)
	_, res := rec.ReconcileBody(context.Background(), body, uuid.New())
	if res.Reused != 1 {
		t.Fatalf("expected Reused=1 for unique id, got %+v", res)
	}
}

func TestStripFences_RemovesAllCredentialBlocks(t *testing.T) {
	body := "leading\n\n" + fenceOf(`{"id":"x"}`) + "\n\nmiddle\n\n" + fenceOf(`{"id":"y"}`) + "\n\ntrailing"
	out := StripFences(body)
	if strings.Contains(out, credentialFenceInfo) {
		t.Fatalf("StripFences left a fence behind: %q", out)
	}
	if !strings.Contains(out, "leading") || !strings.Contains(out, "middle") || !strings.Contains(out, "trailing") {
		t.Fatalf("StripFences removed surrounding paragraphs: %q", out)
	}
}

func TestRewriteFenceIDs_OnlyTouchesMappedIDs(t *testing.T) {
	mapped := uuid.New()
	unmapped := uuid.New()
	final := uuid.New()
	body := fenceOf(`{"id":"`+mapped.String()+`","name":"a"}`) + "\n\n" +
		fenceOf(`{"id":"`+unmapped.String()+`","name":"b"}`)

	out := RewriteFenceIDs(body, map[string]string{
		mapped.String(): final.String(),
	})
	if !strings.Contains(out, final.String()) {
		t.Fatalf("mapped id was not rewritten: %q", out)
	}
	if strings.Contains(out, mapped.String()) {
		t.Fatalf("original mapped id still present: %q", out)
	}
	if !strings.Contains(out, unmapped.String()) {
		t.Fatalf("unmapped id should be untouched: %q", out)
	}
}
