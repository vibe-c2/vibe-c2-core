package repository

import (
	"context"
	"time"

	"github.com/google/uuid"
	opts "github.com/qiniu/qmgo/options"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/database"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"go.mongodb.org/mongo-driver/v2/bson"
)

const agentActionCollection = "agent_actions"

// IAgentActionRepository persists the MCP tool-call trace.
//
// Append-and-read only: an audit trail the writer can edit is not an audit
// trail. Retention is unbounded for now, matching the sessions collection —
// revisit when volume makes it a problem.
type IAgentActionRepository interface {
	Insert(ctx context.Context, action *models.AgentAction) error

	// QueryWithCursor is the read path behind the agent activity page. Keyset
	// pagination on occurred_at, matching every other list in the app — an
	// offset would repeat or skip rows as the feed grows underneath a reader,
	// and this one grows faster than most.
	QueryWithCursor(ctx context.Context, f AgentActionFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.AgentAction, error)
	// Count is the connection's totalCount.
	Count(ctx context.Context, f AgentActionFilter) (int64, error)
	// DistinctAgents lists the agents a user owns that have actually acted,
	// so the UI can offer a filter without first paging every action.
	DistinctAgents(ctx context.Context, ownerUserID uuid.UUID) ([]AgentSummary, error)
}

// AgentActionFilter narrows the activity feed.
//
// OwnerUserID is always set: this is a personal audit trail, and the question
// it answers is "what have MY agents been doing", across every operation they
// touched. Scoping it to one operation instead would mean an operator had to
// visit each engagement in turn to find out what they had delegated, which is
// the opposite of an audit.
//
// OperationID is an optional narrowing on top of that, not the frame.
type AgentActionFilter struct {
	OwnerUserID uuid.UUID
	OperationID *uuid.UUID
	AgentKeyID  *uuid.UUID
	// WritesOnly hides reads. Reads are the bulk of the volume and the least
	// interesting when the question is "what did it change?".
	WritesOnly bool
	// Outcomes restricts to ok / error / refused. Refusals on their own are
	// the useful view: they mean a key is scoped tighter than the work.
	Outcomes []models.AgentActionOutcome
}

// agentActionSortKey is the list's primary order: newest first, the only
// ordering an audit feed is ever read in.
var agentActionSortKey = pagination.SortKey{Field: "occurred_at", Ascending: false}

// AgentActionCursor encodes a row's position in that order.
func AgentActionCursor(a *models.AgentAction) string {
	return pagination.EncodeCursor(a.OccurredAt, a.Id)
}

// AgentSummary is one of the caller's agents and what it has been up to.
type AgentSummary struct {
	AgentKeyID uuid.UUID
	AgentName  string
	Actions    int
	// Operations is how many distinct engagements this agent has touched. The
	// number an operator most wants at a glance: an agent working in one
	// operation is expected, the same key active across five is worth a look.
	Operations int
	LastSeen   time.Time
}

type agentActionRepository struct {
	coll database.Collection
}

func NewAgentActionRepository(db database.Database) IAgentActionRepository {
	coll := db.Collection(agentActionCollection)

	// Both read paths sort newest-first within a scope, so the indexes are
	// compound rather than on the scope alone.
	db.EnsureIndexes(context.Background(), agentActionCollection, []opts.IndexModel{
		{Key: []string{"operation_id", "-occurred_at"}},
		{Key: []string{"owner_user_id", "-occurred_at"}},
		{Key: []string{"agent_key_id", "-occurred_at"}},
	})

	return &agentActionRepository{coll: coll}
}

func (r *agentActionRepository) Insert(ctx context.Context, action *models.AgentAction) error {
	_, err := r.coll.InsertOne(ctx, action)
	return err
}

func (f AgentActionFilter) toBSON() bson.M {
	filter := bson.M{"owner_user_id": f.OwnerUserID}
	if f.OperationID != nil {
		filter["operation_id"] = *f.OperationID
	}
	if f.AgentKeyID != nil {
		filter["agent_key_id"] = *f.AgentKeyID
	}
	if f.WritesOnly {
		filter["write"] = true
	}
	if len(f.Outcomes) > 0 {
		filter["outcome"] = bson.M{"$in": f.Outcomes}
	}
	return filter
}

func (r *agentActionRepository) QueryWithCursor(ctx context.Context, f AgentActionFilter, cursor *pagination.Cursor, limit int64, forward bool) ([]models.AgentAction, error) {
	if err := agentActionSortKey.ValidateCursor(cursor); err != nil {
		return nil, err
	}

	actions := make([]models.AgentAction, 0)
	err := r.coll.
		Find(ctx, pagination.ApplyCursorFilterKey(f.toBSON(), cursor, forward, agentActionSortKey)).
		Sort(pagination.SortFieldsKey(forward, agentActionSortKey)...).
		Limit(limit).
		All(&actions)
	if err != nil {
		return nil, err
	}

	// A backward page comes back against the list's direction; flip it so the
	// caller always sees newest-first.
	if !forward {
		for i, j := 0, len(actions)-1; i < j; i, j = i+1, j-1 {
			actions[i], actions[j] = actions[j], actions[i]
		}
	}
	return actions, nil
}

func (r *agentActionRepository) Count(ctx context.Context, f AgentActionFilter) (int64, error) {
	return r.coll.Find(ctx, f.toBSON()).Count()
}

func (r *agentActionRepository) DistinctAgents(ctx context.Context, ownerUserID uuid.UUID) ([]AgentSummary, error) {
	var rows []struct {
		ID struct {
			AgentKeyID uuid.UUID `bson:"agent_key_id"`
			AgentName  string    `bson:"agent_name"`
		} `bson:"_id"`
		Actions    int         `bson:"actions"`
		Operations []uuid.UUID `bson:"operations"`
		LastSeen   time.Time   `bson:"last_seen"`
	}

	err := r.coll.Aggregate(ctx, []bson.M{
		{"$match": bson.M{"owner_user_id": ownerUserID}},
		{"$group": bson.M{
			// Grouped by name as well as id so a renamed key still reads
			// correctly against the actions it took under the old name.
			"_id":     bson.M{"agent_key_id": "$agent_key_id", "agent_name": "$agent_name"},
			"actions": bson.M{"$sum": 1},
			// addToSet rather than a count: calls that are not
			// operation-scoped carry a null operation_id, and counting those
			// as an engagement would inflate the number that is supposed to
			// tell an operator how far a key has reached.
			"operations": bson.M{"$addToSet": "$operation_id"},
			"last_seen":  bson.M{"$max": "$occurred_at"},
		}},
		{"$sort": bson.M{"last_seen": -1}},
	}).All(&rows)
	if err != nil {
		return nil, err
	}

	out := make([]AgentSummary, 0, len(rows))
	for _, row := range rows {
		operations := 0
		for _, opID := range row.Operations {
			if opID != uuid.Nil {
				operations++
			}
		}
		out = append(out, AgentSummary{
			AgentKeyID: row.ID.AgentKeyID,
			AgentName:  row.ID.AgentName,
			Actions:    row.Actions,
			Operations: operations,
			LastSeen:   row.LastSeen,
		})
	}
	return out, nil
}
