package mcp

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/qiniu/qmgo"
	"go.uber.org/zap"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/blob"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/middleware"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/skills"
)

// --- in-memory registry ----------------------------------------------------

type memSkillRepo struct {
	skills   map[string]*models.Skill
	versions map[uuid.UUID][]models.SkillVersion
}

func newMemSkillRepo() *memSkillRepo {
	return &memSkillRepo{skills: map[string]*models.Skill{}, versions: map[uuid.UUID][]models.SkillVersion{}}
}

func (m *memSkillRepo) Create(_ context.Context, s *models.Skill) error {
	if _, ok := m.skills[s.Name]; ok {
		return errors.New("duplicate key")
	}
	c := *s
	m.skills[s.Name] = &c
	return nil
}

func (m *memSkillRepo) FindByName(_ context.Context, name string) (models.Skill, error) {
	s, ok := m.skills[name]
	if !ok {
		return models.Skill{}, qmgo.ErrNoSuchDocuments
	}
	return *s, nil
}

func (m *memSkillRepo) FindByID(_ context.Context, id uuid.UUID) (models.Skill, error) {
	for _, s := range m.skills {
		if s.SkillID == id {
			return *s, nil
		}
	}
	return models.Skill{}, qmgo.ErrNoSuchDocuments
}

func (m *memSkillRepo) List(_ context.Context, includeRetired bool) ([]models.Skill, error) {
	var out []models.Skill
	for _, s := range m.skills {
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

func (m *memSkillRepo) ReserveNextVersion(_ context.Context, id uuid.UUID) (int, error) {
	for _, s := range m.skills {
		if s.SkillID == id {
			s.CurrentVersion++
			return s.CurrentVersion, nil
		}
	}
	return 0, qmgo.ErrNoSuchDocuments
}

func (m *memSkillRepo) ReleaseVersion(_ context.Context, id uuid.UUID, version int) error {
	for _, s := range m.skills {
		if s.SkillID == id && s.CurrentVersion == version {
			s.CurrentVersion--
		}
	}
	return nil
}

func (m *memSkillRepo) DeleteIfEmpty(_ context.Context, skillID uuid.UUID) error {
	for name, s := range m.skills {
		if s.SkillID == skillID && s.CurrentVersion <= 0 {
			delete(m.skills, name)
		}
	}
	return nil
}

func (m *memSkillRepo) FinishPublish(_ context.Context, id uuid.UUID, in repository.FinishPublishInput) error {
	for _, s := range m.skills {
		if s.SkillID == id {
			s.SizeBytes = in.SizeBytes
			s.UploadedAt = in.UploadedAt
			s.Description = in.Description
		}
	}
	return nil
}

func (m *memSkillRepo) SetUnpublished(context.Context, uuid.UUID, *time.Time, *uuid.UUID) error {
	return nil
}

func (m *memSkillRepo) Transfer(context.Context, uuid.UUID, uuid.UUID, string) error { return nil }

func (m *memSkillRepo) CreateVersion(_ context.Context, v *models.SkillVersion) error {
	m.versions[v.SkillID] = append(m.versions[v.SkillID], *v)
	return nil
}

func (m *memSkillRepo) FindVersion(_ context.Context, id uuid.UUID, version int) (models.SkillVersion, error) {
	for _, v := range m.versions[id] {
		if v.Version == version {
			return v, nil
		}
	}
	return models.SkillVersion{}, qmgo.ErrNoSuchDocuments
}

func (m *memSkillRepo) ListVersions(_ context.Context, id uuid.UUID) ([]models.SkillVersion, error) {
	return m.versions[id], nil
}

type memSkillStore struct{ objects map[string][]byte }

func (m *memSkillStore) Put(_ context.Context, key string, body io.Reader, _ int64, _ string) error {
	raw, err := io.ReadAll(body)
	if err != nil {
		return err
	}
	m.objects[key] = raw
	return nil
}

func (m *memSkillStore) Get(_ context.Context, key string) (io.ReadCloser, blob.ObjectInfo, error) {
	raw, ok := m.objects[key]
	if !ok {
		return nil, blob.ObjectInfo{}, errors.New("not found")
	}
	return io.NopCloser(bytes.NewReader(raw)), blob.ObjectInfo{ContentLength: int64(len(raw))}, nil
}

func (m *memSkillStore) Head(context.Context, string) (blob.ObjectInfo, error) {
	return blob.ObjectInfo{}, errors.New("not implemented")
}

func (m *memSkillStore) Delete(_ context.Context, key string) error {
	delete(m.objects, key)
	return nil
}

type memSubs struct{ rows []models.SkillSubscription }

func (m *memSubs) RecordDownload(_ context.Context, userID, skillID uuid.UUID, version int, at time.Time) error {
	m.rows = append(m.rows, models.SkillSubscription{UserID: userID, SkillID: skillID, DownloadedVersion: version, DownloadedAt: at})
	return nil
}
func (m *memSubs) Snooze(context.Context, uuid.UUID, uuid.UUID, int) error { return nil }
func (m *memSubs) FindByUser(context.Context, uuid.UUID) ([]models.SkillSubscription, error) {
	return m.rows, nil
}
func (m *memSubs) Find(context.Context, uuid.UUID, uuid.UUID) (models.SkillSubscription, error) {
	return models.SkillSubscription{}, qmgo.ErrNoSuchDocuments
}
func (m *memSubs) DeleteBySkill(context.Context, uuid.UUID) error { return nil }

// --- harness ---------------------------------------------------------------

type skillTestEnv struct {
	router *gin.Engine
	repo   *memSkillRepo
	subs   *memSubs
	owner  uuid.UUID
}

func newSkillEnv(t *testing.T, key *models.AgentKey) skillTestEnv {
	t.Helper()
	gin.SetMode(gin.TestMode)
	repo := newMemSkillRepo()
	subs := &memSubs{}
	svc := skills.NewService(repo, subs, &memSkillStore{objects: map[string][]byte{}}, 1<<20, zap.NewNop())

	s := &Server{
		server: mcp.NewServer(&mcp.Implementation{Name: serverName, Version: serverVersion}, nil),
		deps:   Deps{Logger: zap.NewNop(), Skills: svc},
	}

	owner := uuid.New()
	if key != nil {
		owner = key.UserID
	}
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("userID", owner.String())
		c.Set("username", "alice")
		c.Set("roles", []string{"user"})
		if key != nil {
			c.Set(middleware.AgentAuthFlag, true)
			c.Set(middleware.AgentInfoKey, key)
		}
		c.Next()
	})
	r.POST("/mcp/skills/upload", s.PublishSkillHandler())
	r.GET("/mcp/skills/download", s.DownloadSkillHandler())
	return skillTestEnv{router: r, repo: repo, subs: subs, owner: owner}
}

func writeKey(owner uuid.UUID) *models.AgentKey {
	return &models.AgentKey{AgentKeyID: uuid.New(), KeyID: "vca_test", UserID: owner, Name: "bot", MaxRole: models.OperationRoleOperator, AllowWrites: true}
}

func readOnlyKey(owner uuid.UUID) *models.AgentKey {
	k := writeKey(owner)
	k.AllowWrites = false
	return k
}

func skillZip(t *testing.T) []byte {
	t.Helper()
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)
	f, err := w.Create("recon-sweep/SKILL.md")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.Write([]byte("# recon sweep\n")); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func postPublish(t *testing.T, env skillTestEnv, fields map[string]string, content []byte) *httptest.ResponseRecorder {
	t.Helper()
	filename := ""
	if content != nil {
		filename = "skill.zip"
	}
	body, ct := multipartBody(t, fields, filename, content)
	req := httptest.NewRequest(http.MethodPost, "/mcp/skills/upload", body)
	req.Header.Set("Content-Type", ct)
	w := httptest.NewRecorder()
	env.router.ServeHTTP(w, req)
	return w
}

func getDownload(t *testing.T, env skillTestEnv, query string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, "/mcp/skills/download"+query, nil)
	w := httptest.NewRecorder()
	env.router.ServeHTTP(w, req)
	return w
}

// --- tests -----------------------------------------------------------------

// Both endpoints sit above RequireHuman, so they carry their own agent gate.
// A human session reaching them would be a widening of the agent surface in
// the wrong direction: these exist because an agent cannot use the operator
// endpoints, not the other way round.
func TestSkillEndpoints_RefuseNonAgentCallers(t *testing.T) {
	env := newSkillEnv(t, nil)

	if w := postPublish(t, env, map[string]string{"name": "recon-sweep"}, skillZip(t)); w.Code != http.StatusForbidden {
		t.Errorf("publish: expected 403, got %d: %s", w.Code, w.Body.String())
	}
	if w := getDownload(t, env, "?name=recon-sweep"); w.Code != http.StatusForbidden {
		t.Errorf("download: expected 403, got %d: %s", w.Code, w.Body.String())
	}
}

func TestPublishSkill_ClaimsAndStores(t *testing.T) {
	owner := uuid.New()
	env := newSkillEnv(t, writeKey(owner))

	w := postPublish(t, env, map[string]string{
		"name":        "Recon Sweep",
		"description": "sweeps a subnet",
		"notes":       "first cut",
	}, skillZip(t))
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", w.Code, w.Body.String())
	}

	var got publishSkillView
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Name != "recon-sweep" || got.Version != 1 || !got.Claimed {
		t.Fatalf("unexpected result: %+v", got)
	}
	// The publish is attributed to the key's owner, and says so in the
	// history, with the agent route recorded separately.
	rows := env.repo.versions[env.repo.skills["recon-sweep"].SkillID]
	if len(rows) != 1 {
		t.Fatalf("expected one version row, got %d", len(rows))
	}
	if rows[0].UploadedByID != owner {
		t.Errorf("uploader = %s, want the key owner %s", rows[0].UploadedByID, owner)
	}
	if rows[0].ViaAgentKeyID == nil {
		t.Error("an agent publish should record the key it came through")
	}
}

func TestPublishSkill_ValidatesTheForm(t *testing.T) {
	env := newSkillEnv(t, writeKey(uuid.New()))

	tests := []struct {
		name    string
		fields  map[string]string
		content []byte
		status  int
		want    string
	}{
		{"no file", map[string]string{"name": "recon-sweep"}, nil, http.StatusBadRequest, "file is required"},
		{"no name", map[string]string{}, skillZip(t), http.StatusBadRequest, "not a usable skill name"},
		{"reserved name", map[string]string{"name": "vibe-c2-helper"}, skillZip(t), http.StatusBadRequest, "reserved"},
		{"not a zip", map[string]string{"name": "recon-sweep"}, []byte("#!/bin/sh\n"), http.StatusBadRequest, "not a readable zip"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := postPublish(t, env, tt.fields, tt.content)
			if w.Code != tt.status {
				t.Fatalf("expected %d, got %d: %s", tt.status, w.Code, w.Body.String())
			}
			if !bytes.Contains(w.Body.Bytes(), []byte(tt.want)) {
				t.Fatalf("expected %q in body, got %s", tt.want, w.Body.String())
			}
		})
	}
}

// A read-only key is stopped by the same write gate the MCP tools use, with
// the same wording, because this is a write however it arrives.
func TestPublishSkill_HonoursTheWriteGate(t *testing.T) {
	env := newSkillEnv(t, readOnlyKey(uuid.New()))

	w := postPublish(t, env, map[string]string{"name": "recon-sweep"}, skillZip(t))
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", w.Code, w.Body.String())
	}
	if !bytes.Contains(w.Body.Bytes(), []byte("read-only")) {
		t.Fatalf("expected the read-only refusal, got %s", w.Body.String())
	}
}

func TestPublishSkill_RefusesANameSomebodyElseOwns(t *testing.T) {
	env := newSkillEnv(t, writeKey(uuid.New()))
	// Somebody else already holds the name, having actually published under
	// it. A row with no versions is a different case: nobody owns it, and
	// TestEmptyClaimsAreInvisibleAndReclaimable covers that.
	env.repo.skills["recon-sweep"] = &models.Skill{
		SkillID: uuid.New(), Name: "recon-sweep", CurrentVersion: 1,
		OwnerUserID: uuid.New(), OwnerUsername: "bob",
	}

	w := postPublish(t, env, map[string]string{"name": "recon-sweep"}, skillZip(t))
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d: %s", w.Code, w.Body.String())
	}
	if !bytes.Contains(w.Body.Bytes(), []byte("bob")) {
		t.Fatalf("the refusal should name the owner, got %s", w.Body.String())
	}
}

func TestDownloadSkill_StreamsTheBundleAndRecordsIt(t *testing.T) {
	owner := uuid.New()
	env := newSkillEnv(t, writeKey(owner))
	if w := postPublish(t, env, map[string]string{"name": "recon-sweep"}, skillZip(t)); w.Code != http.StatusCreated {
		t.Fatalf("setup publish failed: %s", w.Body.String())
	}

	w := getDownload(t, env, "?name=recon-sweep")
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/zip" {
		t.Errorf("Content-Type = %q", ct)
	}
	if cd := w.Header().Get("Content-Disposition"); !bytes.Contains([]byte(cd), []byte("recon-sweep-skill-v1.zip")) {
		t.Errorf("Content-Disposition = %q", cd)
	}
	if w.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Error("a downloaded bundle must not be sniffable")
	}
	if !bytes.Equal(w.Body.Bytes(), skillZip(t)) {
		t.Error("the served bytes should be the stored bundle, unchanged")
	}
	// Recording the download is what makes an update prompt possible later.
	if len(env.subs.rows) != 1 || env.subs.rows[0].DownloadedVersion != 1 {
		t.Fatalf("expected the download to be recorded, got %+v", env.subs.rows)
	}
	if env.subs.rows[0].UserID != owner {
		t.Errorf("recorded against %s, want the key owner %s", env.subs.rows[0].UserID, owner)
	}
}

func TestDownloadSkill_MissingNameAndVersion(t *testing.T) {
	env := newSkillEnv(t, writeKey(uuid.New()))
	if w := postPublish(t, env, map[string]string{"name": "recon-sweep"}, skillZip(t)); w.Code != http.StatusCreated {
		t.Fatalf("setup publish failed: %s", w.Body.String())
	}

	tests := []struct {
		name   string
		query  string
		status int
	}{
		{"no name", "", http.StatusBadRequest},
		{"unknown skill", "?name=nothing-here", http.StatusNotFound},
		{"unknown version", "?name=recon-sweep&version=7", http.StatusNotFound},
		{"nonsense version", "?name=recon-sweep&version=x", http.StatusBadRequest},
		{"zero version", "?name=recon-sweep&version=0", http.StatusBadRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if w := getDownload(t, env, tt.query); w.Code != tt.status {
				t.Fatalf("expected %d, got %d: %s", tt.status, w.Code, w.Body.String())
			}
		})
	}
}

// Every version stays fetchable. This is the guarantee that makes a published
// skill safe to depend on: an update that breaks something can be backed out.
func TestDownloadSkill_EarlierVersionsStayAvailable(t *testing.T) {
	env := newSkillEnv(t, writeKey(uuid.New()))
	for i := 0; i < 2; i++ {
		if w := postPublish(t, env, map[string]string{"name": "recon-sweep"}, skillZip(t)); w.Code != http.StatusCreated {
			t.Fatalf("publish %d failed: %s", i, w.Body.String())
		}
	}
	if w := getDownload(t, env, "?name=recon-sweep&version=1"); w.Code != http.StatusOK {
		t.Fatalf("version 1 should still be downloadable, got %d: %s", w.Code, w.Body.String())
	}
}
