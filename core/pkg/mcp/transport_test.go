package mcp

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/middleware"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.uber.org/zap"
)

// The MCP server is shared across every agent, so per-caller identity has to
// travel on the request context. If it did not arrive, tools would run with a
// zero AuthInfo whose Agent is nil — and every cap in this package keys off
// that field, so an agent would silently become uncapped.
//
// That makes context propagation an authorization boundary rather than an
// implementation detail, and it depends on SDK internals (stateless mode
// connects the session with the request's context). These tests pin it, so an
// SDK upgrade that changed it fails here rather than in production.

// echoIdentityServer builds a minimal MCP server with one tool that reports
// whatever identity it can see, plus the gin stack that fronts it.
func echoIdentityServer(t *testing.T, key *models.AgentKey) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)

	s := &Server{
		server: mcp.NewServer(&mcp.Implementation{Name: serverName, Version: serverVersion}, nil),
		deps:   Deps{Logger: zap.NewNop()},
	}

	type echoArgs struct{}
	mcp.AddTool(s.server, &mcp.Tool{
		Name:        "echo_identity",
		Description: "test tool",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ echoArgs) (*mcp.CallToolResult, any, error) {
		auth := gqlctx.AuthFromContext(ctx)
		out := map[string]any{
			"userID":   auth.UserID,
			"hasAgent": auth.Agent != nil,
		}
		if auth.Agent != nil {
			out["agentName"] = auth.Agent.Name
			out["maxRole"] = string(auth.Agent.MaxRole)
			out["allowWrites"] = auth.Agent.AllowWrites
		}
		encoded, _ := json.Marshal(out)
		return &mcp.CallToolResult{
			Content: []mcp.Content{&mcp.TextContent{Text: string(encoded)}},
		}, nil, nil
	})

	r := gin.New()
	r.POST("/mcp", func(c *gin.Context) {
		if key != nil {
			c.Set("userID", key.UserID.String())
			c.Set("username", "alice")
			c.Set("roles", []string{"user"})
			c.Set(middleware.AgentAuthFlag, true)
			c.Set(middleware.AgentInfoKey, key)
		}
		c.Next()
	}, s.Handler())
	return r
}

// callTool drives one full MCP exchange: initialize, then tools/call, over the
// real streamable HTTP handler.
func callTool(t *testing.T, r *gin.Engine, name string) *httptest.ResponseRecorder {
	t.Helper()

	initBody := `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{` +
		`"protocolVersion":"2025-06-18","capabilities":{},` +
		`"clientInfo":{"name":"test","version":"1"}}}`
	post(t, r, initBody)

	callBody := `{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"` + name + `","arguments":{}}}`
	return post(t, r, callBody)
}

func post(t *testing.T, r *gin.Engine, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/mcp", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func testAgentKey(maxRole models.OperationRole, allowWrites bool) *models.AgentKey {
	return &models.AgentKey{
		AgentKeyID:  uuid.New(),
		KeyID:       "abcdef012345",
		UserID:      uuid.New(),
		Name:        "Claude",
		Enabled:     true,
		MaxRole:     maxRole,
		AllowWrites: allowWrites,
	}
}

// The load-bearing one: the caller's identity and ceiling must reach the tool.
func TestHandler_AgentIdentityReachesToolHandler(t *testing.T) {
	key := testAgentKey(models.OperationRoleViewer, false)
	r := echoIdentityServer(t, key)

	w := callTool(t, r, "echo_identity")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", w.Code, w.Body.String())
	}

	body := w.Body.String()
	for _, want := range []string{
		key.UserID.String(), // the OWNER's id, not a synthetic agent account
		`\"hasAgent\":true`, // without this every cap in the package is inert
		`\"agentName\":\"Claude\"`,
		`\"maxRole\":\"viewer\"`,
		`\"allowWrites\":false`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("tool handler did not see %s.\nThis means per-request identity is not\n"+
				"reaching tools and every agent would run uncapped.\nGot: %s", want, body)
		}
	}
}

// The ceiling must arrive as configured, not as a default.
func TestHandler_CeilingArrivesIntact(t *testing.T) {
	key := testAgentKey(models.OperationRoleOperator, true)
	r := echoIdentityServer(t, key)

	body := callTool(t, r, "echo_identity").Body.String()
	if !strings.Contains(body, `\"maxRole\":\"operator\"`) || !strings.Contains(body, `\"allowWrites\":true`) {
		t.Fatalf("agent ceiling did not survive the transport: %s", body)
	}
}

// Anything that is not an agent is refused outright. A human session reaching
// here would run the tools with AuthInfo.Agent nil — no scope list, no role
// cap, no write gate — which is strictly more access than the same person has
// through their own agent key.
func TestHandler_RefusesNonAgentCallers(t *testing.T) {
	r := echoIdentityServer(t, nil)

	w := post(t, r, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for a non-agent caller, got %d (%s)", w.Code, w.Body.String())
	}
}

// The tool surface is the agent-facing contract. This pins it so a rename or
// an accidental drop is a failing test rather than a silently broken agent,
// and so the read/write split stays deliberate: a tool that mutates must be
// registered as a writeTool or the read-only key gate never runs for it.
func TestServer_ToolSurface(t *testing.T) {
	s := New(Deps{Logger: zap.NewNop()})

	key := testAgentKey(models.OperationRoleOperator, true)
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/mcp", func(c *gin.Context) {
		c.Set("userID", key.UserID.String())
		c.Set("username", "alice")
		c.Set("roles", []string{"user"})
		c.Set(middleware.AgentAuthFlag, true)
		c.Set(middleware.AgentInfoKey, key)
		c.Next()
	}, s.Handler())

	post(t, r, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{`+
		`"protocolVersion":"2025-06-18","capabilities":{},`+
		`"clientInfo":{"name":"test","version":"1"}}}`)

	body := post(t, r, `{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}`).Body.String()

	want := []string{
		"list_operations", "get_operation_summary",
		"find_hosts", "get_host", "create_host", "update_host",
		"find_credentials", "get_credential", "create_credential", "add_credential_comment",
		"find_hashes", "get_hash", "create_hash", "import_hashes", "update_hash",
		"mark_hash_cracked",
		"find_tasks", "get_task", "create_task", "update_task", "change_task_stage",
		"add_task_wiki_reference",
		"search_wiki", "list_wiki_tree", "get_wiki_document",
		"create_wiki_document", "append_wiki_section", "update_wiki_document",
		"get_timeline", "create_timeline_event",
		"get_user_focus",
	}
	for _, name := range want {
		// tools/list returns names as real JSON fields. (The identity test
		// above matches escaped strings instead, because a tool's own output
		// is JSON encoded *inside* the TextContent string.)
		if !strings.Contains(body, `"name":"`+name+`"`) {
			t.Errorf("tool %q is not registered", name)
		}
	}

	// Nothing from the offensive surface belongs here. The blast radius is the
	// knowledge layer; if one of these ever appears, it was not an accident
	// worth discovering in production.
	for _, forbidden := range []string{"session", "implant", "channel", "module", "task_agent"} {
		if strings.Contains(body, `"name":"`+forbidden) {
			t.Errorf("a tool touching %q is registered; the agent surface must stay knowledge-layer only", forbidden)
		}
	}
}

// Resources and prompts are a second surface onto the same data, so they get
// the same "this exists and is named what callers expect" guard as the tools.
func TestServer_ResourcesAndPrompts(t *testing.T) {
	s := New(Deps{Logger: zap.NewNop()})

	key := testAgentKey(models.OperationRoleViewer, false)
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/mcp", func(c *gin.Context) {
		c.Set("userID", key.UserID.String())
		c.Set("username", "alice")
		c.Set("roles", []string{"user"})
		c.Set(middleware.AgentAuthFlag, true)
		c.Set(middleware.AgentInfoKey, key)
		c.Next()
	}, s.Handler())

	post(t, r, `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{`+
		`"protocolVersion":"2025-06-18","capabilities":{},`+
		`"clientInfo":{"name":"test","version":"1"}}}`)

	templates := post(t, r, `{"jsonrpc":"2.0","id":2,"method":"resources/templates/list","params":{}}`).Body.String()
	for _, want := range []string{
		"vibe://op/{operationId}/wiki/{documentId}",
		"vibe://op/{operationId}/host/{hostId}",
	} {
		if !strings.Contains(templates, want) {
			t.Errorf("resource template %q is not registered", want)
		}
	}

	resources := post(t, r, `{"jsonrpc":"2.0","id":3,"method":"resources/list","params":{}}`).Body.String()
	for _, uri := range []string{focusResourceURI, guideResourceURI} {
		if !strings.Contains(resources, uri) {
			t.Errorf("resource %q is not registered", uri)
		}
	}

	prompts := post(t, r, `{"jsonrpc":"2.0","id":4,"method":"prompts/list","params":{}}`).Body.String()
	for _, want := range []string{"triage_findings", "engagement_notes", "whats_changed"} {
		if !strings.Contains(prompts, `"name":"`+want+`"`) {
			t.Errorf("prompt %q is not registered", want)
		}
	}
}
