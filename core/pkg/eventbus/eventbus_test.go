package eventbus

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"go.uber.org/zap"
)

func newTestBus() *eventBus {
	return NewEventBus(zap.NewNop()).(*eventBus)
}

func TestPublishAndSubscribe(t *testing.T) {
	bus := newTestBus()
	received := make(chan Event, 1)

	bus.Subscribe([]Topic{TopicUserCreated}, func(ctx context.Context, e Event) {
		received <- e
	})
	bus.Start()
	defer bus.Stop(context.Background())

	bus.Publish(NewUserCreatedEvent(UserActor("user-123"), UserEventPayload{
		UserID: "user-123", Username: "alice",
	}))

	select {
	case e := <-received:
		if e.Topic != TopicUserCreated {
			t.Errorf("expected topic %s, got %s", TopicUserCreated, e.Topic)
		}
		if e.Actor.ID != "user-123" {
			t.Errorf("expected actor ID user-123, got %s", e.Actor.ID)
		}
		if e.Actor.Type != ActorUser {
			t.Errorf("expected actor type %s, got %s", ActorUser, e.Actor.Type)
		}
		p, ok := e.Payload.(UserEventPayload)
		if !ok {
			t.Fatalf("expected UserEventPayload, got %T", e.Payload)
		}
		if p.Username != "alice" {
			t.Errorf("expected username alice, got %s", p.Username)
		}
	case <-time.After(time.Second):
		t.Fatal("handler did not receive event within timeout")
	}
}

func TestEventID(t *testing.T) {
	e := NewEvent(TopicAuthLogin, UserActor("u1"), nil)
	if e.ID == "" {
		t.Error("event ID should not be empty")
	}

	e2 := NewEvent(TopicAuthLogin, UserActor("u1"), nil)
	if e.ID == e2.ID {
		t.Error("two events should have different IDs")
	}
}

func TestMultipleSubscribers(t *testing.T) {
	bus := newTestBus()
	var count atomic.Int32

	for range 3 {
		bus.Subscribe([]Topic{TopicUserCreated}, func(ctx context.Context, e Event) {
			count.Add(1)
		})
	}
	bus.Start()

	bus.Publish(NewUserCreatedEvent(SystemActor(), UserEventPayload{}))

	bus.Stop(context.Background())

	if got := count.Load(); got != 3 {
		t.Errorf("expected 3 handlers called, got %d", got)
	}
}

func TestTopicIsolation(t *testing.T) {
	bus := newTestBus()
	var called atomic.Bool

	bus.Subscribe([]Topic{TopicUserDeleted}, func(ctx context.Context, e Event) {
		called.Store(true)
	})
	bus.Start()

	bus.Publish(NewUserCreatedEvent(SystemActor(), UserEventPayload{}))

	bus.Stop(context.Background())

	if called.Load() {
		t.Error("handler for TopicUserDeleted should not be called for TopicUserCreated events")
	}
}

func TestPublishWithNoSubscribers(t *testing.T) {
	bus := newTestBus()
	bus.Start()

	// Should not panic or block
	bus.Publish(NewUserCreatedEvent(SystemActor(), UserEventPayload{}))

	bus.Stop(context.Background())
}

func TestChannelFullDropsEvent(t *testing.T) {
	bus := &eventBus{
		logger:     zap.NewNop(),
		ch:         make(chan Event, 1),
		dispatched: make(chan struct{}),
	}

	bus.Publish(NewUserCreatedEvent(SystemActor(), UserEventPayload{UserID: "first"}))
	bus.Publish(NewUserCreatedEvent(SystemActor(), UserEventPayload{UserID: "second"}))

	if len(bus.ch) != 1 {
		t.Errorf("expected 1 event in channel, got %d", len(bus.ch))
	}
}

func TestHandlerPanicRecovery(t *testing.T) {
	bus := newTestBus()
	var safeHandlerCalled atomic.Bool

	bus.Subscribe([]Topic{TopicUserCreated}, func(ctx context.Context, e Event) {
		panic("test panic")
	})

	bus.Subscribe([]Topic{TopicUserCreated}, func(ctx context.Context, e Event) {
		safeHandlerCalled.Store(true)
	})

	bus.Start()
	bus.Publish(NewUserCreatedEvent(SystemActor(), UserEventPayload{}))
	bus.Stop(context.Background())

	if !safeHandlerCalled.Load() {
		t.Error("safe handler should still be called even if another handler panics")
	}
}

func TestGracefulShutdownDrain(t *testing.T) {
	bus := newTestBus()
	var processed atomic.Int32

	bus.Subscribe([]Topic{TopicUserCreated}, func(ctx context.Context, e Event) {
		time.Sleep(10 * time.Millisecond)
		processed.Add(1)
	})
	bus.Start()

	for range 5 {
		bus.Publish(NewUserCreatedEvent(SystemActor(), UserEventPayload{}))
	}

	bus.Stop(context.Background())

	if got := processed.Load(); got != 5 {
		t.Errorf("expected 5 events processed before shutdown, got %d", got)
	}
}

func TestConcurrentPublish(t *testing.T) {
	bus := newTestBus()
	var count atomic.Int32

	bus.Subscribe([]Topic{TopicUserCreated}, func(ctx context.Context, e Event) {
		count.Add(1)
	})
	bus.Start()

	var wg sync.WaitGroup
	for range 100 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			bus.Publish(NewUserCreatedEvent(UserActor("user-1"), UserEventPayload{}))
		}()
	}
	wg.Wait()

	bus.Stop(context.Background())

	if got := count.Load(); got != 100 {
		t.Errorf("expected 100 events processed, got %d", got)
	}
}

func TestActorConstructors(t *testing.T) {
	user := UserActor("abc-123")
	if user.ID != "abc-123" || user.Type != ActorUser {
		t.Errorf("unexpected user actor: %+v", user)
	}

	system := SystemActor()
	if system.ID != "" || system.Type != ActorSystem {
		t.Errorf("unexpected system actor: %+v", system)
	}

	service := ServiceActor("worker")
	if service.ID != "worker" || service.Type != ActorService {
		t.Errorf("unexpected service actor: %+v", service)
	}
}

func TestNewEvent(t *testing.T) {
	before := time.Now().UTC()
	e := NewEvent(TopicAuthLogin, UserActor("u1"), map[string]string{"key": "val"})
	after := time.Now().UTC()

	if e.Topic != TopicAuthLogin {
		t.Errorf("expected topic %s, got %s", TopicAuthLogin, e.Topic)
	}
	if e.Timestamp.Before(before) || e.Timestamp.After(after) {
		t.Error("event timestamp should be between before and after")
	}
}

func TestPublishAfterStopDropsEvent(t *testing.T) {
	bus := newTestBus()
	var count atomic.Int32

	bus.Subscribe([]Topic{TopicUserCreated}, func(ctx context.Context, e Event) {
		count.Add(1)
	})
	bus.Start()
	bus.Stop(context.Background())

	// Should not panic — event is dropped via recover
	bus.Publish(NewUserCreatedEvent(SystemActor(), UserEventPayload{}))

	if count.Load() != 0 {
		t.Error("handler should not be called after stop")
	}
}

func TestNopEventBus(t *testing.T) {
	bus := NewNopEventBus()

	unsub := bus.Subscribe([]Topic{TopicUserCreated}, func(ctx context.Context, e Event) {
		t.Error("nop bus should never call handlers")
	})
	bus.Start()
	bus.Publish(NewUserCreatedEvent(SystemActor(), UserEventPayload{}))
	bus.Stop(context.Background())
	unsub() // should not panic
}

func TestPerSubscriberIsolation(t *testing.T) {
	bus := newTestBus()

	// Slow subscriber on TopicUserCreated — blocks until released
	slowDone := make(chan struct{})
	bus.Subscribe([]Topic{TopicUserCreated}, func(ctx context.Context, e Event) {
		<-slowDone
	})

	// Fast subscriber on TopicUserUpdated
	fastReceived := make(chan struct{}, 1)
	bus.Subscribe([]Topic{TopicUserUpdated}, func(ctx context.Context, e Event) {
		fastReceived <- struct{}{}
	})

	bus.Start()

	bus.Publish(NewUserCreatedEvent(SystemActor(), UserEventPayload{}))
	time.Sleep(10 * time.Millisecond)

	bus.Publish(NewUserUpdatedEvent(SystemActor(), UserEventPayload{}))

	select {
	case <-fastReceived:
		// Success: fast subscriber was not blocked by slow subscriber
	case <-time.After(time.Second):
		t.Fatal("fast subscriber was blocked by slow subscriber on different topic")
	}

	close(slowDone)
	bus.Stop(context.Background())
}

func TestDoubleStartSafe(t *testing.T) {
	bus := newTestBus()
	var count atomic.Int32

	bus.Subscribe([]Topic{TopicUserCreated}, func(ctx context.Context, e Event) {
		count.Add(1)
	})

	bus.Start()
	bus.Start() // should be no-op

	bus.Publish(NewUserCreatedEvent(SystemActor(), UserEventPayload{}))
	bus.Stop(context.Background())

	if got := count.Load(); got != 1 {
		t.Errorf("expected 1 handler call, got %d", got)
	}
}

func TestDoubleStopSafe(t *testing.T) {
	bus := newTestBus()
	bus.Start()

	bus.Stop(context.Background())
	bus.Stop(context.Background())
}

// --- New tests for multi-topic and filter support ---

func TestMultiTopicSubscriber(t *testing.T) {
	bus := newTestBus()
	var received atomic.Int32

	// One subscriber covering 3 topics — should use 1 goroutine + 1 channel
	bus.Subscribe([]Topic{
		TopicUserCreated, TopicUserUpdated, TopicUserDeleted,
	}, func(ctx context.Context, e Event) {
		received.Add(1)
	})

	bus.Start()

	bus.Publish(NewUserCreatedEvent(SystemActor(), UserEventPayload{}))
	bus.Publish(NewUserUpdatedEvent(SystemActor(), UserEventPayload{}))
	bus.Publish(NewUserDeletedEvent(SystemActor(), UserDeletedPayload{}))
	// This should NOT be received (different topic)
	bus.Publish(NewOperationCreatedEvent(SystemActor(), OperationEventPayload{}))

	bus.Stop(context.Background())

	if got := received.Load(); got != 3 {
		t.Errorf("expected 3 events from multi-topic subscriber, got %d", got)
	}
}

func TestFilteredSubscription(t *testing.T) {
	bus := newTestBus()
	var received atomic.Int32

	targetOpID := "op-42"

	// Subscribe to operation events but only for a specific operation
	bus.Subscribe(
		[]Topic{TopicOperationUpdated, TopicOperationMemberAdded},
		func(ctx context.Context, e Event) {
			received.Add(1)
		},
		func(e Event) bool {
			switch p := e.Payload.(type) {
			case OperationEventPayload:
				return p.OperationID == targetOpID
			case OperationMemberPayload:
				return p.OperationID == targetOpID
			}
			return false
		},
	)

	bus.Start()

	// Should pass filter
	bus.Publish(NewOperationUpdatedEvent(SystemActor(), OperationEventPayload{
		OperationID: targetOpID, Name: "Red Dawn",
	}))
	// Should pass filter
	bus.Publish(NewOperationMemberAddedEvent(SystemActor(), OperationMemberPayload{
		OperationID: targetOpID, MemberID: "user-1",
	}))
	// Should NOT pass filter (different operation)
	bus.Publish(NewOperationUpdatedEvent(SystemActor(), OperationEventPayload{
		OperationID: "op-99", Name: "Other Op",
	}))
	// Should NOT match topics at all
	bus.Publish(NewUserCreatedEvent(SystemActor(), UserEventPayload{}))

	bus.Stop(context.Background())

	if got := received.Load(); got != 2 {
		t.Errorf("expected 2 filtered events, got %d", got)
	}
}

func TestUnsubscribe(t *testing.T) {
	bus := newTestBus()
	var count1, count2 atomic.Int32

	unsub := bus.Subscribe([]Topic{TopicUserCreated}, func(ctx context.Context, e Event) {
		count1.Add(1)
	})
	bus.Subscribe([]Topic{TopicUserCreated}, func(ctx context.Context, e Event) {
		count2.Add(1)
	})

	bus.Start()

	// Both should receive this
	bus.Publish(NewUserCreatedEvent(SystemActor(), UserEventPayload{}))
	time.Sleep(50 * time.Millisecond)

	// Unsubscribe first handler
	unsub()
	time.Sleep(10 * time.Millisecond)

	// Only second should receive this
	bus.Publish(NewUserCreatedEvent(SystemActor(), UserEventPayload{}))

	bus.Stop(context.Background())

	if got := count1.Load(); got != 1 {
		t.Errorf("expected unsubscribed handler to receive 1 event, got %d", got)
	}
	if got := count2.Load(); got != 2 {
		t.Errorf("expected remaining handler to receive 2 events, got %d", got)
	}
}

func TestSubscriberBufferFullDropsForThatSubscriberOnly(t *testing.T) {
	bus := newTestBus()

	// Subscriber that blocks forever (will fill its buffer)
	blockCh := make(chan struct{})
	bus.Subscribe([]Topic{TopicUserCreated}, func(ctx context.Context, e Event) {
		<-blockCh
	})

	// Subscriber that counts received events
	var received atomic.Int32
	bus.Subscribe([]Topic{TopicUserCreated}, func(ctx context.Context, e Event) {
		received.Add(1)
	})

	bus.Start()

	for range defaultSubscriberBufferSize + 20 {
		bus.Publish(NewUserCreatedEvent(SystemActor(), UserEventPayload{}))
	}

	time.Sleep(200 * time.Millisecond)

	got := received.Load()
	if got == 0 {
		t.Error("fast subscriber should have received events despite slow subscriber")
	}

	close(blockCh)
	bus.Stop(context.Background())
}
