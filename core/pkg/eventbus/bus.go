package eventbus

import (
	"context"
	"sync"
	"sync/atomic"

	"go.uber.org/zap"
)

const (
	defaultBufferSize            = 256
	defaultMaxConcurrentHandlers = 64
)

type eventBus struct {
	logger     *zap.Logger
	ch         chan Event
	handlers   map[Topic][]Handler
	mu         sync.RWMutex   // protects handlers map
	wg         sync.WaitGroup // tracks in-flight handler goroutines
	sem        chan struct{}   // limits concurrent handler goroutines
	stopped    atomic.Bool    // prevents send on closed channel
	dispatched chan struct{}   // closed when dispatcher goroutine has fully drained and exited
}

// NewEventBus creates a new channel-based event bus.
func NewEventBus(logger *zap.Logger) IEventBus {
	return &eventBus{
		logger:     logger,
		ch:         make(chan Event, defaultBufferSize),
		handlers:   make(map[Topic][]Handler),
		sem:        make(chan struct{}, defaultMaxConcurrentHandlers),
		dispatched: make(chan struct{}),
	}
}

func (b *eventBus) Subscribe(topic Topic, handler Handler) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.handlers[topic] = append(b.handlers[topic], handler)
}

func (b *eventBus) Publish(event Event) {
	if b.stopped.Load() {
		b.logger.Warn("event bus: publish after stop, dropping event",
			zap.String("topic", string(event.Topic)),
			zap.String("event_id", event.ID),
		)
		return
	}

	select {
	case b.ch <- event:
	default:
		// Channel full — drop event to avoid blocking the publisher (HTTP handler).
		b.logger.Warn("event bus: channel full, dropping event",
			zap.String("topic", string(event.Topic)),
			zap.String("event_id", event.ID),
			zap.String("actor_id", event.Actor.ID),
			zap.String("actor_type", string(event.Actor.Type)),
		)
	}
}

func (b *eventBus) Start() {
	go b.dispatch()
}

// dispatch processes events from the channel until it is closed.
// Using range over the channel guarantees all queued events are drained
// before the dispatcher exits — no race between done signal and event reads.
func (b *eventBus) dispatch() {
	defer close(b.dispatched)

	for event := range b.ch {
		b.fanOut(event)
	}
}

func (b *eventBus) fanOut(event Event) {
	b.mu.RLock()
	handlers := b.handlers[event.Topic]
	b.mu.RUnlock()

	for _, h := range handlers {
		b.wg.Add(1)
		b.sem <- struct{}{} // acquire slot (blocks if at capacity)
		go func(handler Handler) {
			defer func() { <-b.sem }() // release slot
			defer b.wg.Done()
			defer func() {
				if r := recover(); r != nil {
					b.logger.Error("event bus: handler panicked",
						zap.String("topic", string(event.Topic)),
						zap.String("event_id", event.ID),
						zap.Any("panic", r),
					)
				}
			}()
			// Use background context — the original HTTP request context
			// may already be cancelled by the time the handler runs.
			handler(context.Background(), event)
		}(h)
	}
}

func (b *eventBus) Stop(ctx context.Context) {
	b.stopped.Store(true)
	close(b.ch)

	// Wait for the dispatcher to finish draining all queued events.
	// This ensures no more wg.Add() calls will happen after this point.
	<-b.dispatched

	// Now safely wait for all in-flight handlers to complete.
	finished := make(chan struct{})
	go func() {
		b.wg.Wait()
		close(finished)
	}()

	select {
	case <-finished:
		b.logger.Info("event bus: all handlers drained successfully")
	case <-ctx.Done():
		b.logger.Warn("event bus: shutdown deadline reached, some handlers may not have finished")
	}
}
