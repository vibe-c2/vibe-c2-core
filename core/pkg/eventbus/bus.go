package eventbus

import (
	"context"
	"sync"
	"sync/atomic"

	"go.uber.org/zap"
)

var _ IEventBus = (*eventBus)(nil)

const (
	defaultBufferSize           = 256 // publisher → dispatcher channel
	defaultSubscriberBufferSize = 64  // per-subscriber internal channel
)

// subscription pairs a handler with its own buffered event channel,
// a set of topics it cares about, and an optional filter predicate.
// Each subscription gets exactly one long-lived drain goroutine.
type subscription struct {
	id      uint64
	topics  map[Topic]bool
	filter  Filter
	handler Handler
	ch      chan Event
	closed  atomic.Bool // set by unsubscribe; checked by dispatcher before sending
}

type eventBus struct {
	logger     *zap.Logger
	ch         chan Event           // publisher → dispatcher
	subs       []*subscription     // flat list of all subscriptions
	nextID     atomic.Uint64       // subscription ID counter
	mu         sync.RWMutex        // protects subs, started, stopped
	wg         sync.WaitGroup      // tracks drain goroutines
	started    bool                // true after Start() runs
	stopped    bool                // true after Stop() runs
	startOnce  sync.Once
	stopOnce   sync.Once
	dispatched chan struct{} // closed when dispatcher goroutine exits
}

// NewEventBus creates a new channel-based event bus.
func NewEventBus(logger *zap.Logger) IEventBus {
	return &eventBus{
		logger:     logger,
		ch:         make(chan Event, defaultBufferSize),
		dispatched: make(chan struct{}),
	}
}

func (b *eventBus) Subscribe(topics []Topic, handler Handler, filter ...Filter) func() {
	topicSet := make(map[Topic]bool, len(topics))
	for _, t := range topics {
		topicSet[t] = true
	}

	var f Filter
	if len(filter) > 0 {
		f = filter[0]
	}

	sub := &subscription{
		id:      b.nextID.Add(1),
		topics:  topicSet,
		filter:  f,
		handler: handler,
		ch:      make(chan Event, defaultSubscriberBufferSize),
	}

	b.mu.Lock()
	if b.stopped {
		b.mu.Unlock()
		b.logger.Warn("event bus: subscribe after stop, ignoring")
		return func() {}
	}
	b.subs = append(b.subs, sub)
	alreadyStarted := b.started
	b.mu.Unlock()

	if alreadyStarted {
		b.wg.Add(1)
		go b.drain(sub)
	}

	return func() { b.unsubscribe(sub.id) }
}

func (b *eventBus) unsubscribe(id uint64) {
	b.mu.Lock()
	defer b.mu.Unlock()

	for i, sub := range b.subs {
		if sub.id == id {
			// Mark closed first so the dispatcher stops sending to this channel.
			// The drain goroutine will exit once the channel is closed and drained.
			sub.closed.Store(true)
			close(sub.ch)
			b.subs = append(b.subs[:i], b.subs[i+1:]...)
			return
		}
	}
}

func (b *eventBus) Publish(event Event) {
	// defer/recover handles send-on-closed-channel atomically,
	// eliminating the TOCTOU race between checking stopped and sending.
	defer func() {
		if r := recover(); r != nil {
			b.logger.Warn("event bus: publish after stop, dropping event",
				zap.String("topic", string(event.Topic)),
				zap.String("event_id", event.ID),
			)
		}
	}()

	select {
	case b.ch <- event:
	default:
		b.logger.Warn("event bus: channel full, dropping event",
			zap.String("topic", string(event.Topic)),
			zap.String("event_id", event.ID),
			zap.String("actor_id", event.Actor.ID),
			zap.String("actor_type", string(event.Actor.Type)),
		)
	}
}

func (b *eventBus) Start() {
	b.startOnce.Do(func() {
		b.mu.Lock()
		b.started = true
		snapshot := make([]*subscription, len(b.subs))
		copy(snapshot, b.subs)
		b.mu.Unlock()

		for _, sub := range snapshot {
			b.wg.Add(1)
			go b.drain(sub)
		}

		go b.dispatch()
	})
}

// dispatch processes events from the publisher channel and fans them out
// to matching subscriber channels. Topic matching and optional filter are
// checked per subscriber. A slow subscriber only drops its own events.
func (b *eventBus) dispatch() {
	defer close(b.dispatched)

	for event := range b.ch {
		// Hold RLock for the entire fan-out so unsubscribe (which needs
		// a write lock) cannot close a subscriber channel mid-send.
		b.mu.RLock()
		for _, sub := range b.subs {
			if sub.closed.Load() {
				continue
			}
			if !sub.topics[event.Topic] {
				continue
			}
			if sub.filter != nil && !sub.filter(event) {
				continue
			}
			select {
			case sub.ch <- event:
			default:
				b.logger.Warn("event bus: subscriber buffer full, dropping event",
					zap.String("topic", string(event.Topic)),
					zap.String("event_id", event.ID),
					zap.Uint64("subscriber_id", sub.id),
				)
			}
		}
		b.mu.RUnlock()
	}
}

// drain is a long-lived goroutine that reads events from a subscription's
// channel and calls its handler with panic recovery.
func (b *eventBus) drain(sub *subscription) {
	defer b.wg.Done()

	for event := range sub.ch {
		b.handleSafe(sub.handler, event)
	}
}

// handleSafe calls a handler with panic recovery scoped to a single event.
func (b *eventBus) handleSafe(handler Handler, event Event) {
	defer func() {
		if r := recover(); r != nil {
			b.logger.Error("event bus: handler panicked",
				zap.String("topic", string(event.Topic)),
				zap.String("event_id", event.ID),
				zap.Any("panic", r),
			)
		}
	}()

	handler(context.Background(), event)
}

func (b *eventBus) Stop(ctx context.Context) {
	b.stopOnce.Do(func() {
		// 1. Close the publisher channel. The dispatcher drains remaining
		//    events and exits.
		close(b.ch)
		<-b.dispatched

		// 2. Mark as stopped and close all subscriber channels.
		b.mu.Lock()
		b.stopped = true
		for _, sub := range b.subs {
			close(sub.ch)
		}
		b.mu.Unlock()

		// 3. Wait for all drain goroutines to finish.
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
	})
}
