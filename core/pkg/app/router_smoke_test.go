package app

import (
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/environment"
	"go.uber.org/zap"
)

// The router is built from a zero App: the controller and resolver
// constructors only store their dependencies, so nil repositories are enough
// to ask the router what it mounted and which tier each route sits in.
//
// This is the only test covering pkg/app, and it exists to make the wiring
// safe to restructure. Route registration order is load-bearing here —
// gin.RouterGroup.Use affects only routes registered after it, so moving a
// route across a Use call silently changes who can reach it.
func testRouter(t *testing.T) *App {
	t.Helper()
	return &App{
		logger: zap.NewNop(),
		env: &environment.EnvironmentSettings{
			StageStatus:        "production",
			CORSAllowedOrigins: []string{"https://example.test"},
		},
		repos: &Repositories{},
	}
}

func routeTable(t *testing.T) []string {
	t.Helper()
	r := testRouter(t).NewRouter()
	out := make([]string, 0, 64)
	for _, rt := range r.Routes() {
		out = append(out, rt.Method+" "+rt.Path)
	}
	sort.Strings(out)
	return out
}

// TestRouteTable pins every mounted route. A route that appears or disappears
// during a refactor shows up here rather than in production.
func TestRouteTable(t *testing.T) {
	want := []string{
		"DELETE /api/v1/mcp",
		"GET /api/v1/",
		"GET /api/v1/graphql/ws",
		"GET /api/v1/login/me",
		"GET /api/v1/mcp",
		"GET /api/v1/mcp/skill",
		"GET /api/v1/mcp/skills/download",
		"GET /api/v1/skills/:name/download",
		"GET /api/v1/status",
		"GET /api/v1/wiki/files/:id",
		"GET /api/v1/wiki/images/:id",
		"GET /api/v1/wiki/transfer/jobs",
		"GET /api/v1/wiki/transfer/jobs/:id",
		"GET /api/v1/wiki/transfer/jobs/:id/download",
		"GET /swagger/*any",
		"OPTIONS /api/v1/mcp",
		"POST /api/channel/sync",
		"POST /api/v1/enroll",
		"POST /api/v1/graphql",
		"POST /api/v1/internal/wiki/webhook",
		"POST /api/v1/login",
		"POST /api/v1/login/refresh",
		"POST /api/v1/logout",
		"POST /api/v1/mcp",
		"POST /api/v1/mcp/skills/upload",
		"POST /api/v1/mcp/upload",
		"POST /api/v1/skills",
		"POST /api/v1/wiki/collab-ticket",
		"POST /api/v1/wiki/files",
		"POST /api/v1/wiki/images",
		"POST /api/v1/wiki/transfer/exports",
		"POST /api/v1/wiki/transfer/imports",
	}
	got := routeTable(t)
	if strings.Join(got, "\n") != strings.Join(want, "\n") {
		t.Errorf("route table changed:\n got:\n%s\n\nwant:\n%s",
			strings.Join(got, "\n"), strings.Join(want, "\n"))
	}
}

// TestRouteAuthTiers is the one that matters for the wiring's security model.
//
// Each route is probed with an unauthenticated request and its status recorded.
// 401 means a middleware in the v1 chain rejected the caller before any handler
// ran; anything else means the request reached a handler, i.e. the route sits
// above the v1.Use(AuthN) line. Route registration order is what decides that,
// and gin.RouterGroup.Use affects only routes registered after it — so moving a
// route across that line silently changes who can reach it, and changes its
// entry here.
//
// Handlers that do run execute against nil repositories and may panic; Recovery
// turns that into a 500, which is still distinguishable from a 401. The exact
// non-401 codes are incidental — what they pin is "a handler answered".
func TestRouteAuthTiers(t *testing.T) {
	want := map[string]int{
		// Behind AuthN.
		"DELETE /api/v1/mcp":                          401,
		"GET /api/v1/graphql/ws":                      401,
		"GET /api/v1/login/me":                        401,
		"GET /api/v1/mcp":                             401,
		"GET /api/v1/mcp/skill":                       401,
		"GET /api/v1/mcp/skills/download":             401,
		"GET /api/v1/skills/:name/download":           401,
		"GET /api/v1/wiki/files/:id":                  401,
		"GET /api/v1/wiki/images/:id":                 401,
		"GET /api/v1/wiki/transfer/jobs":              401,
		"GET /api/v1/wiki/transfer/jobs/:id":          401,
		"GET /api/v1/wiki/transfer/jobs/:id/download": 401,
		"OPTIONS /api/v1/mcp":                         401,
		"POST /api/v1/graphql":                        401,
		"POST /api/v1/logout":                         401,
		"POST /api/v1/mcp":                            401,
		"POST /api/v1/mcp/skills/upload":              401,
		"POST /api/v1/mcp/upload":                     401,
		"POST /api/v1/skills":                         401,
		"POST /api/v1/wiki/collab-ticket":             401,
		"POST /api/v1/wiki/files":                     401,
		"POST /api/v1/wiki/images":                    401,
		"POST /api/v1/wiki/transfer/exports":          401,
		"POST /api/v1/wiki/transfer/imports":          401,
		// /login/refresh carries CSRF but not AuthN: the access cookie is
		// expected to be expired by the time it is called. The 401 here comes
		// from the handler finding no refresh cookie, not from the chain.
		"POST /api/v1/login/refresh": 401,

		// Reached a handler — deliberately outside the v1 auth chain because
		// they initiate the session, are HMAC-validated, or are
		// machine-to-machine.
		"GET /api/v1/":                       200,
		"GET /swagger/*any":                  200,
		"GET /api/v1/status":                 500,
		"POST /api/v1/enroll":                500,
		"POST /api/v1/login":                 403,
		"POST /api/v1/internal/wiki/webhook": 400,
		"POST /api/channel/sync":             400,
	}

	r := testRouter(t).NewRouter()
	seen := make(map[string]bool, len(want))

	for _, rt := range r.Routes() {
		key := rt.Method + " " + rt.Path
		seen[key] = true
		wantCode, known := want[key]
		if !known {
			t.Errorf("route %q is not classified — add it to the tier table", key)
			continue
		}

		path := strings.ReplaceAll(rt.Path, ":id", "x")
		path = strings.ReplaceAll(path, ":name", "x")
		path = strings.ReplaceAll(path, "*any", "index.html")

		req := httptest.NewRequest(rt.Method, path, nil)
		w := httptest.NewRecorder()
		func() {
			defer func() { _ = recover() }()
			r.ServeHTTP(w, req)
		}()

		if w.Code != wantCode {
			t.Errorf("route %q: unauthenticated request got %d, want %d%s",
				key, w.Code, wantCode, tierHint(w.Code, wantCode))
		}
	}

	for key := range want {
		if !seen[key] {
			t.Errorf("route %q disappeared from the router", key)
		}
	}
}

func tierHint(got, want int) string {
	switch {
	case want == http.StatusUnauthorized && got != http.StatusUnauthorized:
		return " — this route is no longer behind AuthN"
	case want != http.StatusUnauthorized && got == http.StatusUnauthorized:
		return " — this route moved behind AuthN"
	default:
		return ""
	}
}
