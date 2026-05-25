package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// --- Fakes ---

type fakeAPIKeyRepo struct {
	byKeyID  map[string]models.APIKey
	byUserID map[uuid.UUID]models.APIKey
	touches  int
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
		return models.APIKey{}, errNotFound
	}
	return k, nil
}

func (f *fakeAPIKeyRepo) FindByUserID(_ context.Context, userID uuid.UUID) (models.APIKey, error) {
	k, ok := f.byUserID[userID]
	if !ok {
		return models.APIKey{}, errNotFound
	}
	return k, nil
}

func (f *fakeAPIKeyRepo) Create(_ context.Context, k *models.APIKey) error {
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

func (f *fakeAPIKeyRepo) TouchLastUsed(_ context.Context, keyID string, at time.Time) error {
	f.touches++
	k := f.byKeyID[keyID]
	t := at
	k.LastUsedAt = &t
	f.byKeyID[keyID] = k
	f.byUserID[k.UserID] = k
	return nil
}

type fakeUserRepo struct {
	users map[uuid.UUID]models.User
}

func newFakeUserRepo() *fakeUserRepo {
	return &fakeUserRepo{users: map[uuid.UUID]models.User{}}
}

func (f *fakeUserRepo) put(u models.User) {
	f.users[u.UserID] = u
}

func (f *fakeUserRepo) ExistsByUsername(_ context.Context, _ string) (bool, error) {
	return false, nil
}
func (f *fakeUserRepo) FindByUsername(_ context.Context, _ string) (models.User, error) {
	return models.User{}, errNotFound
}
func (f *fakeUserRepo) Create(_ context.Context, _ *models.User) error { return nil }
func (f *fakeUserRepo) Count(_ context.Context, _ string) (int64, error) {
	return int64(len(f.users)), nil
}
func (f *fakeUserRepo) FindAll(_ context.Context, _ string, _ int64, _ int64) ([]models.User, error) {
	return nil, nil
}
func (f *fakeUserRepo) FindWithCursor(_ context.Context, _ string, _ *pagination.Cursor, _ int64, _ bool) ([]models.User, error) {
	return nil, nil
}
func (f *fakeUserRepo) FindByID(_ context.Context, id uuid.UUID) (models.User, error) {
	u, ok := f.users[id]
	if !ok {
		return models.User{}, errNotFound
	}
	return u, nil
}
func (f *fakeUserRepo) FindSuggestions(_ context.Context, _ string, _ int64) ([]models.User, error) {
	return nil, nil
}
func (f *fakeUserRepo) Update(_ context.Context, _ *models.User, _ map[string]interface{}) error {
	return nil
}
func (f *fakeUserRepo) Delete(_ context.Context, _ *models.User) error { return nil }

var errNotFound = stringError("not found")

type stringError string

func (s stringError) Error() string { return string(s) }

// Compile-time check that fakeUserRepo satisfies the interface — keeps the
// test honest if the interface grows.
var _ repository.IUserRepository = (*fakeUserRepo)(nil)
var _ repository.IAPIKeyRepository = (*fakeAPIKeyRepo)(nil)

// --- Tests ---

func TestAuthN_APIKey_Success(t *testing.T) {
	gin.SetMode(gin.TestMode)

	uid := uuid.New()
	raw, keyID, hash, err := auth.GenerateAPIKey()
	if err != nil {
		t.Fatalf("gen: %v", err)
	}
	apiRepo := newFakeAPIKeyRepo()
	apiRepo.put(models.APIKey{
		KeyID: keyID, UserID: uid, SecretHash: hash, Enabled: true, Version: 1,
	})
	userRepo := newFakeUserRepo()
	userRepo.put(models.User{UserID: uid, Username: "alice", Roles: []string{"user"}, Active: true})

	r := gin.New()
	r.Use(AuthN(stubJWTProvider{}, apiRepo, userRepo, nil))
	r.GET("/x", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"uid":    c.GetString("userID"),
			"user":   c.GetString("username"),
			"apiKey": c.GetBool(APIKeyAuthFlag),
		})
	})

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Bearer "+raw)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", w.Code, w.Body.String())
	}
	body := w.Body.String()
	if !strings.Contains(body, uid.String()) {
		t.Fatalf("expected body to carry user id, got %s", body)
	}
	if !strings.Contains(body, `"apiKey":true`) {
		t.Fatalf("expected APIKeyAuthFlag set, got %s", body)
	}
}

func TestAuthN_APIKey_Disabled(t *testing.T) {
	gin.SetMode(gin.TestMode)

	uid := uuid.New()
	raw, keyID, hash, _ := auth.GenerateAPIKey()
	apiRepo := newFakeAPIKeyRepo()
	apiRepo.put(models.APIKey{
		KeyID: keyID, UserID: uid, SecretHash: hash, Enabled: false, // disabled
	})
	userRepo := newFakeUserRepo()
	userRepo.put(models.User{UserID: uid, Active: true, Roles: []string{"user"}})

	r := gin.New()
	r.Use(AuthN(stubJWTProvider{}, apiRepo, userRepo, nil))
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Bearer "+raw)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for disabled key, got %d", w.Code)
	}
}

func TestAuthN_APIKey_InactiveUser(t *testing.T) {
	gin.SetMode(gin.TestMode)

	uid := uuid.New()
	raw, keyID, hash, _ := auth.GenerateAPIKey()
	apiRepo := newFakeAPIKeyRepo()
	apiRepo.put(models.APIKey{
		KeyID: keyID, UserID: uid, SecretHash: hash, Enabled: true,
	})
	userRepo := newFakeUserRepo()
	userRepo.put(models.User{UserID: uid, Active: false, Roles: []string{"user"}})

	r := gin.New()
	r.Use(AuthN(stubJWTProvider{}, apiRepo, userRepo, nil))
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Bearer "+raw)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for inactive user, got %d", w.Code)
	}
}

func TestAuthN_APIKey_WrongSecret(t *testing.T) {
	gin.SetMode(gin.TestMode)

	uid := uuid.New()
	// Mint a key, then replace its hash so the secret no longer matches.
	raw, keyID, _, _ := auth.GenerateAPIKey()
	apiRepo := newFakeAPIKeyRepo()
	apiRepo.put(models.APIKey{
		KeyID: keyID, UserID: uid, SecretHash: auth.HashToken("different-secret"), Enabled: true,
	})
	userRepo := newFakeUserRepo()
	userRepo.put(models.User{UserID: uid, Active: true, Roles: []string{"user"}})

	r := gin.New()
	r.Use(AuthN(stubJWTProvider{}, apiRepo, userRepo, nil))
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Bearer "+raw)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for wrong secret, got %d", w.Code)
	}
}

func TestAuthN_APIKey_UnknownKeyID(t *testing.T) {
	gin.SetMode(gin.TestMode)

	raw, _, _, _ := auth.GenerateAPIKey()
	apiRepo := newFakeAPIKeyRepo() // empty
	userRepo := newFakeUserRepo()

	r := gin.New()
	r.Use(AuthN(stubJWTProvider{}, apiRepo, userRepo, nil))
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Bearer "+raw)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unknown key, got %d", w.Code)
	}
}

func TestAuthN_APIKey_NoFallbackToJWT(t *testing.T) {
	gin.SetMode(gin.TestMode)

	apiRepo := newFakeAPIKeyRepo()
	userRepo := newFakeUserRepo()

	r := gin.New()
	r.Use(AuthN(stubJWTProvider{}, apiRepo, userRepo, nil))
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	// An obviously broken vc2_ token must NOT fall back to cookie JWT — the
	// caller intended API-key auth, and falling through could silently log
	// them in as their browser session.
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	req.Header.Set("Authorization", "Bearer vc2_garbage")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 for malformed api key (no fallback), got %d", w.Code)
	}
}

func TestAuthN_NoAuthorizationHeader_FallsThroughToJWT(t *testing.T) {
	gin.SetMode(gin.TestMode)

	apiRepo := newFakeAPIKeyRepo()
	userRepo := newFakeUserRepo()

	r := gin.New()
	r.Use(AuthN(stubJWTProvider{}, apiRepo, userRepo, nil))
	r.GET("/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	// No Authorization header at all → JWTAuth path runs and rejects for
	// missing cookie. The point of this test is just that AuthN doesn't
	// short-circuit before delegating.
	req := httptest.NewRequest(http.MethodGet, "/x", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 from JWT path (no cookie), got %d", w.Code)
	}
}

// stubJWTProvider is enough to satisfy IAuthProvider for AuthN's signature.
// The JWT path always fails in these tests (no cookie), which is what we want.
type stubJWTProvider struct{}

func (stubJWTProvider) GenerateAuthToken(_, _ string, _ []string, _ string) (string, error) {
	return "", nil
}

func (stubJWTProvider) ValidateAuthToken(_ string) (*auth.Claims, error) {
	return nil, auth.ErrTokenInvalid
}

func (stubJWTProvider) AuthTokenTTL() time.Duration { return time.Minute }
