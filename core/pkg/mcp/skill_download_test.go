package mcp

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/mcp/skillchangelog"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
	"go.uber.org/zap"
)

// recordingUserRepo captures Update calls. The embedded interface is nil, so
// any other method panics — which is the assertion that the handler needs
// nothing but Update.
type recordingUserRepo struct {
	repository.IUserRepository
	calls []recordedUpdate
	err   error
}

type recordedUpdate struct {
	userID  uuid.UUID
	updates map[string]interface{}
}

func (r *recordingUserRepo) Update(_ context.Context, user *models.User, updates map[string]interface{}) error {
	r.calls = append(r.calls, recordedUpdate{userID: user.UserID, updates: updates})
	return r.err
}

func serveSkill(t *testing.T, repo repository.IUserRepository, userID string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	s := New(Deps{Logger: zap.NewNop(), UserRepo: repo})
	r := gin.New()
	r.GET("/skill", func(c *gin.Context) {
		if userID != "" {
			c.Set("userID", userID)
		}
		c.Next()
	}, s.SkillHandler())
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/skill", nil))
	return w
}

// The update prompt is built on this record, so a download has to leave one
// behind, addressed to the caller and stamped with the release they got.
func TestSkillHandler_RecordsDownload(t *testing.T) {
	uid := uuid.New()
	repo := &recordingUserRepo{}

	w := serveSkill(t, repo, uid.String())
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if len(repo.calls) != 1 {
		t.Fatalf("Update called %d times, want 1", len(repo.calls))
	}
	call := repo.calls[0]
	if call.userID != uid {
		t.Fatalf("recorded against %s, want %s", call.userID, uid)
	}
	dl, ok := call.updates["skill_download"].(models.SkillDownload)
	if !ok {
		t.Fatalf("skill_download not set as models.SkillDownload: %#v", call.updates)
	}
	if dl.Version != skillchangelog.Current() {
		t.Fatalf("recorded version %d, want current %d", dl.Version, skillchangelog.Current())
	}
	if dl.DownloadedAt.IsZero() {
		t.Fatal("downloaded_at is zero")
	}
}

// No repository (tests, minimal wiring) and no identity are both non-fatal:
// the operator still gets the bundle.
func TestSkillHandler_ToleratesMissingRecorder(t *testing.T) {
	if w := serveSkill(t, nil, uuid.NewString()); w.Code != http.StatusOK {
		t.Fatalf("without repo: status = %d, want 200", w.Code)
	}
	repo := &recordingUserRepo{}
	if w := serveSkill(t, repo, ""); w.Code != http.StatusOK {
		t.Fatalf("without user id: status = %d, want 200", w.Code)
	}
	if len(repo.calls) != 0 {
		t.Fatalf("recorded a download with no user id: %#v", repo.calls)
	}
}

// A failed record must not turn a successful download into an error: the
// bytes are already on the wire.
func TestSkillHandler_RecordFailureIsNotFatal(t *testing.T) {
	repo := &recordingUserRepo{err: context.DeadlineExceeded}
	if w := serveSkill(t, repo, uuid.NewString()); w.Code != http.StatusOK || w.Body.Len() == 0 {
		t.Fatalf("status = %d, body %d bytes; want 200 with a body", w.Code, w.Body.Len())
	}
}
