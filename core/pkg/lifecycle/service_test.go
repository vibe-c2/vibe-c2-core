package lifecycle

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/qiniu/qmgo"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/messaging"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.uber.org/zap"
)

// fakeRepo is an in-memory IModuleRegistryRepository for handler tests.
type fakeRepo struct {
	rows map[string]*models.Module

	upsertErr    error
	heartbeatErr error
	deregErr     error
}

func newFakeRepo() *fakeRepo {
	return &fakeRepo{rows: make(map[string]*models.Module)}
}

func (f *fakeRepo) Upsert(_ context.Context, reg *models.Module) error {
	if f.upsertErr != nil {
		return f.upsertErr
	}
	reg.Status = models.ModuleStatusRegistered
	reg.DeregisteredAt = nil
	reg.DeclaredDeadAt = nil
	cp := *reg
	f.rows[reg.Instance] = &cp
	return nil
}

func (f *fakeRepo) TouchHeartbeat(_ context.Context, instance, status string, metrics map[string]any, at time.Time) (bool, error) {
	if f.heartbeatErr != nil {
		return false, f.heartbeatErr
	}
	row, ok := f.rows[instance]
	if !ok || row.Status != models.ModuleStatusRegistered {
		return false, nil
	}
	row.LastStatus = status
	row.LastMetrics = metrics
	row.LastHeartbeatAt = &at
	return true, nil
}

func (f *fakeRepo) MarkDeregistered(_ context.Context, instance, reason string, at time.Time) (bool, error) {
	if f.deregErr != nil {
		return false, f.deregErr
	}
	row, ok := f.rows[instance]
	if !ok || row.Status != models.ModuleStatusRegistered {
		return false, nil
	}
	row.Status = models.ModuleStatusDeregistered
	row.DeregisterReason = reason
	row.DeregisteredAt = &at
	return true, nil
}

func (f *fakeRepo) FindStaleRegistered(_ context.Context, cutoff time.Time, limit int64) ([]models.Module, error) {
	var out []models.Module
	for _, row := range f.rows {
		if row.Status != models.ModuleStatusRegistered {
			continue
		}
		last := row.RegisteredAt
		if row.LastHeartbeatAt != nil {
			last = *row.LastHeartbeatAt
		}
		if last.Before(cutoff) {
			out = append(out, *row)
		}
	}
	return out, nil
}

func (f *fakeRepo) MarkDead(_ context.Context, instances []string, at time.Time) error {
	for _, inst := range instances {
		if row, ok := f.rows[inst]; ok && row.Status == models.ModuleStatusRegistered {
			row.Status = models.ModuleStatusDead
			row.DeclaredDeadAt = &at
		}
	}
	return nil
}

func (f *fakeRepo) FindByInstance(_ context.Context, instance string) (models.Module, error) {
	row, ok := f.rows[instance]
	if !ok {
		return models.Module{}, qmgo.ErrNoSuchDocuments
	}
	return *row, nil
}

func (f *fakeRepo) ListActive(_ context.Context) ([]models.Module, error) {
	var out []models.Module
	for _, row := range f.rows {
		if row.Status == models.ModuleStatusRegistered {
			out = append(out, *row)
		}
	}
	return out, nil
}

func (f *fakeRepo) List(_ context.Context, statuses []string) ([]models.Module, error) {
	want := make(map[string]struct{}, len(statuses))
	for _, s := range statuses {
		want[s] = struct{}{}
	}
	var out []models.Module
	for _, row := range f.rows {
		if len(want) > 0 {
			if _, ok := want[row.Status]; !ok {
				continue
			}
		}
		out = append(out, *row)
	}
	return out, nil
}

// fakeEmitter records published events.
type fakeEmitter struct {
	events []emitted
	err    error
}

type emitted struct {
	routingKey string
	env        messaging.Envelope
}

func (e *fakeEmitter) Publish(_ context.Context, routingKey string, env messaging.Envelope) error {
	if e.err != nil {
		return e.err
	}
	e.events = append(e.events, emitted{routingKey: routingKey, env: env})
	return nil
}

func newTestService() (*Service, *fakeRepo, *fakeEmitter) {
	repo := newFakeRepo()
	emitter := &fakeEmitter{}
	svc := NewService(repo, emitter, nil, nil, Config{
		HeartbeatInterval:    30 * time.Second,
		HeartbeatGraceMisses: 3,
	}, zap.NewNop())
	return svc, repo, emitter
}

// fakeInvalidator records gate cache-busting calls.
type fakeInvalidator struct {
	instances []string
}

func (f *fakeInvalidator) Invalidate(_ context.Context, instance string) {
	f.instances = append(f.instances, instance)
}

// fakePublisher records events fanned out to the in-process event bus.
type fakePublisher struct {
	events []eventbus.Event
}

func (p *fakePublisher) Publish(ev eventbus.Event) {
	p.events = append(p.events, ev)
}

func envFor(t *testing.T, opType string, payload any) messaging.Envelope {
	t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	return messaging.Envelope{Type: opType, Version: "1.0", Payload: raw}
}

func TestHandleRegister_NewInstance(t *testing.T) {
	svc, repo, emitter := newTestService()

	out, err := svc.HandleRegister(context.Background(), envFor(t, OpRegister, registerRequest{
		ModuleType: "channel",
		ModuleName: "http",
		Instance:   "http-1",
		Version:    "1.2.0",
		RPCQueue:   "vibe.channel.rpc.http-1",
	}))
	if err != nil {
		t.Fatalf("HandleRegister error: %v", err)
	}

	reply := out.(registerReply)
	if !reply.Registered || reply.Instance != "http-1" {
		t.Errorf("reply = %+v", reply)
	}
	if row := repo.rows["http-1"]; row == nil || row.Name != "http" {
		t.Errorf("module_name not persisted: %+v", row)
	}
	if reply.HeartbeatIntervalSeconds != 30 || reply.HeartbeatGraceMisses != 3 {
		t.Errorf("bootstrap config = %d/%d, want 30/3", reply.HeartbeatIntervalSeconds, reply.HeartbeatGraceMisses)
	}
	if reply.Config.Policy == nil || reply.Config.FeatureFlags == nil {
		t.Error("policy/feature_flags must serialize as objects, not null")
	}
	if _, ok := repo.rows["http-1"]; !ok {
		t.Error("registration not persisted")
	}
	if len(emitter.events) != 1 || emitter.events[0].routingKey != "channel.http-1.registered" {
		t.Errorf("events = %+v, want one channel.http-1.registered", emitter.events)
	}
}

func TestHandleRegister_IdempotentTakeoverRevivesDead(t *testing.T) {
	svc, repo, _ := newTestService()
	dead := time.Now().Add(-time.Hour)
	repo.rows["http-1"] = &models.Module{
		Type: "channel", Instance: "http-1", Status: models.ModuleStatusDead,
		DeclaredDeadAt: &dead,
	}

	_, err := svc.HandleRegister(context.Background(), envFor(t, OpRegister, registerRequest{
		ModuleType: "channel", ModuleName: "http", Instance: "http-1", RPCQueue: "q",
	}))
	if err != nil {
		t.Fatalf("takeover register error: %v", err)
	}
	row := repo.rows["http-1"]
	if row.Status != models.ModuleStatusRegistered {
		t.Errorf("status = %q, want registered after takeover", row.Status)
	}
	if row.DeclaredDeadAt != nil {
		t.Error("declared_dead_at should be cleared on takeover")
	}
}

func TestHandleRegister_ValidationFailed(t *testing.T) {
	svc, _, _ := newTestService()
	_, err := svc.HandleRegister(context.Background(), envFor(t, OpRegister, registerRequest{
		ModuleType: "channel", // missing instance + rpc_queue
	}))
	assertRPCCode(t, err, messaging.CodeValidationFailed)
}

func TestHandleHeartbeat_OK(t *testing.T) {
	svc, repo, _ := newTestService()
	repo.rows["http-1"] = &models.Module{
		Instance: "http-1", Status: models.ModuleStatusRegistered, RegisteredAt: time.Now(),
	}

	out, err := svc.HandleHeartbeat(context.Background(), envFor(t, OpHeartbeat, heartbeatRequest{
		Instance: "http-1", Status: "healthy",
	}))
	if err != nil {
		t.Fatalf("heartbeat error: %v", err)
	}
	reply := out.(heartbeatReply)
	if !reply.Ack || reply.ConfigChanged {
		t.Errorf("reply = %+v", reply)
	}
	if repo.rows["http-1"].LastHeartbeatAt == nil {
		t.Error("last_heartbeat_at not updated")
	}
}

func TestHandleHeartbeat_UnknownInstance(t *testing.T) {
	svc, _, _ := newTestService()
	_, err := svc.HandleHeartbeat(context.Background(), envFor(t, OpHeartbeat, heartbeatRequest{Instance: "ghost"}))
	assertRPCCode(t, err, messaging.CodeUnknownInstance)
}

func TestHandleHeartbeat_DeadInstanceIsUnknown(t *testing.T) {
	svc, repo, _ := newTestService()
	repo.rows["http-1"] = &models.Module{Instance: "http-1", Status: models.ModuleStatusDead}
	_, err := svc.HandleHeartbeat(context.Background(), envFor(t, OpHeartbeat, heartbeatRequest{Instance: "http-1"}))
	assertRPCCode(t, err, messaging.CodeUnknownInstance)
}

func TestHandleDeregister_OK(t *testing.T) {
	svc, repo, emitter := newTestService()
	repo.rows["http-1"] = &models.Module{
		Type: "channel", Instance: "http-1", Status: models.ModuleStatusRegistered,
	}

	out, err := svc.HandleDeregister(context.Background(), envFor(t, OpDeregister, deregisterRequest{
		Instance: "http-1", Reason: "shutdown",
	}))
	if err != nil {
		t.Fatalf("deregister error: %v", err)
	}
	reply := out.(deregisterReply)
	if !reply.Deregistered {
		t.Errorf("reply = %+v", reply)
	}
	if repo.rows["http-1"].Status != models.ModuleStatusDeregistered {
		t.Error("status not set to deregistered")
	}
	if len(emitter.events) != 1 || emitter.events[0].routingKey != "channel.http-1.deregistered" {
		t.Errorf("events = %+v, want channel.http-1.deregistered", emitter.events)
	}
}

func TestHandleDeregister_UnknownInstance(t *testing.T) {
	svc, _, _ := newTestService()
	_, err := svc.HandleDeregister(context.Background(), envFor(t, OpDeregister, deregisterRequest{Instance: "ghost"}))
	assertRPCCode(t, err, messaging.CodeUnknownInstance)
}

func TestHandleDeregister_InvalidatesGate(t *testing.T) {
	repo := newFakeRepo()
	inv := &fakeInvalidator{}
	svc := NewService(repo, &fakeEmitter{}, inv, nil, Config{}, zap.NewNop())
	repo.rows["http-1"] = &models.Module{
		Type: "channel", Instance: "http-1", Status: models.ModuleStatusRegistered,
	}

	if _, err := svc.HandleDeregister(context.Background(), envFor(t, OpDeregister, deregisterRequest{
		Instance: "http-1", Reason: "shutdown",
	})); err != nil {
		t.Fatalf("deregister error: %v", err)
	}
	if len(inv.instances) != 1 || inv.instances[0] != "http-1" {
		t.Errorf("invalidated = %v, want [http-1]", inv.instances)
	}

	// An unknown instance must not bust the cache.
	inv.instances = nil
	_, _ = svc.HandleDeregister(context.Background(), envFor(t, OpDeregister, deregisterRequest{Instance: "ghost"}))
	if len(inv.instances) != 0 {
		t.Errorf("invalidated on unknown instance = %v, want none", inv.instances)
	}
}

func TestHandleRegister_PublishesBusEvent(t *testing.T) {
	repo := newFakeRepo()
	pub := &fakePublisher{}
	svc := NewService(repo, &fakeEmitter{}, nil, pub, Config{}, zap.NewNop())

	if _, err := svc.HandleRegister(context.Background(), envFor(t, OpRegister, registerRequest{
		ModuleType: "channel", ModuleName: "http", Instance: "http-1", RPCQueue: "q",
	})); err != nil {
		t.Fatalf("register error: %v", err)
	}

	if len(pub.events) != 1 {
		t.Fatalf("published %d bus events, want 1", len(pub.events))
	}
	ev := pub.events[0]
	if ev.Topic != eventbus.TopicModuleRegistered {
		t.Errorf("topic = %q, want %q", ev.Topic, eventbus.TopicModuleRegistered)
	}
	p, ok := ev.Payload.(eventbus.ModuleEventPayload)
	if !ok {
		t.Fatalf("payload type = %T, want ModuleEventPayload", ev.Payload)
	}
	if p.Instance != "http-1" || p.Type != "channel" || p.Status != models.ModuleStatusRegistered {
		t.Errorf("payload = %+v", p)
	}
}

func TestHandleDeregister_PublishesBusEvent(t *testing.T) {
	repo := newFakeRepo()
	pub := &fakePublisher{}
	svc := NewService(repo, &fakeEmitter{}, nil, pub, Config{}, zap.NewNop())
	repo.rows["http-1"] = &models.Module{
		Type: "channel", Instance: "http-1", Status: models.ModuleStatusRegistered,
	}

	if _, err := svc.HandleDeregister(context.Background(), envFor(t, OpDeregister, deregisterRequest{
		Instance: "http-1", Reason: "shutdown",
	})); err != nil {
		t.Fatalf("deregister error: %v", err)
	}

	if len(pub.events) != 1 {
		t.Fatalf("published %d bus events, want 1", len(pub.events))
	}
	ev := pub.events[0]
	if ev.Topic != eventbus.TopicModuleDeregistered {
		t.Errorf("topic = %q, want %q", ev.Topic, eventbus.TopicModuleDeregistered)
	}
	p, _ := ev.Payload.(eventbus.ModuleEventPayload)
	if p.Instance != "http-1" || p.Status != models.ModuleStatusDeregistered {
		t.Errorf("payload = %+v", p)
	}

	// An unknown instance must not publish.
	pub.events = nil
	_, _ = svc.HandleDeregister(context.Background(), envFor(t, OpDeregister, deregisterRequest{Instance: "ghost"}))
	if len(pub.events) != 0 {
		t.Errorf("published on unknown instance = %+v, want none", pub.events)
	}
}

func TestDeregister_UsesProvidedActorAndBustsGate(t *testing.T) {
	repo := newFakeRepo()
	inv := &fakeInvalidator{}
	pub := &fakePublisher{}
	svc := NewService(repo, &fakeEmitter{}, inv, pub, Config{}, zap.NewNop())
	repo.rows["http-1"] = &models.Module{
		Type: "channel", Instance: "http-1", Status: models.ModuleStatusRegistered,
	}

	// The GraphQL removeModule path passes a user actor.
	found, err := svc.Deregister(context.Background(), "http-1", "removed by admin",
		eventbus.UserActor("admin-uid"))
	if err != nil || !found {
		t.Fatalf("Deregister found=%v err=%v, want true/nil", found, err)
	}
	if repo.rows["http-1"].Status != models.ModuleStatusDeregistered {
		t.Error("status not set to deregistered")
	}
	if len(inv.instances) != 1 || inv.instances[0] != "http-1" {
		t.Errorf("gate invalidated = %v, want [http-1]", inv.instances)
	}
	if len(pub.events) != 1 {
		t.Fatalf("published %d bus events, want 1", len(pub.events))
	}
	if pub.events[0].Actor.Type != eventbus.ActorUser || pub.events[0].Actor.ID != "admin-uid" {
		t.Errorf("event actor = %+v, want user/admin-uid", pub.events[0].Actor)
	}

	// Unknown instance → not found, no error, nothing fanned out.
	inv.instances, pub.events = nil, nil
	found, err = svc.Deregister(context.Background(), "ghost", "x", eventbus.SystemActor())
	if err != nil || found {
		t.Errorf("Deregister(ghost) found=%v err=%v, want false/nil", found, err)
	}
	if len(inv.instances) != 0 || len(pub.events) != 0 {
		t.Errorf("unknown instance fanned out: inv=%v pub=%v", inv.instances, pub.events)
	}
}

func TestHandleRegister_PersistErrorIsInternal(t *testing.T) {
	svc, repo, _ := newTestService()
	repo.upsertErr = errors.New("mongo down")
	_, err := svc.HandleRegister(context.Background(), envFor(t, OpRegister, registerRequest{
		ModuleType: "channel", ModuleName: "http", Instance: "http-1", RPCQueue: "q",
	}))
	// Not an RPCError → server maps to internal_error.
	var rpcErr *messaging.RPCError
	if errors.As(err, &rpcErr) {
		t.Fatalf("expected a plain error (→ internal_error), got RPCError %v", rpcErr)
	}
	if err == nil {
		t.Fatal("expected error")
	}
}

func assertRPCCode(t *testing.T, err error, code string) {
	t.Helper()
	var rpcErr *messaging.RPCError
	if !errors.As(err, &rpcErr) {
		t.Fatalf("expected *messaging.RPCError with code %q, got %v", code, err)
	}
	if rpcErr.Code != code {
		t.Fatalf("error code = %q, want %q", rpcErr.Code, code)
	}
}
