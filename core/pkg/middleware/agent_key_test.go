package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.mongodb.org/mongo-driver/bson"
)

// --- Fake ---

type fakeAgentKeyRepo struct {
	byKeyID map[string]models.AgentKey
	// Atomic: AuthN touches last_used_at from a detached goroutine, so the
	// counter is written after the response and races the test body.
	touches atomic.Int64
}

func newFakeAgentKeyRepo() *fakeAgentKeyRepo {
	return &fakeAgentKeyRepo{byKeyID: map[string]models.AgentKey{}}
}

func (f *fakeAgentKeyRepo) put(k models.AgentKey) { f.byKeyID[k.KeyID] = k }

func (f *fakeAgentKeyRepo) FindByKeyID(_ context.Context, keyID string) (models.AgentKey, error) {
	k, ok := f.byKeyID[keyID]
	if !ok {
		return models.AgentKey{}, errNotFound
	}
	return k, nil
}

func (f *fakeAgentKeyRepo) FindByAgentKeyID(_ context.Context, _, _ uuid.UUID) (models.AgentKey, error) {
	return models.AgentKey{}, errNotFound
}

func (f *fakeAgentKeyRepo) ListByUserID(_ context.Context, _ uuid.UUID) ([]models.AgentKey, error) {
	return nil, nil
}

func (f *fakeAgentKeyRepo) Create(_ context.Context, k *models.AgentKey) error {
	f.put(*k)
	return nil
}

func (f *fakeAgentKeyRepo) UpdateSecret(_ context.Context, _, _ uuid.UUID, _, _ string, _ int) error {
	return nil
}

func (f *fakeAgentKeyRepo) UpdateSettings(_ context.Context, _, _ uuid.UUID, _ bson.M) error {
	return nil
}

func (f *fakeAgentKeyRepo) SetEnabled(_ context.Context, _, _ uuid.UUID, _ bool) error { return nil }

func (f *fakeAgentKeyRepo) Delete(_ context.Context, _, _ uuid.UUID) error { return nil }

func (f *fakeAgentKeyRepo) TouchLastUsed(_ context.Context, _ string, _ time.Time) error {
	f.touches.Add(1)
	return nil
}

var _ repository.IAgentKeyRepository = (*fakeAgentKeyRepo)(nil)

// --- Helpers ---

// agentEnv builds a router with one agent key and its owner already present.
// mutate lets a case disable the key or deactivate the owner before wiring.
func agentEnv(t *testing.T, mutate func(k *models.AgentKey, u *models.User)) (*gin.Engine, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	raw, keyID, hash, err := auth.GenerateKey(auth.AgentKeyPrefix)
	if err != nil {
		t.Fatalf("gen: %v", err)
	}

	uid := uuid.New()
	key := models.AgentKey{
		AgentKeyID: uuid.New(),
		KeyID:      keyID,
		UserID:     uid,
		Name:       "Claude",
		SecretHash: hash,
		Enabled:    true,
		MaxRole:    models.OperationRoleOperator,
		Version:    1,
	}
	user := models.User{UserID: uid, Username: "alice", Roles: []string{"user"}, Active: true}
	if mutate != nil {
		mutate(&key, &user)
	}

	agentRepo := newFakeAgentKeyRepo()
	agentRepo.put(key)
	userRepo := newFakeUserRepo()
	userRepo.put(user)

	r := gin.New()
	r.Use(AuthN(stubJWTProvider{}, newFakeAPIKeyRepo(), agentRepo, userRepo, nil))
	r.GET("/x", func(c *gin.Context) {
		agent := AgentKeyFromContext(c)
		name := ""
		if agent != nil {
			name = agent.Name
		}
		c.JSON(http.StatusOK, gin.H{
			"uid":    c.GetString("userID"),
			"agent":  c.GetBool(AgentAuthFlag),
			"apiKey": c.GetBool(APIKeyAuthFlag),
			"name":   name,
		})
	})
	return r, raw
}

func getWithBearer(r *gin.Engine, path, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// --- Tests ---

func TestAuthN_AgentKey_Success(t *testing.T) {
	r, raw := agentEnv(t, nil)

	w := getWithBearer(r, "/x", raw)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", w.Code, w.Body.String())
	}
	body := w.Body.String()
	// The resolved identity is the OWNER's, not a separate account.
	if !strings.Contains(body, `"agent":true`) {
		t.Fatalf("expected AgentAuthFlag set, got %s", body)
	}
	if !strings.Contains(body, `"apiKey":false`) {
		t.Fatalf("agent auth must not set the API-key flag, got %s", body)
	}
	if !strings.Contains(body, `"name":"Claude"`) {
		t.Fatalf("expected the key on the context, got %s", body)
	}
}

func TestAuthN_AgentKey_Rejections(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(k *models.AgentKey, u *models.User)
	}{
		{"disabled key", func(k *models.AgentKey, _ *models.User) { k.Enabled = false }},
		{"inactive owner", func(_ *models.AgentKey, u *models.User) { u.Active = false }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r, raw := agentEnv(t, tt.mutate)
			if w := getWithBearer(r, "/x", raw); w.Code != http.StatusUnauthorized {
				t.Fatalf("expected 401, got %d (%s)", w.Code, w.Body.String())
			}
		})
	}
}

func TestAuthN_AgentKey_WrongSecret(t *testing.T) {
	r, raw := agentEnv(t, nil)

	// Same key_id, different secret tail.
	other, _, _, _ := auth.GenerateKey(auth.AgentKeyPrefix)
	forged := raw[:len(auth.AgentKeyPrefix)+12+1] + other[len(auth.AgentKeyPrefix)+12+1:]

	if w := getWithBearer(r, "/x", forged); w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d (%s)", w.Code, w.Body.String())
	}
}

func TestAuthN_AgentKey_UnknownKeyID(t *testing.T) {
	r, _ := agentEnv(t, nil)

	stranger, _, _, _ := auth.GenerateKey(auth.AgentKeyPrefix)
	if w := getWithBearer(r, "/x", stranger); w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d (%s)", w.Code, w.Body.String())
	}
}

// A malformed or unknown agent token must NOT silently fall through to cookie
// auth — same fail-closed property the API-key path has.
func TestAuthN_AgentKey_NoFallbackToJWT(t *testing.T) {
	r, _ := agentEnv(t, nil)

	if w := getWithBearer(r, "/x", "vca_notavalidtoken"); w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d (%s)", w.Code, w.Body.String())
	}
}

// An agent key minted under the agent prefix must not be accepted as an API
// key, and vice versa: the prefix is part of the credential, not decoration.
func TestParseKey_PrefixesDoNotCross(t *testing.T) {
	agentRaw, _, _, err := auth.GenerateKey(auth.AgentKeyPrefix)
	if err != nil {
		t.Fatalf("gen: %v", err)
	}
	apiRaw, _, _, err := auth.GenerateAPIKey()
	if err != nil {
		t.Fatalf("gen: %v", err)
	}

	if _, _, ok := auth.ParseAPIKey(agentRaw); ok {
		t.Fatal("agent key parsed as an API key")
	}
	if _, _, ok := auth.ParseKey(auth.AgentKeyPrefix, apiRaw); ok {
		t.Fatal("API key parsed as an agent key")
	}
	if _, _, ok := auth.ParseKey(auth.AgentKeyPrefix, agentRaw); !ok {
		t.Fatal("agent key failed to parse under its own prefix")
	}
}

// RequireHuman is the single line confining agents to the MCP surface, so it
// gets its own coverage: agent keys are refused, every other caller passes.
func TestRequireHuman(t *testing.T) {
	gin.SetMode(gin.TestMode)

	r, raw := agentEnv(t, nil)
	r.GET("/human", RequireHuman(), func(c *gin.Context) {
		c.String(http.StatusOK, "ok")
	})

	if w := getWithBearer(r, "/human", raw); w.Code != http.StatusForbidden {
		t.Fatalf("expected agent key to be refused with 403, got %d (%s)", w.Code, w.Body.String())
	}

	// The agent-reachable route registered before RequireHuman still works —
	// proving the guard is scoped to routes below it, not global.
	if w := getWithBearer(r, "/x", raw); w.Code != http.StatusOK {
		t.Fatalf("expected pre-guard route to still accept the agent, got %d", w.Code)
	}
}
