package controller

import (
	"context"
	"crypto/tls"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/cookies"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/oidc"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/auth/oidc/oidctest"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

// ---------------------------------------------------------------------------
// In-memory fakes. Only the methods the OIDC path touches do real work; the
// rest satisfy the interfaces.
// ---------------------------------------------------------------------------

var errNotFound = errors.New("not found")

type memUserRepo struct {
	mu    sync.Mutex
	users map[uuid.UUID]models.User
}

func newMemUserRepo() *memUserRepo { return &memUserRepo{users: map[uuid.UUID]models.User{}} }

func (r *memUserRepo) put(u models.User) { r.mu.Lock(); r.users[u.UserID] = u; r.mu.Unlock() }
func (r *memUserRepo) all() []models.User {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]models.User, 0, len(r.users))
	for _, u := range r.users {
		out = append(out, u)
	}
	return out
}

func (r *memUserRepo) ExistsByUsername(ctx context.Context, name string) (bool, error) {
	_, err := r.FindByUsername(ctx, name)
	return err == nil, nil
}
func (r *memUserRepo) FindByUsername(_ context.Context, name string) (models.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, u := range r.users {
		if u.Username == name {
			return u, nil
		}
	}
	return models.User{}, errNotFound
}
func (r *memUserRepo) FindByOIDCIdentity(_ context.Context, iss, sub string) (models.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, u := range r.users {
		if u.OIDC != nil && u.OIDC.Issuer == iss && u.OIDC.Subject == sub {
			return u, nil
		}
	}
	return models.User{}, errNotFound
}
func (r *memUserRepo) Create(_ context.Context, u *models.User) error { r.put(*u); return nil }
func (r *memUserRepo) Count(_ context.Context, _ string) (int64, error) {
	return int64(len(r.all())), nil
}
func (r *memUserRepo) FindAll(context.Context, string, int64, int64) ([]models.User, error) {
	return nil, nil
}
func (r *memUserRepo) FindWithCursor(context.Context, string, repository.UserSort, *pagination.Cursor, int64, bool) ([]models.User, error) {
	return nil, nil
}
func (r *memUserRepo) FindByID(_ context.Context, id uuid.UUID) (models.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	u, ok := r.users[id]
	if !ok {
		return models.User{}, errNotFound
	}
	return u, nil
}
func (r *memUserRepo) FindByIDs(context.Context, []uuid.UUID) ([]models.User, error) { return nil, nil }
func (r *memUserRepo) FindSuggestions(context.Context, string, int64) ([]models.User, error) {
	return nil, nil
}

// Update applies the subset of $set keys the OIDC path uses.
func (r *memUserRepo) Update(_ context.Context, u *models.User, updates map[string]interface{}) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	cur := r.users[u.UserID]
	for k, v := range updates {
		switch k {
		case "roles":
			cur.Roles = v.([]string)
		case "password":
			cur.Password = v.(string)
		case "auth_source":
			cur.AuthSource = v.(string)
		case "oidc":
			id := v.(models.OIDCIdentity)
			cur.OIDC = &id
		case "oidc.last_login_at":
			if cur.OIDC != nil {
				cur.OIDC.LastLoginAt = v.(time.Time)
			}
		}
	}
	r.users[u.UserID] = cur
	return nil
}
func (r *memUserRepo) Delete(context.Context, *models.User) error { return nil }

type memSessionRepo struct {
	mu   sync.Mutex
	rows []models.Session
}

func (s *memSessionRepo) Insert(_ context.Context, row *models.Session) error {
	s.mu.Lock()
	s.rows = append(s.rows, *row)
	s.mu.Unlock()
	return nil
}
func (s *memSessionRepo) FindByID(context.Context, uuid.UUID) (models.Session, error) {
	return models.Session{}, errNotFound
}
func (s *memSessionRepo) FindBySessionIDs(context.Context, []uuid.UUID) ([]models.Session, error) {
	return nil, nil
}
func (s *memSessionRepo) Count(context.Context, []uuid.UUID) (int64, error) { return 0, nil }
func (s *memSessionRepo) FindWithCursor(context.Context, []uuid.UUID, *pagination.Cursor, int64, bool) ([]models.Session, error) {
	return nil, nil
}

type memTokenStore struct {
	mu      sync.Mutex
	created map[string]uuid.UUID // tokenHash -> sessionID
}

func newMemTokenStore() *memTokenStore { return &memTokenStore{created: map[string]uuid.UUID{}} }
func (t *memTokenStore) Create(_ context.Context, _ uuid.UUID, sid uuid.UUID, hash string, _ time.Duration) error {
	t.mu.Lock()
	t.created[hash] = sid
	t.mu.Unlock()
	return nil
}
func (t *memTokenStore) Rotate(context.Context, uuid.UUID, string, string, time.Duration) (uuid.UUID, error) {
	return uuid.Nil, auth.ErrTokenInvalid
}
func (t *memTokenStore) Lookup(context.Context, uuid.UUID, string) (*auth.ActiveSession, error) {
	return nil, auth.ErrTokenInvalid
}
func (t *memTokenStore) DeleteBySessionID(context.Context, uuid.UUID, uuid.UUID) (*auth.ActiveSession, error) {
	return nil, nil
}
func (t *memTokenStore) ListByUser(context.Context, uuid.UUID) ([]auth.ActiveSession, error) {
	return nil, nil
}
func (t *memTokenStore) ListAllActive(context.Context) ([]auth.ActiveSession, error) { return nil, nil }
func (t *memTokenStore) DeleteAllForUser(context.Context, uuid.UUID) error           { return nil }
func (t *memTokenStore) SaveGrace(context.Context, uuid.UUID, string, auth.GracePayload, time.Duration) error {
	return nil
}
func (t *memTokenStore) LookupGrace(context.Context, uuid.UUID, string) (*auth.GracePayload, error) {
	return nil, auth.ErrTokenInvalid
}
func (t *memTokenStore) Close() error { return nil }

type memBus struct {
	mu     sync.Mutex
	events []eventbus.Event
}

func (b *memBus) Publish(e eventbus.Event) {
	b.mu.Lock()
	b.events = append(b.events, e)
	b.mu.Unlock()
}
func (b *memBus) Subscribe([]eventbus.Topic, eventbus.Handler, ...eventbus.Filter) func() {
	return func() {}
}
func (b *memBus) Start()               {}
func (b *memBus) Stop(context.Context) {}
func (b *memBus) topics() []eventbus.Topic {
	b.mu.Lock()
	defer b.mu.Unlock()
	out := make([]eventbus.Topic, 0, len(b.events))
	for _, e := range b.events {
		out = append(out, e.Topic)
	}
	return out
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

type oidcHarness struct {
	idp    *oidctest.Server
	router *gin.Engine
	users  *memUserRepo
	sess   *memSessionRepo
	tokens *memTokenStore
	bus    *memBus
	cfg    OIDCControllerConfig
}

// The SPA and the API live on different origins in the harness (as in dev)
// so the Referer-based SPA origin derivation is exercised on every test.
const (
	spaOrigin = "http://spa.test"
	apiHost   = "api.test"
)

func newOIDCHarness(t *testing.T, mutate func(*OIDCControllerConfig)) *oidcHarness {
	t.Helper()
	gin.SetMode(gin.TestMode)
	idp := oidctest.New()
	t.Cleanup(idp.Close)

	claims := oidc.Config{
		IssuerURL:     idp.Issuer(),
		ClientID:      idp.ClientID,
		ClientSecret:  idp.ClientSecret,
		Scopes:        []string{"profile"},
		UsernameClaim: "preferred_username",
		RolesClaim:    "realm_access.roles",
		RoleMapping:   map[string]string{"vibec2-admin": "admin", "vibec2-user": "user"},
		DefaultRoles:  []string{"user"},
		UseUserInfo:   true,
		HTTPTimeout:   5 * time.Second,
	}
	provider, err := oidc.NewLazyProvider(context.Background(), claims)
	if err != nil {
		t.Fatalf("discovery: %v", err)
	}

	h := &oidcHarness{
		idp: idp, users: newMemUserRepo(), sess: &memSessionRepo{}, tokens: newMemTokenStore(), bus: &memBus{},
	}
	h.cfg = OIDCControllerConfig{
		Claims:         claims,
		AllowedOrigins: []string{spaOrigin},
		HandshakeKey:   auth.DeriveKey("test-secret", "oidc-handshake"),
	}
	if mutate != nil {
		mutate(&h.cfg)
	}
	sessionCfg := AuthControllerConfig{RefreshTTL: time.Hour, IsDev: true, LocalLoginEnabled: true}
	ctrl := NewOIDCController(provider, h.users, h.sess, auth.NewAuthProvider("test-secret", 15*time.Minute),
		h.tokens, h.bus, zap.NewNop(), sessionCfg, h.cfg)

	r := gin.New()
	r.GET("/api/v1/auth/oidc/login", ctrl.Login)
	r.GET("/api/v1/auth/oidc/callback", ctrl.Callback)
	h.router = r
	return h
}

// startLogin hits /login and returns the handshake cookie plus the parsed
// state and nonce the provider would see.
func (h *oidcHarness) startLogin(t *testing.T, returnTo string) (cookie *http.Cookie, state, nonce string) {
	t.Helper()
	target := "/api/v1/auth/oidc/login"
	if returnTo != "" {
		target += "?return_to=" + url.QueryEscape(returnTo)
	}
	req := httptest.NewRequest(http.MethodGet, target, nil)
	req.Host = apiHost
	req.Header.Set("Referer", spaOrigin+"/login")
	rec := httptest.NewRecorder()
	h.router.ServeHTTP(rec, req)
	if rec.Code != http.StatusFound {
		t.Fatalf("login status = %d, body %s", rec.Code, rec.Body.String())
	}
	loc, err := url.Parse(rec.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(loc.String(), h.idp.Issuer()+"/auth?") {
		t.Fatalf("login must redirect to the provider, got %s", loc)
	}
	if got := loc.Query().Get("redirect_uri"); got != "http://"+apiHost+oidc.CallbackPath {
		t.Fatalf("redirect_uri = %q, want it derived from the request host", got)
	}
	for _, c := range rec.Result().Cookies() {
		if c.Name == cookies.OIDCHandshakeCookie {
			cookie = c
		}
	}
	if cookie == nil || !cookie.HttpOnly || cookie.Path != "/api/v1/auth/oidc" {
		t.Fatalf("handshake cookie missing or misconfigured: %+v", cookie)
	}
	return cookie, loc.Query().Get("state"), loc.Query().Get("nonce")
}

// callback performs the provider redirect back into core.
func (h *oidcHarness) callback(t *testing.T, cookie *http.Cookie, query url.Values) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/oidc/callback?"+query.Encode(), nil)
	req.Host = apiHost // the provider redirects the browser; no Referer from the SPA here
	if cookie != nil {
		req.AddCookie(cookie)
	}
	rec := httptest.NewRecorder()
	h.router.ServeHTTP(rec, req)
	if rec.Code != http.StatusFound {
		t.Fatalf("callback status = %d, body %s", rec.Code, rec.Body.String())
	}
	return rec
}

func (h *oidcHarness) issue(t *testing.T, code, nonce string, claims map[string]any) {
	t.Helper()
	full := map[string]any{"nonce": nonce}
	for k, v := range claims {
		full[k] = v
	}
	h.idp.IssueCode(code, full)
}

func location(rec *httptest.ResponseRecorder) string { return rec.Header().Get("Location") }

func assertErrorRedirect(t *testing.T, rec *httptest.ResponseRecorder, code string) {
	t.Helper()
	want := spaOrigin + "/login?error=" + code
	if got := location(rec); got != want {
		t.Fatalf("redirect = %q, want %q", got, want)
	}
	for _, c := range rec.Result().Cookies() {
		if c.Name == cookies.AccessTokenCookie && c.Value != "" {
			t.Fatal("no access cookie may be set on a failed callback")
		}
	}
}

func cookieNames(rec *httptest.ResponseRecorder) map[string]*http.Cookie {
	out := map[string]*http.Cookie{}
	for _, c := range rec.Result().Cookies() {
		out[c.Name] = c
	}
	return out
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

func TestOIDC_HappyPathProvisionsUserAndIssuesSession(t *testing.T) {
	h := newOIDCHarness(t, nil)
	cookie, state, nonce := h.startLogin(t, "/wiki/doc-1")
	h.issue(t, "code-1", nonce, map[string]any{"sub": "sub-1", "preferred_username": "Alice"})
	h.idp.UserInfo = map[string]any{"sub": "sub-1", "realm_access": map[string]any{"roles": []any{"vibec2-admin"}}}

	rec := h.callback(t, cookie, url.Values{"code": {"code-1"}, "state": {state}})

	if got := location(rec); got != spaOrigin+"/wiki/doc-1" {
		t.Fatalf("redirect = %q", got)
	}
	cs := cookieNames(rec)
	if cs[cookies.AccessTokenCookie] == nil || cs[cookies.AccessTokenCookie].Value == "" {
		t.Fatal("access cookie not set")
	}
	if cs[cookies.RefreshTokenCookie] == nil || cs[cookies.CSRFCookie] == nil {
		t.Fatal("refresh/csrf cookies not set")
	}
	if hs := cs[cookies.OIDCHandshakeCookie]; hs == nil || hs.MaxAge != -1 {
		t.Fatal("handshake cookie must be cleared on callback")
	}

	users := h.users.all()
	if len(users) != 1 {
		t.Fatalf("users = %d, want 1", len(users))
	}
	u := users[0]
	if u.Username != "alice" || !u.IsSSO() || u.Password != "" {
		t.Fatalf("provisioned user = %+v", u)
	}
	if u.OIDC == nil || u.OIDC.Issuer != h.idp.Issuer() || u.OIDC.Subject != "sub-1" {
		t.Fatalf("identity link = %+v", u.OIDC)
	}
	if len(u.Roles) != 1 || u.Roles[0] != "admin" {
		t.Fatalf("roles = %v, want [admin]", u.Roles)
	}
	if len(h.sess.rows) != 1 || h.sess.rows[0].UserID != u.UserID {
		t.Fatalf("session audit row = %+v", h.sess.rows)
	}
	if len(h.tokens.created) != 1 {
		t.Fatalf("redis entries = %d, want 1", len(h.tokens.created))
	}

	topics := h.bus.topics()
	var sawCreated, sawLogin bool
	for _, tp := range topics {
		sawCreated = sawCreated || tp == eventbus.TopicUserCreated
		sawLogin = sawLogin || tp == eventbus.TopicAuthLogin
	}
	if !sawCreated || !sawLogin {
		t.Fatalf("events = %v", topics)
	}
}

func TestOIDC_SecondLoginSyncsRolesAndKeepsAccount(t *testing.T) {
	h := newOIDCHarness(t, nil)

	cookie, state, nonce := h.startLogin(t, "")
	h.issue(t, "c1", nonce, map[string]any{"sub": "sub-1", "preferred_username": "bob",
		"realm_access": map[string]any{"roles": []any{"vibec2-admin"}}})
	h.callback(t, cookie, url.Values{"code": {"c1"}, "state": {state}})

	first := h.users.all()[0]
	if first.Roles[0] != "admin" {
		t.Fatalf("first login roles = %v", first.Roles)
	}

	// Provider demoted the user; username changed too (must not matter).
	cookie, state, nonce = h.startLogin(t, "")
	h.issue(t, "c2", nonce, map[string]any{"sub": "sub-1", "preferred_username": "robert",
		"realm_access": map[string]any{"roles": []any{"vibec2-user"}}})
	rec := h.callback(t, cookie, url.Values{"code": {"c2"}, "state": {state}})
	if got := location(rec); got != spaOrigin+"/" {
		t.Fatalf("redirect = %q", got)
	}

	users := h.users.all()
	if len(users) != 1 {
		t.Fatalf("second login must reuse the account, got %d users", len(users))
	}
	u := users[0]
	if u.UserID != first.UserID || u.Username != "bob" {
		t.Fatalf("account identity drifted: %+v", u)
	}
	if len(u.Roles) != 1 || u.Roles[0] != "user" {
		t.Fatalf("roles not synced: %+v", u)
	}
	if u.OIDC.LastLoginAt.IsZero() {
		t.Fatal("last_login_at not updated")
	}
}

func TestOIDC_CallbackRejections(t *testing.T) {
	t.Run("missing handshake cookie falls back to the api origin", func(t *testing.T) {
		h := newOIDCHarness(t, nil)
		rec := h.callback(t, nil, url.Values{"code": {"x"}, "state": {"y"}})
		if got := location(rec); got != "http://"+apiHost+"/login?error="+OIDCErrState {
			t.Fatalf("redirect = %q", got)
		}
	})

	t.Run("state mismatch", func(t *testing.T) {
		h := newOIDCHarness(t, nil)
		cookie, _, nonce := h.startLogin(t, "")
		h.issue(t, "c", nonce, map[string]any{"sub": "s", "preferred_username": "u"})
		rec := h.callback(t, cookie, url.Values{"code": {"c"}, "state": {"forged"}})
		assertErrorRedirect(t, rec, OIDCErrState)
	})

	t.Run("expired handshake", func(t *testing.T) {
		var clock time.Time = time.Now()
		h := newOIDCHarness(t, func(c *OIDCControllerConfig) { c.Now = func() time.Time { return clock } })
		cookie, state, nonce := h.startLogin(t, "")
		h.issue(t, "c", nonce, map[string]any{"sub": "s", "preferred_username": "u"})
		clock = clock.Add(oidc.HandshakeTTL + time.Second)
		rec := h.callback(t, cookie, url.Values{"code": {"c"}, "state": {state}})
		assertErrorRedirect(t, rec, OIDCErrState)
	})

	t.Run("provider error such as access_denied", func(t *testing.T) {
		h := newOIDCHarness(t, nil)
		cookie, state, _ := h.startLogin(t, "")
		rec := h.callback(t, cookie, url.Values{"error": {"access_denied"}, "state": {state}})
		assertErrorRedirect(t, rec, OIDCErrDenied)
	})

	t.Run("nonce mismatch", func(t *testing.T) {
		h := newOIDCHarness(t, nil)
		cookie, state, _ := h.startLogin(t, "")
		h.issue(t, "c", "other-nonce", map[string]any{"sub": "s", "preferred_username": "u"})
		rec := h.callback(t, cookie, url.Values{"code": {"c"}, "state": {state}})
		assertErrorRedirect(t, rec, OIDCErrProvider)
	})

	t.Run("bad code", func(t *testing.T) {
		h := newOIDCHarness(t, nil)
		cookie, state, _ := h.startLogin(t, "")
		rec := h.callback(t, cookie, url.Values{"code": {"never-issued"}, "state": {state}})
		assertErrorRedirect(t, rec, OIDCErrProvider)
	})

	t.Run("no mapped role and no default", func(t *testing.T) {
		h := newOIDCHarness(t, func(c *OIDCControllerConfig) { c.Claims.DefaultRoles = nil })
		cookie, state, nonce := h.startLogin(t, "")
		h.issue(t, "c", nonce, map[string]any{"sub": "s", "preferred_username": "u",
			"realm_access": map[string]any{"roles": []any{"unrelated"}}})
		rec := h.callback(t, cookie, url.Values{"code": {"c"}, "state": {state}})
		assertErrorRedirect(t, rec, OIDCErrNoRoles)
		if len(h.users.all()) != 0 {
			t.Fatal("no user may be provisioned on a denied login")
		}
	})

	t.Run("inactive linked user", func(t *testing.T) {
		h := newOIDCHarness(t, nil)
		h.users.put(models.User{UserID: uuid.New(), Username: "dora", Active: false, AuthSource: models.AuthSourceOIDC,
			OIDC: &models.OIDCIdentity{Issuer: h.idp.Issuer(), Subject: "s-dora"}})
		cookie, state, nonce := h.startLogin(t, "")
		h.issue(t, "c", nonce, map[string]any{"sub": "s-dora", "preferred_username": "dora"})
		rec := h.callback(t, cookie, url.Values{"code": {"c"}, "state": {state}})
		assertErrorRedirect(t, rec, OIDCErrInactive)
	})

}

func TestOIDC_UsernameCollision(t *testing.T) {
	seedLocal := func(h *oidcHarness, active bool) models.User {
		u := models.User{UserID: uuid.New(), Username: "carol", Password: "bcrypt-hash", Roles: []string{"user"}, Active: active}
		h.users.put(u)
		return u
	}

	t.Run("refused by default", func(t *testing.T) {
		h := newOIDCHarness(t, nil)
		seedLocal(h, true)
		cookie, state, nonce := h.startLogin(t, "")
		h.issue(t, "c", nonce, map[string]any{"sub": "s-carol", "preferred_username": "Carol"})
		rec := h.callback(t, cookie, url.Values{"code": {"c"}, "state": {state}})
		assertErrorRedirect(t, rec, OIDCErrUsernameTaken)
		if u, _ := h.users.FindByUsername(context.Background(), "carol"); u.OIDC != nil || u.Password == "" {
			t.Fatalf("local account must be untouched: %+v", u)
		}
	})

	t.Run("linked when enabled", func(t *testing.T) {
		h := newOIDCHarness(t, func(c *OIDCControllerConfig) { c.LinkExistingByUsername = true })
		local := seedLocal(h, true)
		cookie, state, nonce := h.startLogin(t, "")
		h.issue(t, "c", nonce, map[string]any{"sub": "s-carol", "preferred_username": "carol",
			"realm_access": map[string]any{"roles": []any{"vibec2-admin"}}})
		rec := h.callback(t, cookie, url.Values{"code": {"c"}, "state": {state}})
		if got := location(rec); got != spaOrigin+"/" {
			t.Fatalf("redirect = %q", got)
		}
		u, _ := h.users.FindByID(context.Background(), local.UserID)
		if !u.IsSSO() || u.Password != "" || u.OIDC == nil || u.OIDC.Subject != "s-carol" || u.Roles[0] != "admin" {
			t.Fatalf("account not adopted: %+v", u)
		}
		if len(h.users.all()) != 1 {
			t.Fatal("linking must not create a second account")
		}
	})

	t.Run("already linked to another subject is refused even when enabled", func(t *testing.T) {
		h := newOIDCHarness(t, func(c *OIDCControllerConfig) { c.LinkExistingByUsername = true })
		h.users.put(models.User{UserID: uuid.New(), Username: "carol", Active: true, AuthSource: models.AuthSourceOIDC,
			OIDC: &models.OIDCIdentity{Issuer: h.idp.Issuer(), Subject: "someone-else"}})
		cookie, state, nonce := h.startLogin(t, "")
		h.issue(t, "c", nonce, map[string]any{"sub": "s-carol", "preferred_username": "carol"})
		rec := h.callback(t, cookie, url.Values{"code": {"c"}, "state": {state}})
		assertErrorRedirect(t, rec, OIDCErrUsernameTaken)
	})
}

func TestOIDC_ReturnToIsNeverAnOpenRedirect(t *testing.T) {
	for _, evil := range []string{"https://evil.test/x", "//evil.test", "/\\evil.test", "javascript:alert(1)"} {
		t.Run(evil, func(t *testing.T) {
			h := newOIDCHarness(t, nil)
			cookie, state, nonce := h.startLogin(t, evil)
			h.issue(t, "c", nonce, map[string]any{"sub": "s", "preferred_username": "u"})
			rec := h.callback(t, cookie, url.Values{"code": {"c"}, "state": {state}})
			if got := location(rec); got != spaOrigin+"/" {
				t.Fatalf("return_to %q leaked into redirect %q", evil, got)
			}
		})
	}
}

func TestOIDC_LoginWhenProviderUnavailable(t *testing.T) {
	gin.SetMode(gin.TestMode)
	dead := oidctest.New()
	deadURL := dead.Issuer()
	dead.Close()
	provider, _ := oidc.NewLazyProvider(context.Background(), oidc.Config{
		IssuerURL: deadURL, ClientID: "x", ClientSecret: "y", HTTPTimeout: time.Second,
	})
	ctrl := NewOIDCController(provider, newMemUserRepo(), &memSessionRepo{}, auth.NewAuthProvider("s", time.Minute),
		newMemTokenStore(), &memBus{}, zap.NewNop(), AuthControllerConfig{IsDev: true},
		OIDCControllerConfig{AllowedOrigins: []string{spaOrigin}, HandshakeKey: auth.DeriveKey("s", "oidc-handshake")})
	r := gin.New()
	r.GET("/api/v1/auth/oidc/login", ctrl.Login)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/oidc/login", nil)
	req.Host = apiHost
	req.Header.Set("Referer", spaOrigin+"/login")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusFound {
		t.Fatalf("status = %d", rec.Code)
	}
	assertErrorRedirect(t, rec, OIDCErrUnavailable)
}

func TestOIDC_DerivedURLs(t *testing.T) {
	t.Run("proxy headers shape redirect_uri and the exchange repeats it", func(t *testing.T) {
		h := newOIDCHarness(t, nil)
		req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/oidc/login", nil)
		req.Host = "core:8002"
		req.Header.Set("X-Forwarded-Proto", "https")
		req.Header.Set("X-Forwarded-Host", "c2.example.com")
		req.Header.Set("Referer", spaOrigin+"/")
		rec := httptest.NewRecorder()
		h.router.ServeHTTP(rec, req)
		loc, _ := url.Parse(rec.Header().Get("Location"))
		want := "https://c2.example.com" + oidc.CallbackPath
		if got := loc.Query().Get("redirect_uri"); got != want {
			t.Fatalf("redirect_uri = %q, want %q", got, want)
		}
		var cookie *http.Cookie
		for _, c := range rec.Result().Cookies() {
			if c.Name == cookies.OIDCHandshakeCookie {
				cookie = c
			}
		}
		h.issue(t, "c", loc.Query().Get("nonce"), map[string]any{"sub": "s", "preferred_username": "u"})
		// The callback arrives at a different replica without proxy headers;
		// the sealed value, not the new request, must feed the exchange.
		h.callback(t, cookie, url.Values{"code": {"c"}, "state": {loc.Query().Get("state")}})
		if got := h.idp.LastTokenForm.Get("redirect_uri"); got != want {
			t.Fatalf("exchange redirect_uri = %q, want %q", got, want)
		}
	})

	t.Run("single-origin deployment lands on the api origin", func(t *testing.T) {
		h := newOIDCHarness(t, nil)
		req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/oidc/login?return_to=/tasks", nil)
		req.Host = "c2.example.com"
		req.TLS = &tls.ConnectionState{}
		// No Referer: a bookmark, or a same-origin SPA behind the same host.
		rec := httptest.NewRecorder()
		h.router.ServeHTTP(rec, req)
		loc, _ := url.Parse(rec.Header().Get("Location"))
		var cookie *http.Cookie
		for _, c := range rec.Result().Cookies() {
			if c.Name == cookies.OIDCHandshakeCookie {
				cookie = c
			}
		}
		h.issue(t, "c", loc.Query().Get("nonce"), map[string]any{"sub": "s", "preferred_username": "u"})
		cb := h.callback(t, cookie, url.Values{"code": {"c"}, "state": {loc.Query().Get("state")}})
		if got := location(cb); got != "https://c2.example.com/tasks" {
			t.Fatalf("post-login redirect = %q", got)
		}
	})

	t.Run("referer outside the allowlist cannot choose the landing origin", func(t *testing.T) {
		h := newOIDCHarness(t, nil)
		req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/oidc/login", nil)
		req.Host = apiHost
		req.Header.Set("Referer", "https://evil.test/phish")
		rec := httptest.NewRecorder()
		h.router.ServeHTTP(rec, req)
		loc, _ := url.Parse(rec.Header().Get("Location"))
		var cookie *http.Cookie
		for _, c := range rec.Result().Cookies() {
			if c.Name == cookies.OIDCHandshakeCookie {
				cookie = c
			}
		}
		h.issue(t, "c", loc.Query().Get("nonce"), map[string]any{"sub": "s", "preferred_username": "u"})
		cb := h.callback(t, cookie, url.Values{"code": {"c"}, "state": {loc.Query().Get("state")}})
		if got := location(cb); got != "http://"+apiHost+"/" {
			t.Fatalf("post-login redirect = %q, must fall back to the api origin", got)
		}
	})

	t.Run("failure before the handshake is opened still lands on an allowed origin", func(t *testing.T) {
		h := newOIDCHarness(t, nil)
		req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/oidc/callback?error=access_denied&state=x", nil)
		req.Host = apiHost
		req.Header.Set("Referer", "https://evil.test/")
		rec := httptest.NewRecorder()
		h.router.ServeHTTP(rec, req)
		if got := location(rec); got != "http://"+apiHost+"/login?error="+OIDCErrState {
			t.Fatalf("redirect = %q", got)
		}
	})
}

var (
	_ repository.IUserRepository    = (*memUserRepo)(nil)
	_ repository.ISessionRepository = (*memSessionRepo)(nil)
	_ auth.TokenStore               = (*memTokenStore)(nil)
	_ eventbus.IEventBus            = (*memBus)(nil)
)
