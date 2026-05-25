package resolver

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo/field"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// --- Fakes ---

type fakeAPIKeyRepo struct {
	byKeyID  map[string]models.APIKey
	byUserID map[uuid.UUID]models.APIKey
}

func newFakeAPIKeyRepo() *fakeAPIKeyRepo {
	return &fakeAPIKeyRepo{
		byKeyID:  map[string]models.APIKey{},
		byUserID: map[uuid.UUID]models.APIKey{},
	}
}

func (f *fakeAPIKeyRepo) put(k models.APIKey) {
	f.byKeyID[k.KeyID] = k
	f.byUserID[k.UserID] = k
}

func (f *fakeAPIKeyRepo) FindByKeyID(_ context.Context, keyID string) (models.APIKey, error) {
	k, ok := f.byKeyID[keyID]
	if !ok {
		return models.APIKey{}, errors.New("not found")
	}
	return k, nil
}
func (f *fakeAPIKeyRepo) FindByUserID(_ context.Context, userID uuid.UUID) (models.APIKey, error) {
	k, ok := f.byUserID[userID]
	if !ok {
		return models.APIKey{}, errors.New("not found")
	}
	return k, nil
}
func (f *fakeAPIKeyRepo) Create(_ context.Context, k *models.APIKey) error {
	// Simulate qmgo populating timestamps + _id.
	k.DefaultField = field.DefaultField{}
	k.CreateAt = time.Now().UTC()
	k.UpdateAt = k.CreateAt
	f.put(*k)
	return nil
}
func (f *fakeAPIKeyRepo) UpdateSecret(_ context.Context, userID uuid.UUID, keyID, secretHash string, version int) error {
	k := f.byUserID[userID]
	delete(f.byKeyID, k.KeyID)
	k.KeyID = keyID
	k.SecretHash = secretHash
	k.Version = version
	k.Enabled = true
	k.LastUsedAt = nil
	k.UpdateAt = time.Now().UTC()
	f.put(k)
	return nil
}
func (f *fakeAPIKeyRepo) SetEnabled(_ context.Context, userID uuid.UUID, enabled bool) error {
	k := f.byUserID[userID]
	k.Enabled = enabled
	f.put(k)
	return nil
}
func (f *fakeAPIKeyRepo) DeleteByUserID(_ context.Context, userID uuid.UUID) error {
	k := f.byUserID[userID]
	delete(f.byKeyID, k.KeyID)
	delete(f.byUserID, userID)
	return nil
}
func (f *fakeAPIKeyRepo) TouchLastUsed(_ context.Context, _ string, _ time.Time) error {
	return nil
}

var _ repository.IAPIKeyRepository = (*fakeAPIKeyRepo)(nil)

func authCtx(uid uuid.UUID) context.Context {
	return gqlctx.WithAuthInfo(context.Background(), gqlctx.AuthInfo{
		UserID:   uid.String(),
		Username: "alice",
		Roles:    []string{"user"},
	})
}

// --- Tests ---

func TestCreateMyAPIKey_FirstTime(t *testing.T) {
	uid := uuid.New()
	repo := newFakeAPIKeyRepo()
	r := NewAPIKeyResolver(repo)

	got, err := r.CreateMyAPIKey(authCtx(uid))
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if got.Token == "" {
		t.Fatalf("expected token to be returned")
	}
	// Token must round-trip — proves the resolver kept the same key_id we
	// returned and that the persisted hash is the right one.
	keyID, hash, ok := auth.ParseAPIKey(got.Token)
	if !ok {
		t.Fatalf("returned token does not parse: %q", got.Token)
	}
	stored, err := repo.FindByKeyID(context.Background(), keyID)
	if err != nil {
		t.Fatalf("stored key not found: %v", err)
	}
	if stored.SecretHash != hash {
		t.Fatalf("stored hash mismatch")
	}
	if !stored.Enabled || stored.Version != 1 {
		t.Fatalf("unexpected initial state: %+v", stored)
	}
}

func TestCreateMyAPIKey_AlreadyExists(t *testing.T) {
	uid := uuid.New()
	repo := newFakeAPIKeyRepo()
	repo.put(models.APIKey{KeyID: "existing", UserID: uid, Enabled: true})

	r := NewAPIKeyResolver(repo)
	_, err := r.CreateMyAPIKey(authCtx(uid))
	if !errors.Is(err, ErrAPIKeyAlreadyExists) {
		t.Fatalf("expected ErrAPIKeyAlreadyExists, got %v", err)
	}
}

func TestRegenerateMyAPIKey_BumpsVersionAndInvalidatesOld(t *testing.T) {
	uid := uuid.New()
	repo := newFakeAPIKeyRepo()
	oldHash := auth.HashToken("old-secret")
	repo.put(models.APIKey{
		KeyID: "oldkeyid", UserID: uid, SecretHash: oldHash, Enabled: true, Version: 1,
	})

	r := NewAPIKeyResolver(repo)
	got, err := r.RegenerateMyAPIKey(authCtx(uid))
	if err != nil {
		t.Fatalf("regenerate: %v", err)
	}

	// Old key id should be gone — a script using a token with that prefix
	// will now 401 in the middleware.
	if _, err := repo.FindByKeyID(context.Background(), "oldkeyid"); err == nil {
		t.Fatalf("old key_id still resolvable after regenerate")
	}

	// New token round-trips; version bumped.
	newKeyID, _, ok := auth.ParseAPIKey(got.Token)
	if !ok {
		t.Fatalf("new token does not parse")
	}
	stored, _ := repo.FindByKeyID(context.Background(), newKeyID)
	if stored.Version != 2 {
		t.Fatalf("expected version 2 after regenerate, got %d", stored.Version)
	}
	if !stored.Enabled {
		t.Fatalf("regenerate must leave key enabled")
	}
}

func TestRegenerateMyAPIKey_FallsBackToCreateWhenNoExistingKey(t *testing.T) {
	uid := uuid.New()
	repo := newFakeAPIKeyRepo()
	r := NewAPIKeyResolver(repo)

	// User has no key yet. Regenerate should still produce one — saves the
	// frontend from branching on a "no key" state.
	got, err := r.RegenerateMyAPIKey(authCtx(uid))
	if err != nil {
		t.Fatalf("regenerate (no existing): %v", err)
	}
	if got.Token == "" {
		t.Fatalf("expected token")
	}
	if _, err := repo.FindByUserID(context.Background(), uid); err != nil {
		t.Fatalf("expected key to be created: %v", err)
	}
}

func TestSetMyAPIKeyEnabled(t *testing.T) {
	uid := uuid.New()
	repo := newFakeAPIKeyRepo()
	repo.put(models.APIKey{KeyID: "k", UserID: uid, Enabled: true})

	r := NewAPIKeyResolver(repo)

	if _, err := r.SetMyAPIKeyEnabled(authCtx(uid), false); err != nil {
		t.Fatalf("disable: %v", err)
	}
	k, _ := repo.FindByUserID(context.Background(), uid)
	if k.Enabled {
		t.Fatalf("expected enabled=false after disable")
	}

	if _, err := r.SetMyAPIKeyEnabled(authCtx(uid), true); err != nil {
		t.Fatalf("re-enable: %v", err)
	}
	k, _ = repo.FindByUserID(context.Background(), uid)
	if !k.Enabled {
		t.Fatalf("expected enabled=true after re-enable")
	}
}

func TestDeleteMyAPIKey(t *testing.T) {
	uid := uuid.New()
	repo := newFakeAPIKeyRepo()
	repo.put(models.APIKey{KeyID: "k", UserID: uid, Enabled: true})

	r := NewAPIKeyResolver(repo)
	ok, err := r.DeleteMyAPIKey(authCtx(uid))
	if err != nil || !ok {
		t.Fatalf("delete: ok=%v err=%v", ok, err)
	}
	if _, err := repo.FindByUserID(context.Background(), uid); err == nil {
		t.Fatalf("expected key to be removed")
	}
}

func TestMyAPIKey_NilWhenAbsent(t *testing.T) {
	repo := newFakeAPIKeyRepo()
	r := NewAPIKeyResolver(repo)

	got, err := r.MyAPIKey(authCtx(uuid.New()))
	if err != nil {
		t.Fatalf("myAPIKey: %v", err)
	}
	if got != nil {
		t.Fatalf("expected nil when no key exists, got %+v", got)
	}
}

func TestCallerUserID_RejectsMissingAuth(t *testing.T) {
	repo := newFakeAPIKeyRepo()
	r := NewAPIKeyResolver(repo)

	// No AuthInfo on the context — should refuse rather than write a
	// "" UserID into Mongo.
	_, err := r.CreateMyAPIKey(context.Background())
	if err == nil {
		t.Fatalf("expected error without auth context")
	}
}
