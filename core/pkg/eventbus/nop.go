package eventbus

import "context"

// NopEventBus is a no-op implementation of IEventBus.
// Use when event publishing is not needed (e.g., tests or optional dependencies).
type NopEventBus struct{}

func NewNopEventBus() IEventBus          { return &NopEventBus{} }
func (NopEventBus) Publish(Event)        {}
func (NopEventBus) Subscribe(Topic, Handler) {}
func (NopEventBus) Start()               {}
func (NopEventBus) Stop(context.Context) {}
