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

	bus.Subscribe(TopicUserCreated, func(ctx context.Context, e Event) {
		received <- e
	})
	bus.Start()
	defer bus.Stop(context.Background())

	bus.Publish(NewEvent(TopicUserCreated, UserActor("user-123"), "test-payload"))

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
		if e.Payload != "test-payload" {
			t.Errorf("expected payload test-payload, got %v", e.Payload)
		}
	case <-time.After(time.Second):
		t.Fatal("handler did not receive event within timeout")
	}
}

func TestMultipleSubscribers(t *testing.T) {
	bus := newTestBus()
	var count atomic.Int32

	for range 3 {
		bus.Subscribe(TopicUserCreated, func(ctx context.Context, e Event) {
			count.Add(1)
		})
	}
	bus.Start()

	bus.Publish(NewEvent(TopicUserCreated, SystemActor(), nil))

	// Stop waits for all handlers to complete
	bus.Stop(context.Background())

	if got := count.Load(); got != 3 {
		t.Errorf("expected 3 handlers called, got %d", got)
	}
}

func TestTopicIsolation(t *testing.T) {
	bus := newTestBus()
	var called atomic.Bool

	bus.Subscribe(TopicUserDeleted, func(ctx context.Context, e Event) {
		called.Store(true)
	})
	bus.Start()

	// Publish to a different topic
	bus.Publish(NewEvent(TopicUserCreated, SystemActor(), nil))

	bus.Stop(context.Background())

	if called.Load() {
		t.Error("handler for TopicUserDeleted should not be called for TopicUserCreated events")
	}
}

func TestPublishWithNoSubscribers(t *testing.T) {
	bus := newTestBus()
	bus.Start()

	// Should not panic or block
	bus.Publish(NewEvent(TopicUserCreated, SystemActor(), nil))

	bus.Stop(context.Background())
}

func TestChannelFullDropsEvent(t *testing.T) {
	// Create a bus with a tiny buffer
	bus := &eventBus{
		logger:   zap.NewNop(),
		ch:       make(chan Event, 1),
		handlers: make(map[Topic][]Handler),
		done:     make(chan struct{}),
	}

	// Fill the buffer without starting the dispatcher
	bus.Publish(NewEvent(TopicUserCreated, SystemActor(), "first"))

	// This should be dropped (channel full), not block
	bus.Publish(NewEvent(TopicUserCreated, SystemActor(), "second"))

	// Verify only one event in channel
	if len(bus.ch) != 1 {
		t.Errorf("expected 1 event in channel, got %d", len(bus.ch))
	}
}

func TestHandlerPanicRecovery(t *testing.T) {
	bus := newTestBus()
	var safeHandlerCalled atomic.Bool

	// First handler panics
	bus.Subscribe(TopicUserCreated, func(ctx context.Context, e Event) {
		panic("test panic")
	})

	// Second handler should still run
	bus.Subscribe(TopicUserCreated, func(ctx context.Context, e Event) {
		safeHandlerCalled.Store(true)
	})

	bus.Start()
	bus.Publish(NewEvent(TopicUserCreated, SystemActor(), nil))
	bus.Stop(context.Background())

	if !safeHandlerCalled.Load() {
		t.Error("safe handler should still be called even if another handler panics")
	}
}

func TestGracefulShutdownDrain(t *testing.T) {
	bus := newTestBus()
	var processed atomic.Int32

	bus.Subscribe(TopicUserCreated, func(ctx context.Context, e Event) {
		// Simulate some work
		time.Sleep(10 * time.Millisecond)
		processed.Add(1)
	})
	bus.Start()

	for range 5 {
		bus.Publish(NewEvent(TopicUserCreated, SystemActor(), nil))
	}

	// Stop should wait for all events to be processed
	bus.Stop(context.Background())

	if got := processed.Load(); got != 5 {
		t.Errorf("expected 5 events processed before shutdown, got %d", got)
	}
}

func TestConcurrentPublish(t *testing.T) {
	bus := newTestBus()
	var count atomic.Int32

	bus.Subscribe(TopicUserCreated, func(ctx context.Context, e Event) {
		count.Add(1)
	})
	bus.Start()

	var wg sync.WaitGroup
	for range 100 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			bus.Publish(NewEvent(TopicUserCreated, UserActor("user-1"), nil))
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
