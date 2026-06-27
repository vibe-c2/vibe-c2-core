package repository

import (
	"testing"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.mongodb.org/mongo-driver/v2/bson"
)

func TestRegisteredInstanceFilter_ScopesToRegistered(t *testing.T) {
	f := registeredInstanceFilter("http-1")
	if f["instance"] != "http-1" {
		t.Errorf("instance = %v, want http-1", f["instance"])
	}
	if f["status"] != models.ModuleStatusRegistered {
		t.Errorf("status = %v, want %q", f["status"], models.ModuleStatusRegistered)
	}
}

func TestHeartbeatUpdate_OmitsEmptyStatusAndNilMetrics(t *testing.T) {
	at := time.Unix(1000, 0).UTC()

	full := heartbeatUpdate("healthy", map[string]any{"x": 1}, at)
	set := full["$set"].(bson.M)
	if set["last_heartbeat_at"] != at {
		t.Errorf("last_heartbeat_at = %v, want %v", set["last_heartbeat_at"], at)
	}
	if set["last_status"] != "healthy" {
		t.Errorf("last_status = %v, want healthy", set["last_status"])
	}
	if _, ok := set["last_metrics"]; !ok {
		t.Error("expected last_metrics to be set")
	}

	bare := heartbeatUpdate("", nil, at)["$set"].(bson.M)
	if _, ok := bare["last_status"]; ok {
		t.Error("empty status should not be written")
	}
	if _, ok := bare["last_metrics"]; ok {
		t.Error("nil metrics should not be written")
	}
	if bare["last_heartbeat_at"] != at {
		t.Error("last_heartbeat_at must always be written")
	}
}

func TestDeregisterUpdate_Shape(t *testing.T) {
	at := time.Unix(2000, 0).UTC()
	set := deregisterUpdate("shutdown", at)["$set"].(bson.M)
	if set["status"] != models.ModuleStatusDeregistered {
		t.Errorf("status = %v, want deregistered", set["status"])
	}
	if set["deregister_reason"] != "shutdown" {
		t.Errorf("reason = %v, want shutdown", set["deregister_reason"])
	}
	if set["deregistered_at"] != at {
		t.Errorf("deregistered_at = %v, want %v", set["deregistered_at"], at)
	}
}

func TestMarkDeadUpdate_Shape(t *testing.T) {
	at := time.Unix(3000, 0).UTC()
	set := markDeadUpdate(at)["$set"].(bson.M)
	if set["status"] != models.ModuleStatusDead {
		t.Errorf("status = %v, want dead", set["status"])
	}
	if set["declared_dead_at"] != at {
		t.Errorf("declared_dead_at = %v, want %v", set["declared_dead_at"], at)
	}
}

func TestTakeoverUpdate_RevivesByUnsettingEndState(t *testing.T) {
	reg := &models.Module{
		Type:         "channel",
		Instance:     "http-1",
		Version:      "1.2.0",
		RPCQueue:     "vibe.channel.rpc.http-1",
		RegisteredAt: time.Unix(4000, 0).UTC(),
	}
	u := takeoverUpdate(reg)

	set := u["$set"].(bson.M)
	if set["status"] != models.ModuleStatusRegistered {
		t.Errorf("status = %v, want registered", set["status"])
	}
	if set["rpc_queue"] != "vibe.channel.rpc.http-1" {
		t.Errorf("rpc_queue = %v", set["rpc_queue"])
	}

	unset := u["$unset"].(bson.M)
	for _, k := range []string{"deregistered_at", "deregister_reason", "declared_dead_at", "last_heartbeat_at", "last_status", "last_metrics"} {
		if _, ok := unset[k]; !ok {
			t.Errorf("expected %q to be unset on takeover", k)
		}
	}
}

func TestListFilter_EmptyMatchesAll(t *testing.T) {
	if f := listFilter(nil); len(f) != 0 {
		t.Errorf("nil statuses → %v, want empty filter (all rows)", f)
	}
	if f := listFilter([]string{}); len(f) != 0 {
		t.Errorf("empty statuses → %v, want empty filter (all rows)", f)
	}
}

func TestListFilter_ScopesToStatuses(t *testing.T) {
	f := listFilter([]string{models.ModuleStatusRegistered, models.ModuleStatusDead})
	cond, ok := f["status"].(bson.M)
	if !ok {
		t.Fatalf("status condition = %T, want bson.M", f["status"])
	}
	in, ok := cond["$in"].([]string)
	if !ok || len(in) != 2 {
		t.Fatalf("$in = %v, want 2-element string slice", cond["$in"])
	}
	if in[0] != models.ModuleStatusRegistered || in[1] != models.ModuleStatusDead {
		t.Errorf("$in = %v, want [registered dead]", in)
	}
}

func TestStaleRegisteredFilter_UsesIfNullFallback(t *testing.T) {
	cutoff := time.Unix(5000, 0).UTC()
	f := staleRegisteredFilter(cutoff)

	if f["status"] != models.ModuleStatusRegistered {
		t.Errorf("status = %v, want registered", f["status"])
	}
	expr, ok := f["$expr"].(bson.M)
	if !ok {
		t.Fatalf("$expr missing or wrong type: %T", f["$expr"])
	}
	lt, ok := expr["$lt"].(bson.A)
	if !ok || len(lt) != 2 {
		t.Fatalf("$lt = %v, want 2-element array", expr["$lt"])
	}
	ifNull, ok := lt[0].(bson.M)
	if !ok {
		t.Fatalf("expected $ifNull operand, got %T", lt[0])
	}
	args, ok := ifNull["$ifNull"].(bson.A)
	if !ok || args[0] != "$last_heartbeat_at" || args[1] != "$registered_at" {
		t.Errorf("$ifNull args = %v, want [$last_heartbeat_at $registered_at]", ifNull["$ifNull"])
	}
	if lt[1] != cutoff {
		t.Errorf("cutoff operand = %v, want %v", lt[1], cutoff)
	}
}
