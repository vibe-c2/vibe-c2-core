package repository

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/cache"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"go.mongodb.org/mongo-driver/v2/bson"
)

type stubAgentKeys struct {
	IAgentKeyRepository
	key models.AgentKey
}

func (s stubAgentKeys) FindByAgentKeyID(context.Context, uuid.UUID, uuid.UUID) (models.AgentKey, error) {
	return s.key, nil
}
func (stubAgentKeys) UpdateSecret(context.Context, uuid.UUID, uuid.UUID, string, string, int) error {
	return nil
}
func (stubAgentKeys) UpdateSettings(context.Context, uuid.UUID, uuid.UUID, bson.M) error { return nil }
func (stubAgentKeys) SetEnabled(context.Context, uuid.UUID, uuid.UUID, bool) error       { return nil }
func (stubAgentKeys) Delete(context.Context, uuid.UUID, uuid.UUID) error                 { return nil }

type delCache struct {
	cache.Cache
	deleted []string
}

func (c *delCache) IsEnabled() bool { return true }
func (c *delCache) Del(_ context.Context, keys ...string) error {
	c.deleted = append(c.deleted, keys...)
	return nil
}
func (c *delCache) Set(context.Context, string, interface{}, time.Duration) error { return nil }

// Every mutation must drop the middleware's cached copy, or a disabled or
// rotated key stays usable until the TTL runs out.
func TestAgentKeyAuthCacheEvictor_EvictsOnEveryMutation(t *testing.T) {
	key := models.AgentKey{KeyID: "abc", AgentKeyID: uuid.New(), UserID: uuid.New()}
	c := &delCache{}
	repo := NewAgentKeyRepositoryWithAuthCache(stubAgentKeys{key: key}, c)
	ctx := context.Background()

	steps := []struct {
		name string
		run  func() error
		want []string
	}{
		{"SetEnabled", func() error { return repo.SetEnabled(ctx, key.UserID, key.AgentKeyID, false) }, []string{AgentAuthCacheKey("abc")}},
		{"UpdateSettings", func() error { return repo.UpdateSettings(ctx, key.UserID, key.AgentKeyID, bson.M{"x": 1}) }, []string{AgentAuthCacheKey("abc")}},
		{"Delete", func() error { return repo.Delete(ctx, key.UserID, key.AgentKeyID) }, []string{AgentAuthCacheKey("abc")}},
		{"UpdateSecret", func() error { return repo.UpdateSecret(ctx, key.UserID, key.AgentKeyID, "new", "h", 2) },
			[]string{AgentAuthCacheKey("abc"), AgentAuthCacheKey("new")}},
	}
	for _, step := range steps {
		c.deleted = nil
		if err := step.run(); err != nil {
			t.Fatalf("%s: %v", step.name, err)
		}
		if len(c.deleted) != len(step.want) {
			t.Fatalf("%s evicted %v, want %v", step.name, c.deleted, step.want)
		}
		for i := range step.want {
			if c.deleted[i] != step.want[i] {
				t.Fatalf("%s evicted %v, want %v", step.name, c.deleted, step.want)
			}
		}
	}
}

// The secret hash is hidden from JSON on the model; the entry has to carry
// it or the middleware would compare every token against an empty string.
func TestAgentAuthEntry_SurvivesJSON(t *testing.T) {
	entry := NewAgentAuthEntry(models.AgentKey{KeyID: "k", SecretHash: "deadbeef"}, models.User{Active: true})
	if entry.SecretHash != "deadbeef" {
		t.Fatal("secret hash not captured")
	}
	entry.Key.SecretHash = "" // as the JSON round trip leaves it
	entry.Restore()
	if entry.Key.SecretHash != "deadbeef" {
		t.Fatal("Restore did not put the hash back")
	}
}
