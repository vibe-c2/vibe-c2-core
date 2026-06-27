package lifecycle

import (
	"context"
	"testing"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.uber.org/zap"
)

// fixedClock returns a deterministic "now" for reaper tests.
func fixedClock(t time.Time) func() time.Time {
	return func() time.Time { return t }
}

func TestReaper_MarksStaleDeadAndEmits(t *testing.T) {
	now := time.Date(2026, 6, 27, 12, 0, 0, 0, time.UTC)
	grace := 90 * time.Second

	repo := newFakeRepo()
	// Stale: last heartbeat 2 minutes ago (> 90s grace).
	staleHB := now.Add(-2 * time.Minute)
	repo.rows["stale-1"] = &models.Module{
		Type: "channel", Instance: "stale-1", Status: models.ModuleStatusRegistered,
		RegisteredAt: now.Add(-time.Hour), LastHeartbeatAt: &staleHB,
	}
	// Fresh: heartbeat 10s ago (< grace) → must survive.
	freshHB := now.Add(-10 * time.Second)
	repo.rows["fresh-1"] = &models.Module{
		Type: "channel", Instance: "fresh-1", Status: models.ModuleStatusRegistered,
		RegisteredAt: now.Add(-time.Hour), LastHeartbeatAt: &freshHB,
	}

	emitter := &fakeEmitter{}
	reaper := NewReaper(repo, emitter, time.Minute, grace, zap.NewNop())
	reaper.now = fixedClock(now)

	reaper.RunTick(context.Background())

	if repo.rows["stale-1"].Status != models.ModuleStatusDead {
		t.Errorf("stale-1 status = %q, want dead", repo.rows["stale-1"].Status)
	}
	if repo.rows["stale-1"].DeclaredDeadAt == nil {
		t.Error("stale-1 declared_dead_at not set")
	}
	if repo.rows["fresh-1"].Status != models.ModuleStatusRegistered {
		t.Errorf("fresh-1 status = %q, want registered (survives)", repo.rows["fresh-1"].Status)
	}

	if len(emitter.events) != 1 || emitter.events[0].routingKey != "channel.stale-1.declared_dead" {
		t.Errorf("events = %+v, want one channel.stale-1.declared_dead", emitter.events)
	}
}

func TestReaper_NeverHeartbeatedUsesRegisteredAt(t *testing.T) {
	now := time.Date(2026, 6, 27, 12, 0, 0, 0, time.UTC)
	grace := 90 * time.Second

	repo := newFakeRepo()
	// Registered 5 minutes ago, never beat → stale by registered_at fallback.
	repo.rows["silent-1"] = &models.Module{
		Type: "channel", Instance: "silent-1", Status: models.ModuleStatusRegistered,
		RegisteredAt: now.Add(-5 * time.Minute),
	}

	reaper := NewReaper(repo, &fakeEmitter{}, time.Minute, grace, zap.NewNop())
	reaper.now = fixedClock(now)
	reaper.RunTick(context.Background())

	if repo.rows["silent-1"].Status != models.ModuleStatusDead {
		t.Errorf("silent-1 status = %q, want dead", repo.rows["silent-1"].Status)
	}
}

func TestReaper_NoStaleIsNoop(t *testing.T) {
	now := time.Date(2026, 6, 27, 12, 0, 0, 0, time.UTC)
	repo := newFakeRepo()
	hb := now.Add(-time.Second)
	repo.rows["fresh"] = &models.Module{
		Instance: "fresh", Status: models.ModuleStatusRegistered,
		RegisteredAt: now.Add(-time.Hour), LastHeartbeatAt: &hb,
	}
	emitter := &fakeEmitter{}
	reaper := NewReaper(repo, emitter, time.Minute, 90*time.Second, zap.NewNop())
	reaper.now = fixedClock(now)

	reaper.RunTick(context.Background())

	if repo.rows["fresh"].Status != models.ModuleStatusRegistered {
		t.Error("fresh instance should not be reaped")
	}
	if len(emitter.events) != 0 {
		t.Errorf("no events expected, got %+v", emitter.events)
	}
}
