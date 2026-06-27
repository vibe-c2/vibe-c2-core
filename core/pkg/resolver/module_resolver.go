package resolver

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// ModuleDeregistrar performs the shared deregister transition: registry update,
// data-plane gate-cache bust, AMQP audit event, and in-process bus event.
// Satisfied by *lifecycle.Service. Kept as a narrow interface so the resolver
// does not import the whole control-plane package and stays unit-testable with
// a fake.
type ModuleDeregistrar interface {
	Deregister(ctx context.Context, instance, reason string, actor eventbus.Actor) (bool, error)
}

// IModuleResolver is the business logic for the Module entity — the app-admin
// view over the module-instance registry. Authorization is enforced upstream by
// the @hasPermission(module:read|module:delete) directive, so these methods do
// no further permission checks.
type IModuleResolver interface {
	// Queries
	Modules(ctx context.Context, status []string) ([]*models.Module, error)

	// Mutations
	RemoveModule(ctx context.Context, instance string) (*models.Module, error)

	// Field resolvers for the Module type (timestamps → RFC3339 / nullable).
	RegisteredAt(ctx context.Context, obj *models.Module) (string, error)
	LastHeartbeatAt(ctx context.Context, obj *models.Module) (*string, error)
	DeregisteredAt(ctx context.Context, obj *models.Module) (*string, error)
	DeclaredDeadAt(ctx context.Context, obj *models.Module) (*string, error)
}

// removeModuleReason is recorded as the deregister_reason when an admin removes
// a module from the UI, distinguishing an operator eviction from a module's own
// graceful shutdown in the audit trail.
const removeModuleReason = "removed by admin"

type moduleResolver struct {
	repo        repository.IModuleRegistryRepository
	deregistrar ModuleDeregistrar
}

// NewModuleResolver builds the Module resolver. deregistrar is the lifecycle
// service; removeModule routes through it so the GraphQL path and the RPC
// deregister path share one transition.
func NewModuleResolver(repo repository.IModuleRegistryRepository, deregistrar ModuleDeregistrar) IModuleResolver {
	return &moduleResolver{repo: repo, deregistrar: deregistrar}
}

// Modules lists module instances filtered to the given lifecycle statuses,
// newest registration first. An empty/nil status list returns every row.
func (r *moduleResolver) Modules(ctx context.Context, status []string) ([]*models.Module, error) {
	mods, err := r.repo.List(ctx, status)
	if err != nil {
		return nil, fmt.Errorf("failed to list modules: %w", err)
	}
	out := make([]*models.Module, len(mods))
	for i := range mods {
		out[i] = &mods[i]
	}
	return out, nil
}

// RemoveModule soft-removes (deregisters) a module instance and returns the
// updated row. This is not durable eviction: a still-alive module re-registers
// on its next reconnect and reappears as registered — the all-states list makes
// that flip visible. Returns an error when the instance is not currently
// registered (already deregistered/dead, or never seen).
func (r *moduleResolver) RemoveModule(ctx context.Context, instance string) (*models.Module, error) {
	instance = strings.TrimSpace(instance)
	if instance == "" {
		return nil, fmt.Errorf("instance is required")
	}

	auth := gqlctx.AuthFromContext(ctx)
	found, err := r.deregistrar.Deregister(ctx, instance, removeModuleReason, eventbus.UserActor(auth.UserID))
	if err != nil {
		return nil, fmt.Errorf("failed to remove module: %w", err)
	}
	if !found {
		return nil, fmt.Errorf("module %q is not currently registered", instance)
	}

	// Return the post-removal row so the client can seed its cache.
	mod, err := r.repo.FindByInstance(ctx, instance)
	if err != nil {
		return nil, fmt.Errorf("failed to load module after removal: %w", err)
	}
	return &mod, nil
}

// RegisteredAt converts the registration timestamp to an RFC3339 string.
func (r *moduleResolver) RegisteredAt(_ context.Context, obj *models.Module) (string, error) {
	return obj.RegisteredAt.Format(time.RFC3339), nil
}

// LastHeartbeatAt is null until the instance has beaten at least once.
func (r *moduleResolver) LastHeartbeatAt(_ context.Context, obj *models.Module) (*string, error) {
	return rfc3339Ptr(obj.LastHeartbeatAt), nil
}

// DeregisteredAt is null while the instance is registered/dead.
func (r *moduleResolver) DeregisteredAt(_ context.Context, obj *models.Module) (*string, error) {
	return rfc3339Ptr(obj.DeregisteredAt), nil
}

// DeclaredDeadAt is null until the reaper declares the instance dead.
func (r *moduleResolver) DeclaredDeadAt(_ context.Context, obj *models.Module) (*string, error) {
	return rfc3339Ptr(obj.DeclaredDeadAt), nil
}

// rfc3339Ptr formats an optional timestamp as a nullable RFC3339 string.
func rfc3339Ptr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format(time.RFC3339)
	return &s
}
