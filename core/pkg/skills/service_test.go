package skills

import (
	"archive/zip"
	"bytes"
	"context"
	"errors"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo"
	"go.uber.org/zap"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/blob"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// --- fakes -----------------------------------------------------------------

type fakeRepo struct {
	skills   map[string]*models.Skill
	versions map[uuid.UUID][]models.SkillVersion
	// failCreateVersion makes the version row fail so the rollback path runs.
	failCreateVersion bool
	released          []int
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{skills: map[string]*models.Skill{}, versions: map[uuid.UUID][]models.SkillVersion{}}
}

func (f *fakeRepo) Create(_ context.Context, skill *models.Skill) error {
	if _, ok := f.skills[skill.Name]; ok {
		return errors.New("duplicate key")
	}
	copied := *skill
	f.skills[skill.Name] = &copied
	return nil
}

func (f *fakeRepo) FindByName(_ context.Context, name string) (models.Skill, error) {
	s, ok := f.skills[name]
	if !ok {
		return models.Skill{}, qmgo.ErrNoSuchDocuments
	}
	return *s, nil
}

func (f *fakeRepo) FindByID(_ context.Context, id uuid.UUID) (models.Skill, error) {
	for _, s := range f.skills {
		if s.SkillID == id {
			return *s, nil
		}
	}
	return models.Skill{}, qmgo.ErrNoSuchDocuments
}

func (f *fakeRepo) List(_ context.Context, includeRetired bool) ([]models.Skill, error) {
	var out []models.Skill
	for _, s := range f.skills {
		if s.CurrentVersion < 1 {
			continue
		}
		if !includeRetired && s.IsUnpublished() {
			continue
		}
		out = append(out, *s)
	}
	return out, nil
}

func (f *fakeRepo) ReserveNextVersion(_ context.Context, skillID uuid.UUID) (int, error) {
	for _, s := range f.skills {
		if s.SkillID == skillID {
			s.CurrentVersion++
			return s.CurrentVersion, nil
		}
	}
	return 0, qmgo.ErrNoSuchDocuments
}

func (f *fakeRepo) ReleaseVersion(_ context.Context, skillID uuid.UUID, version int) error {
	for _, s := range f.skills {
		if s.SkillID == skillID && s.CurrentVersion == version {
			s.CurrentVersion--
			f.released = append(f.released, version)
		}
	}
	return nil
}

func (f *fakeRepo) DeleteIfEmpty(_ context.Context, skillID uuid.UUID) error {
	for name, s := range f.skills {
		if s.SkillID == skillID && s.CurrentVersion <= 0 {
			delete(f.skills, name)
		}
	}
	return nil
}

func (f *fakeRepo) FinishPublish(_ context.Context, skillID uuid.UUID, in repository.FinishPublishInput) error {
	for _, s := range f.skills {
		if s.SkillID == skillID {
			s.SizeBytes = in.SizeBytes
			s.UploadedAt = in.UploadedAt
			s.Description = in.Description
			return nil
		}
	}
	return qmgo.ErrNoSuchDocuments
}

func (f *fakeRepo) SetUnpublished(_ context.Context, skillID uuid.UUID, at *time.Time, by *uuid.UUID) error {
	return nil
}

func (f *fakeRepo) Transfer(_ context.Context, skillID uuid.UUID, ownerID uuid.UUID, ownerUsername string) error {
	for _, s := range f.skills {
		if s.SkillID == skillID {
			s.OwnerUserID = ownerID
			s.OwnerUsername = ownerUsername
		}
	}
	return nil
}

func (f *fakeRepo) CreateVersion(_ context.Context, v *models.SkillVersion) error {
	if f.failCreateVersion {
		return errors.New("write failed")
	}
	f.versions[v.SkillID] = append(f.versions[v.SkillID], *v)
	return nil
}

func (f *fakeRepo) FindVersion(_ context.Context, skillID uuid.UUID, version int) (models.SkillVersion, error) {
	for _, v := range f.versions[skillID] {
		if v.Version == version {
			return v, nil
		}
	}
	return models.SkillVersion{}, qmgo.ErrNoSuchDocuments
}

func (f *fakeRepo) ListVersions(_ context.Context, skillID uuid.UUID) ([]models.SkillVersion, error) {
	return f.versions[skillID], nil
}

type fakeStore struct {
	objects map[string][]byte
	deleted []string
	// putErr simulates the object store refusing the write: a missing
	// bucket, a denied key, a full volume.
	putErr error
}

func newFakeStore() *fakeStore { return &fakeStore{objects: map[string][]byte{}} }

func (f *fakeStore) Put(_ context.Context, key string, body io.Reader, _ int64, _ string) error {
	if f.putErr != nil {
		return f.putErr
	}
	raw, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	f.objects[key] = raw
	return nil
}

func (f *fakeStore) Get(_ context.Context, key string) (io.ReadCloser, blob.ObjectInfo, error) {
	raw, ok := f.objects[key]
	if !ok {
		return nil, blob.ObjectInfo{}, errors.New("not found")
	}
	return io.NopCloser(bytes.NewReader(raw)), blob.ObjectInfo{ContentLength: int64(len(raw))}, nil
}

func (f *fakeStore) Head(_ context.Context, key string) (blob.ObjectInfo, error) {
	raw, ok := f.objects[key]
	if !ok {
		return blob.ObjectInfo{}, errors.New("not found")
	}
	return blob.ObjectInfo{ContentLength: int64(len(raw))}, nil
}

func (f *fakeStore) Delete(_ context.Context, key string) error {
	delete(f.objects, key)
	f.deleted = append(f.deleted, key)
	return nil
}

// --- helpers ---------------------------------------------------------------

func zipBytes(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	f, err := w.Create("my-skill/SKILL.md")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.Write([]byte("# a skill\n")); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func newTestService(t *testing.T, repo *fakeRepo, store *fakeStore) *Service {
	t.Helper()
	return NewService(repo, nil, store, 1<<20, zap.NewNop())
}

func publishInput(name string, owner uuid.UUID, ownerName string, raw []byte) PublishInput {
	return PublishInput{
		Name:          name,
		Description:   "sweeps a subnet",
		Bytes:         raw,
		PublisherID:   owner,
		PublisherName: ownerName,
	}
}

// --- tests -----------------------------------------------------------------

func TestPublish_ClaimsAName(t *testing.T) {
	repo, store := newFakeRepo(), newFakeStore()
	svc := newTestService(t, repo, store)
	owner := uuid.New()

	got, err := svc.Publish(context.Background(), publishInput("Recon Sweep", owner, "alice", zipBytes(t)))
	if err != nil {
		t.Fatalf("Publish returned %v", err)
	}
	if !got.Claimed {
		t.Error("first publish should report the name as claimed")
	}
	if got.Skill.Name != "recon-sweep" {
		t.Errorf("name = %q, want %q", got.Skill.Name, "recon-sweep")
	}
	if got.Version.Version != 1 {
		t.Errorf("version = %d, want 1", got.Version.Version)
	}
	if len(store.objects) != 1 {
		t.Errorf("stored %d objects, want 1", len(store.objects))
	}
	if got.Version.Checksum == "" {
		t.Error("the version row should carry a checksum")
	}
}

func TestPublish_SecondVersionKeepsTheFirst(t *testing.T) {
	repo, store := newFakeRepo(), newFakeStore()
	svc := newTestService(t, repo, store)
	owner := uuid.New()
	ctx := context.Background()

	first, err := svc.Publish(ctx, publishInput("recon-sweep", owner, "alice", zipBytes(t)))
	if err != nil {
		t.Fatalf("first publish: %v", err)
	}
	second, err := svc.Publish(ctx, publishInput("recon-sweep", owner, "alice", zipBytes(t)))
	if err != nil {
		t.Fatalf("second publish: %v", err)
	}

	if second.Claimed {
		t.Error("a second publish is not a claim")
	}
	if second.Version.Version != 2 {
		t.Errorf("version = %d, want 2", second.Version.Version)
	}
	if len(store.objects) != 2 {
		t.Errorf("stored %d objects, want both versions kept", len(store.objects))
	}
	// The whole point of retention: version 1 is still fetchable.
	body, _, row, err := svc.Download(ctx, "recon-sweep", 1)
	if err != nil {
		t.Fatalf("downloading version 1: %v", err)
	}
	body.Close()
	if row.Version != 1 || row.ObjectKey != first.Version.ObjectKey {
		t.Errorf("version 1 resolved to %+v, want the original bundle", row)
	}
}

func TestPublish_RefusesANameSomebodyElseOwns(t *testing.T) {
	repo, store := newFakeRepo(), newFakeStore()
	svc := newTestService(t, repo, store)
	ctx := context.Background()

	if _, err := svc.Publish(ctx, publishInput("recon-sweep", uuid.New(), "alice", zipBytes(t))); err != nil {
		t.Fatalf("first publish: %v", err)
	}
	_, err := svc.Publish(ctx, publishInput("recon-sweep", uuid.New(), "bob", zipBytes(t)))
	if err == nil {
		t.Fatal("publishing to somebody else's name should be refused")
	}
	var svcErr *Error
	if !errors.As(err, &svcErr) || !svcErr.IsPolicy() {
		t.Fatalf("want a policy error, got %#v", err)
	}
	if !bytes.Contains([]byte(svcErr.Message), []byte("alice")) {
		t.Errorf("the refusal should name the owner, got %q", svcErr.Message)
	}
}

func TestPublish_AdminMayPublishToAnyName(t *testing.T) {
	repo, store := newFakeRepo(), newFakeStore()
	svc := newTestService(t, repo, store)
	ctx := context.Background()

	if _, err := svc.Publish(ctx, publishInput("recon-sweep", uuid.New(), "alice", zipBytes(t))); err != nil {
		t.Fatalf("first publish: %v", err)
	}
	in := publishInput("recon-sweep", uuid.New(), "root", zipBytes(t))
	in.IsAdmin = true
	if _, err := svc.Publish(ctx, in); err != nil {
		t.Fatalf("an admin publish should be allowed, got %v", err)
	}
}

func TestPublish_RejectsBundlesThatAreNotZips(t *testing.T) {
	repo, store := newFakeRepo(), newFakeStore()
	svc := newTestService(t, repo, store)

	_, err := svc.Publish(context.Background(), publishInput("recon-sweep", uuid.New(), "alice", []byte("#!/bin/sh\necho hi\n")))
	if err == nil {
		t.Fatal("a non-zip upload should be refused")
	}
	var svcErr *Error
	if !errors.As(err, &svcErr) || !svcErr.IsPolicy() {
		t.Fatalf("want a policy error, got %#v", err)
	}
	if len(repo.skills) != 0 {
		t.Error("a rejected upload must not claim the name")
	}
}

func TestPublish_RejectsAnEmptyUpload(t *testing.T) {
	svc := newTestService(t, newFakeRepo(), newFakeStore())
	if _, err := svc.Publish(context.Background(), publishInput("recon-sweep", uuid.New(), "alice", nil)); err == nil {
		t.Fatal("an empty upload should be refused")
	}
}

func TestPublish_EnforcesTheSizeCap(t *testing.T) {
	repo, store := newFakeRepo(), newFakeStore()
	svc := NewService(repo, nil, store, 10, zap.NewNop())

	_, err := svc.Publish(context.Background(), publishInput("recon-sweep", uuid.New(), "alice", zipBytes(t)))
	var svcErr *Error
	if !errors.As(err, &svcErr) || svcErr.Status != 413 {
		t.Fatalf("want a 413, got %#v", err)
	}
}

func TestPublish_RollsBackWhenTheVersionRowFails(t *testing.T) {
	repo, store := newFakeRepo(), newFakeStore()
	repo.failCreateVersion = true
	svc := newTestService(t, repo, store)

	if _, err := svc.Publish(context.Background(), publishInput("recon-sweep", uuid.New(), "alice", zipBytes(t))); err == nil {
		t.Fatal("the publish should have failed")
	}
	if len(store.objects) != 0 {
		t.Errorf("the stored bundle should have been deleted, %d left", len(store.objects))
	}
	if len(store.deleted) != 1 {
		t.Errorf("expected exactly one rollback delete, got %d", len(store.deleted))
	}
	if len(repo.released) != 1 {
		t.Errorf("expected the version number to be released once, got %d", len(repo.released))
	}
	// The name went with it: this call claimed it, and nothing was published.
	if _, ok := repo.skills["recon-sweep"]; ok {
		t.Error("a failed first upload must not leave the name claimed")
	}
}

func TestDownload_DefaultsToTheCurrentVersion(t *testing.T) {
	repo, store := newFakeRepo(), newFakeStore()
	svc := newTestService(t, repo, store)
	ctx := context.Background()
	owner := uuid.New()

	for i := 0; i < 3; i++ {
		if _, err := svc.Publish(ctx, publishInput("recon-sweep", owner, "alice", zipBytes(t))); err != nil {
			t.Fatalf("publish %d: %v", i, err)
		}
	}
	body, _, row, err := svc.Download(ctx, "Recon Sweep", 0)
	if err != nil {
		t.Fatalf("Download returned %v", err)
	}
	defer body.Close()
	if row.Version != 3 {
		t.Errorf("version = %d, want the current 3", row.Version)
	}
}

func TestDownload_UnknownNameAndVersion(t *testing.T) {
	repo, store := newFakeRepo(), newFakeStore()
	svc := newTestService(t, repo, store)
	ctx := context.Background()

	if _, _, _, err := svc.Download(ctx, "nothing-here", 0); err == nil {
		t.Error("an unknown name should be a not-found")
	}
	if _, err := svc.Publish(ctx, publishInput("recon-sweep", uuid.New(), "alice", zipBytes(t))); err != nil {
		t.Fatal(err)
	}
	_, _, _, err := svc.Download(ctx, "recon-sweep", 9)
	var svcErr *Error
	if !errors.As(err, &svcErr) || svcErr.Status != 404 {
		t.Fatalf("want a 404 for a missing version, got %#v", err)
	}
}

func TestFilename(t *testing.T) {
	if got := Filename("recon-sweep", 3); got != "recon-sweep-skill-v3.zip" {
		t.Fatalf("Filename = %q", got)
	}
}

// A publish that omits the description is a new bundle, not a request to
// blank the listing text. Publishing a version with `curl -F name -F file` is
// the common case and must not silently erase it.
func TestPublish_KeepsTheDescriptionWhenANewVersionOmitsIt(t *testing.T) {
	repo, store := newFakeRepo(), newFakeStore()
	svc := newTestService(t, repo, store)
	ctx := context.Background()
	owner := uuid.New()

	if _, err := svc.Publish(ctx, publishInput("recon-sweep", owner, "alice", zipBytes(t))); err != nil {
		t.Fatalf("first publish: %v", err)
	}

	bare := publishInput("recon-sweep", owner, "alice", zipBytes(t))
	bare.Description = ""
	got, err := svc.Publish(ctx, bare)
	if err != nil {
		t.Fatalf("second publish: %v", err)
	}
	if got.Skill.Description != "sweeps a subnet" {
		t.Fatalf("description = %q, want the original to survive", got.Skill.Description)
	}
	if stored := repo.skills["recon-sweep"].Description; stored != "sweeps a subnet" {
		t.Fatalf("stored description = %q, want the original to survive", stored)
	}
}

// Supplying one still replaces it, which is how an author corrects the text.
func TestPublish_ReplacesTheDescriptionWhenOneIsGiven(t *testing.T) {
	repo, store := newFakeRepo(), newFakeStore()
	svc := newTestService(t, repo, store)
	ctx := context.Background()
	owner := uuid.New()

	if _, err := svc.Publish(ctx, publishInput("recon-sweep", owner, "alice", zipBytes(t))); err != nil {
		t.Fatalf("first publish: %v", err)
	}
	updated := publishInput("recon-sweep", owner, "alice", zipBytes(t))
	updated.Description = "now also checks LDAP signing"
	got, err := svc.Publish(ctx, updated)
	if err != nil {
		t.Fatalf("second publish: %v", err)
	}
	if got.Skill.Description != "now also checks LDAP signing" {
		t.Fatalf("description = %q, want the new text", got.Skill.Description)
	}
}

// --- a failing object store -------------------------------------------------
//
// Reported from production: the object store rejected every write, and each
// attempt left the name claimed on an empty listing row. The publisher's
// obvious next move, retrying under a different name, parked another. Three
// names were consumed without a single byte being stored.

func TestPublish_AFailedFirstUploadLeavesNoNameBehind(t *testing.T) {
	repo, store := newFakeRepo(), newFakeStore()
	store.putErr = errors.New("Access Denied")
	svc := newTestService(t, repo, store)

	_, err := svc.Publish(context.Background(), publishInput("public-recon", uuid.New(), "alice", zipBytes(t)))
	if err == nil {
		t.Fatal("the publish should have failed")
	}
	if len(repo.skills) != 0 {
		t.Fatalf("a failed first upload must not claim the name, found %d rows", len(repo.skills))
	}
}

func TestPublish_ReportsWhyTheStoreRefused(t *testing.T) {
	repo, store := newFakeRepo(), newFakeStore()
	store.putErr = errors.New("Access Denied")
	svc := newTestService(t, repo, store)

	_, err := svc.Publish(context.Background(), publishInput("public-recon", uuid.New(), "alice", zipBytes(t)))
	var svcErr *Error
	if !errors.As(err, &svcErr) {
		t.Fatalf("want a service error, got %#v", err)
	}
	if svcErr.Status != 500 {
		t.Errorf("status = %d, want 500: a store failure is a fault, not a refusal", svcErr.Status)
	}
	// The operator reading this is the one who has to tell a missing bucket
	// from a denied write.
	if !strings.Contains(svcErr.Message, "Access Denied") {
		t.Fatalf("the message should carry the store's own words, got %q", svcErr.Message)
	}
}

// A retry after the store recovers takes the name normally.
func TestPublish_SucceedsOnRetryAfterTheStoreRecovers(t *testing.T) {
	repo, store := newFakeRepo(), newFakeStore()
	store.putErr = errors.New("Access Denied")
	svc := newTestService(t, repo, store)
	ctx := context.Background()
	owner := uuid.New()

	if _, err := svc.Publish(ctx, publishInput("public-recon", owner, "alice", zipBytes(t))); err == nil {
		t.Fatal("the first publish should have failed")
	}
	store.putErr = nil
	got, err := svc.Publish(ctx, publishInput("public-recon", owner, "alice", zipBytes(t)))
	if err != nil {
		t.Fatalf("the retry should succeed, got %v", err)
	}
	if got.Version.Version != 1 || !got.Claimed {
		t.Fatalf("the retry should claim the name at version 1, got %+v", got)
	}
}

// A second version failing must NOT delete a name that already has one.
func TestPublish_AFailedSecondVersionKeepsTheSkill(t *testing.T) {
	repo, store := newFakeRepo(), newFakeStore()
	svc := newTestService(t, repo, store)
	ctx := context.Background()
	owner := uuid.New()

	if _, err := svc.Publish(ctx, publishInput("recon-sweep", owner, "alice", zipBytes(t))); err != nil {
		t.Fatalf("first publish: %v", err)
	}
	store.putErr = errors.New("Access Denied")
	if _, err := svc.Publish(ctx, publishInput("recon-sweep", owner, "alice", zipBytes(t))); err == nil {
		t.Fatal("the second publish should have failed")
	}

	skill, ok := repo.skills["recon-sweep"]
	if !ok {
		t.Fatal("a failed second version must not delete the skill")
	}
	if skill.CurrentVersion != 1 {
		t.Fatalf("current version = %d, want the successful 1", skill.CurrentVersion)
	}
	// And version 1 still downloads.
	store.putErr = nil
	if _, _, _, err := svc.Download(ctx, "recon-sweep", 0); err != nil {
		t.Fatalf("version 1 should still be downloadable, got %v", err)
	}
}

// --- names parked by the bug above ------------------------------------------
//
// Rows already in production have no versions. They must not look like
// skills, and they must not hold their names hostage.

func TestEmptyClaimsAreInvisibleAndReclaimable(t *testing.T) {
	repo, store := newFakeRepo(), newFakeStore()
	svc := newTestService(t, repo, store)
	ctx := context.Background()

	stranded := uuid.New()
	repo.skills["public-recon"] = &models.Skill{
		SkillID: uuid.New(), Name: "public-recon", CurrentVersion: 0,
		OwnerUserID: stranded, OwnerUsername: "alice",
	}

	listed, err := svc.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(listed) != 0 {
		t.Errorf("a name with no versions is not a skill; listed %d", len(listed))
	}

	_, err = svc.Lookup(ctx, "public-recon")
	var svcErr *Error
	if !errors.As(err, &svcErr) || svcErr.Status != 404 {
		t.Fatalf("want a 404 for an empty claim, got %#v", err)
	}
	if strings.Contains(svcErr.Message, "version 0") {
		t.Errorf("the message should not talk about version 0, got %q", svcErr.Message)
	}

	// Anyone may take it, including somebody other than whoever parked it.
	got, err := svc.Publish(ctx, publishInput("public-recon", uuid.New(), "bob", zipBytes(t)))
	if err != nil {
		t.Fatalf("an empty claim should be re-claimable, got %v", err)
	}
	if got.Skill.OwnerUsername != "bob" || got.Version.Version != 1 {
		t.Fatalf("the name should pass to the first successful publisher, got %+v", got.Skill)
	}
}

func TestDownload_SaysNothingHasBeenPublishedYet(t *testing.T) {
	repo, store := newFakeRepo(), newFakeStore()
	svc := newTestService(t, repo, store)
	repo.skills["public-recon"] = &models.Skill{
		SkillID: uuid.New(), Name: "public-recon", CurrentVersion: 0,
		OwnerUserID: uuid.New(), OwnerUsername: "alice",
	}

	_, _, _, err := svc.Download(context.Background(), "public-recon", 0)
	var svcErr *Error
	if !errors.As(err, &svcErr) || svcErr.Status != 404 {
		t.Fatalf("want a 404, got %#v", err)
	}
	if strings.Contains(svcErr.Message, "version 0") {
		t.Fatalf("want a message that explains the state, got %q", svcErr.Message)
	}
}
