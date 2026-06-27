package resolver

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// fakeModuleRepo is an in-memory IModuleRegistryRepository. Only List and
// FindByInstance are exercised by the resolver; the rest satisfy the interface.
type fakeModuleRepo struct {
	rows       []models.Module
	lastStatus []string // captured arg from the last List call
	findErr    error
}

func (f *fakeModuleRepo) List(_ context.Context, statuses []string) ([]models.Module, error) {
	f.lastStatus = statuses
	if len(statuses) == 0 {
		return f.rows, nil
	}
	want := map[string]struct{}{}
	for _, s := range statuses {
		want[s] = struct{}{}
	}
	var out []models.Module
	for _, m := range f.rows {
		if _, ok := want[m.Status]; ok {
			out = append(out, m)
		}
	}
	return out, nil
}

func (f *fakeModuleRepo) FindByInstance(_ context.Context, instance string) (models.Module, error) {
	if f.findErr != nil {
		return models.Module{}, f.findErr
	}
	for _, m := range f.rows {
		if m.Instance == instance {
			return m, nil
		}
	}
	return models.Module{}, qmgo.ErrNoSuchDocuments
}

func (f *fakeModuleRepo) Upsert(context.Context, *models.Module) error { return nil }
func (f *fakeModuleRepo) TouchHeartbeat(context.Context, string, string, map[string]any, time.Time) (bool, error) {
	return false, nil
}
func (f *fakeModuleRepo) MarkDeregistered(context.Context, string, string, time.Time) (bool, error) {
	return false, nil
}
func (f *fakeModuleRepo) FindStaleRegistered(context.Context, time.Time, int64) ([]models.Module, error) {
	return nil, nil
}
func (f *fakeModuleRepo) MarkDead(context.Context, []string, time.Time) error { return nil }
func (f *fakeModuleRepo) ListActive(context.Context) ([]models.Module, error) { return nil, nil }

// fakeDeregistrar records calls and returns a scripted (found, err).
type fakeDeregistrar struct {
	found    bool
	err      error
	instance string
	reason   string
	actor    eventbus.Actor
	calls    int
}

func (f *fakeDeregistrar) Deregister(_ context.Context, instance, reason string, actor eventbus.Actor) (bool, error) {
	f.calls++
	f.instance = instance
	f.reason = reason
	f.actor = actor
	return f.found, f.err
}

func TestModules_PassesStatusFilterThrough(t *testing.T) {
	repo := &fakeModuleRepo{rows: []models.Module{
		{Instance: "http-1", Status: models.ModuleStatusRegistered},
		{Instance: "tg-1", Status: models.ModuleStatusDead},
	}}
	r := NewModuleResolver(repo, &fakeDeregistrar{})

	out, err := r.Modules(context.Background(), []string{models.ModuleStatusRegistered})
	if err != nil {
		t.Fatalf("Modules error: %v", err)
	}
	if len(out) != 1 || out[0].Instance != "http-1" {
		t.Fatalf("filtered list = %+v, want [http-1]", out)
	}
	if len(repo.lastStatus) != 1 || repo.lastStatus[0] != models.ModuleStatusRegistered {
		t.Errorf("status filter passed to repo = %v, want [registered]", repo.lastStatus)
	}
}

func TestModules_NilFilterReturnsAll(t *testing.T) {
	repo := &fakeModuleRepo{rows: []models.Module{
		{Instance: "http-1", Status: models.ModuleStatusRegistered},
		{Instance: "tg-1", Status: models.ModuleStatusDead},
	}}
	r := NewModuleResolver(repo, &fakeDeregistrar{})

	out, err := r.Modules(context.Background(), nil)
	if err != nil {
		t.Fatalf("Modules error: %v", err)
	}
	if len(out) != 2 {
		t.Fatalf("unfiltered list len = %d, want 2", len(out))
	}
}

func TestRemoveModule_DeregistersAndReturnsUpdatedRow(t *testing.T) {
	repo := &fakeModuleRepo{rows: []models.Module{
		{Instance: "http-1", Type: "channel", Status: models.ModuleStatusDeregistered},
	}}
	dereg := &fakeDeregistrar{found: true}
	r := NewModuleResolver(repo, dereg)

	mod, err := r.RemoveModule(adminCtx(uuid.New()), "http-1")
	if err != nil {
		t.Fatalf("RemoveModule error: %v", err)
	}
	if mod.Instance != "http-1" || mod.Status != models.ModuleStatusDeregistered {
		t.Errorf("returned row = %+v, want deregistered http-1", mod)
	}
	if dereg.calls != 1 || dereg.instance != "http-1" || dereg.reason != removeModuleReason {
		t.Errorf("deregistrar call = %+v", dereg)
	}
	// Admin removal must be attributed to the calling user, not the instance.
	if dereg.actor.Type != eventbus.ActorUser {
		t.Errorf("actor type = %q, want user", dereg.actor.Type)
	}
}

func TestRemoveModule_NotRegisteredIsError(t *testing.T) {
	dereg := &fakeDeregistrar{found: false}
	r := NewModuleResolver(&fakeModuleRepo{}, dereg)

	if _, err := r.RemoveModule(adminCtx(uuid.New()), "ghost"); err == nil {
		t.Fatal("expected error when instance is not currently registered")
	}
}

func TestRemoveModule_BlankInstanceRejectedBeforeDeregister(t *testing.T) {
	dereg := &fakeDeregistrar{found: true}
	r := NewModuleResolver(&fakeModuleRepo{}, dereg)

	if _, err := r.RemoveModule(adminCtx(uuid.New()), "   "); err == nil {
		t.Fatal("expected error for blank instance")
	}
	if dereg.calls != 0 {
		t.Errorf("deregistrar called %d times for blank instance, want 0", dereg.calls)
	}
}

func TestRemoveModule_PropagatesDeregisterError(t *testing.T) {
	dereg := &fakeDeregistrar{err: errors.New("mongo down")}
	r := NewModuleResolver(&fakeModuleRepo{}, dereg)

	if _, err := r.RemoveModule(adminCtx(uuid.New()), "http-1"); err == nil {
		t.Fatal("expected deregister error to propagate")
	}
}

func TestModuleFieldResolvers_FormatTimestamps(t *testing.T) {
	r := NewModuleResolver(&fakeModuleRepo{}, &fakeDeregistrar{})
	hb := time.Date(2026, 6, 27, 12, 0, 0, 0, time.UTC)
	mod := &models.Module{
		RegisteredAt:    time.Date(2026, 6, 27, 11, 0, 0, 0, time.UTC),
		LastHeartbeatAt: &hb,
	}

	reg, err := r.RegisteredAt(context.Background(), mod)
	if err != nil || reg != "2026-06-27T11:00:00Z" {
		t.Errorf("RegisteredAt = %q (err %v), want RFC3339", reg, err)
	}
	last, err := r.LastHeartbeatAt(context.Background(), mod)
	if err != nil || last == nil || *last != "2026-06-27T12:00:00Z" {
		t.Errorf("LastHeartbeatAt = %v (err %v)", last, err)
	}
	// Nil timestamps render as null.
	dead, err := r.DeclaredDeadAt(context.Background(), mod)
	if err != nil || dead != nil {
		t.Errorf("DeclaredDeadAt = %v, want nil", dead)
	}
}
