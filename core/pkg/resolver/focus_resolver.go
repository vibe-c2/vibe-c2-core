package resolver

import (
	"context"
	"fmt"

	"github.com/vibe-c2/vibe-c2-core/core/pkg/cache"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/focus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
)

// IFocusResolver is the SPA's half of the attention channel: the operator
// publishes where they are, and an agent reads it over MCP.
//
// The store itself lives in package focus, which both ends import; this
// resolver is only the write path plus a read-back for debugging.
type IFocusResolver interface {
	MyOperatorFocus(ctx context.Context) (*model.OperatorFocus, error)
	PublishOperatorFocus(ctx context.Context, input model.OperatorFocusInput) (bool, error)
}

type focusResolver struct {
	cache cache.Cache
}

func NewFocusResolver(c cache.Cache) IFocusResolver {
	return &focusResolver{cache: c}
}

func (r *focusResolver) MyOperatorFocus(ctx context.Context) (*model.OperatorFocus, error) {
	uid, err := callerUserID(ctx)
	if err != nil {
		return nil, err
	}
	current, ok := focus.Read(ctx, r.cache, uid.String())
	if !ok {
		// No beacon is the ordinary "not currently active" state, not an error.
		return nil, nil
	}
	return toOperatorFocusModel(current), nil
}

func (r *focusResolver) PublishOperatorFocus(ctx context.Context, input model.OperatorFocusInput) (bool, error) {
	uid, err := callerUserID(ctx)
	if err != nil {
		return false, err
	}
	if r.cache == nil || !r.cache.IsEnabled() {
		// Without Redis there is no attention channel. The agent loses some
		// awareness; nothing else breaks, and the operator should not see an
		// error on every navigation because of it.
		return false, nil
	}
	if err := focus.Publish(ctx, r.cache, uid.String(), fromOperatorFocusInput(input)); err != nil {
		return false, fmt.Errorf("failed to publish focus: %w", err)
	}
	return true, nil
}

func fromOperatorFocusInput(in model.OperatorFocusInput) focus.Focus {
	return focus.Focus{
		Route:                 in.Route,
		OperationID:           deref(in.OperationID),
		WikiOperationID:       deref(in.WikiOperationID),
		WikiDocumentID:        deref(in.WikiDocumentID),
		HostID:                deref(in.HostID),
		CredentialID:          deref(in.CredentialID),
		HashID:                deref(in.HashID),
		TaskID:                deref(in.TaskID),
		FindingsTab:           deref(in.FindingsTab),
		TopologyLens:          deref(in.TopologyLens),
		TopologyFocusedNodeID: deref(in.TopologyFocusedNodeID),
		TopologyFocusedEdgeID: deref(in.TopologyFocusedEdgeID),
		SearchSummary:         deref(in.SearchSummary),
	}
}

func toOperatorFocusModel(f focus.Focus) *model.OperatorFocus {
	return &model.OperatorFocus{
		Route:                 f.Route,
		OperationID:           optional(f.OperationID),
		WikiOperationID:       optional(f.WikiOperationID),
		WikiDocumentID:        optional(f.WikiDocumentID),
		HostID:                optional(f.HostID),
		CredentialID:          optional(f.CredentialID),
		HashID:                optional(f.HashID),
		TaskID:                optional(f.TaskID),
		FindingsTab:           optional(f.FindingsTab),
		TopologyLens:          optional(f.TopologyLens),
		TopologyFocusedNodeID: optional(f.TopologyFocusedNodeID),
		TopologyFocusedEdgeID: optional(f.TopologyFocusedEdgeID),
		SearchSummary:         optional(f.SearchSummary),
		UpdatedAt:             optional(f.UpdatedAt),
	}
}

func deref(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func optional(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}
