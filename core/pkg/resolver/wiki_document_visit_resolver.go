package resolver

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/authorization"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/model"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/pagination"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// MaxWikiVisitHistory is the per-user, per-operation cap on retained visit
// rows. Older entries are pruned after each upsert so the list never grows
// unbounded.
const MaxWikiVisitHistory int64 = 300

// IWikiDocumentVisitResolver is the entity resolver for the calling user's
// per-operation wiki visit history. The resolver layer is the only place that
// reads `auth.UserID` for this feature — the repository never accepts a user
// ID from external input, which removes any cross-user leakage surface.
type IWikiDocumentVisitResolver interface {
	// Mutations
	TrackWikiDocumentVisit(ctx context.Context, documentID string) (*models.WikiDocumentVisit, error)

	// Queries
	WikiDocumentHistory(ctx context.Context, operationID string, offset *int, limit *int) (*model.WikiDocumentVisitConnection, error)

	// WikiDocumentVisit field resolvers
	WikiDocumentVisitID(ctx context.Context, obj *models.WikiDocumentVisit) (string, error)
	WikiDocumentVisitDocument(ctx context.Context, obj *models.WikiDocumentVisit) (*models.WikiDocument, error)
	WikiDocumentVisitVisitedAt(ctx context.Context, obj *models.WikiDocumentVisit) (string, error)
}

type wikiDocumentVisitResolver struct {
	visitRepo     repository.IWikiDocumentVisitRepository
	docRepo       repository.IWikiDocumentRepository
	operationRepo repository.IOperationRepository
}

// NewWikiDocumentVisitResolver wires the visit-history resolver. The visit
// repo is the only persistence dependency; the doc repo is needed both to
// authorize the target document on TrackWikiDocumentVisit and to filter the
// history list down to currently-active documents (so soft-deleted docs
// disappear from the dropdown without a cascade write).
func NewWikiDocumentVisitResolver(
	visitRepo repository.IWikiDocumentVisitRepository,
	docRepo repository.IWikiDocumentRepository,
	operationRepo repository.IOperationRepository,
) IWikiDocumentVisitResolver {
	return &wikiDocumentVisitResolver{
		visitRepo:     visitRepo,
		docRepo:       docRepo,
		operationRepo: operationRepo,
	}
}

// --- Mutations ---

// TrackWikiDocumentVisit records (or refreshes) a visit. The user is always
// taken from auth.UserID — there is no parameter for it — so a member can
// only ever record their own history.
func (r *wikiDocumentVisitResolver) TrackWikiDocumentVisit(ctx context.Context, documentID string) (*models.WikiDocumentVisit, error) {
	auth := gqlctx.AuthFromContext(ctx)

	docUID, err := uuid.Parse(documentID)
	if err != nil {
		return nil, fmt.Errorf("invalid document ID: %w", err)
	}

	doc, err := r.docRepo.FindByID(ctx, docUID)
	if err != nil {
		return nil, fmt.Errorf("document not found: %w", err)
	}
	// Tracking a soft-deleted doc is a no-op for the user's intent — the doc
	// shouldn't appear in their history. Treat as "not visitable".
	if doc.DeletedAt != nil {
		return nil, fmt.Errorf("cannot track visit on a deleted document")
	}

	// Authorize: the caller must be a member of the document's operation.
	op, err := r.operationRepo.FindByID(ctx, doc.OperationID)
	if err != nil {
		return nil, fmt.Errorf("operation not found: %w", err)
	}
	if err := authorization.AuthorizeOperationRole(ctx, &op, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	userUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid caller ID: %w", err)
	}

	now := time.Now().UTC()
	visit, err := r.visitRepo.Upsert(ctx, userUID, doc.OperationID, docUID, now)
	if err != nil {
		return nil, fmt.Errorf("failed to record visit: %w", err)
	}

	// Prune to the cap. Best-effort: if it fails the visit is still recorded;
	// we just retry on the next visit. Logging this would be appropriate but
	// the resolver layer does not have a logger dependency.
	_ = r.visitRepo.PruneToLimit(ctx, userUID, doc.OperationID, MaxWikiVisitHistory)

	return &visit, nil
}

// --- Queries ---

// WikiDocumentHistory returns the calling user's most-recent-first visit
// history within an operation. Visits that point at soft-deleted documents
// are filtered out by intersecting with the operation's active doc set.
func (r *wikiDocumentVisitResolver) WikiDocumentHistory(ctx context.Context, operationID string, offset *int, limit *int) (*model.WikiDocumentVisitConnection, error) {
	auth := gqlctx.AuthFromContext(ctx)

	opUID, err := uuid.Parse(operationID)
	if err != nil {
		return nil, fmt.Errorf("invalid operation ID: %w", err)
	}

	op, err := r.operationRepo.FindByID(ctx, opUID)
	if err != nil {
		return nil, fmt.Errorf("operation not found: %w", err)
	}
	if err := authorization.AuthorizeOperationRole(ctx, &op, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	userUID, err := uuid.Parse(auth.UserID)
	if err != nil {
		return nil, fmt.Errorf("invalid caller ID: %w", err)
	}

	off := int64(0)
	if offset != nil && *offset > 0 {
		off = int64(*offset)
	}
	lim := int64(MaxWikiVisitHistory)
	if limit != nil && *limit > 0 {
		lim = int64(*limit)
		if lim > MaxWikiVisitHistory {
			lim = MaxWikiVisitHistory
		}
	}

	// Active doc set in this operation. The history list is bounded at
	// MaxWikiVisitHistory rows so this scan is cheap; we can revisit if
	// operations grow to tens of thousands of docs.
	activeDocs, err := r.docRepo.FindAllByOperationID(ctx, opUID)
	if err != nil {
		return nil, fmt.Errorf("failed to load active documents: %w", err)
	}
	if len(activeDocs) == 0 {
		return &model.WikiDocumentVisitConnection{
			Edges:      []*model.WikiDocumentVisitEdge{},
			PageInfo:   &pagination.PageInfo{},
			TotalCount: 0,
		}, nil
	}
	activeIDs := make([]uuid.UUID, len(activeDocs))
	for i := range activeDocs {
		activeIDs[i] = activeDocs[i].DocumentID
	}

	total, err := r.visitRepo.CountByUserOperationActive(ctx, userUID, opUID, activeIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to count visits: %w", err)
	}

	visits, err := r.visitRepo.FindByUserOperationActive(ctx, userUID, opUID, activeIDs, off, lim)
	if err != nil {
		return nil, fmt.Errorf("failed to list visits: %w", err)
	}

	edges := make([]*model.WikiDocumentVisitEdge, len(visits))
	for i := range visits {
		// Cursor format: "<index>" — stable while the list is paged in one
		// shot. The frontend uses offset/limit, not the cursor, but the
		// connection shape requires one.
		cursor := fmt.Sprintf("%d", off+int64(i))
		edges[i] = &model.WikiDocumentVisitEdge{
			Node:   &visits[i],
			Cursor: cursor,
		}
	}

	pageInfo := pagination.PageInfo{
		HasNextPage:     off+int64(len(visits)) < total,
		HasPreviousPage: off > 0,
	}
	if len(edges) > 0 {
		pageInfo.StartCursor = &edges[0].Cursor
		pageInfo.EndCursor = &edges[len(edges)-1].Cursor
	}

	return &model.WikiDocumentVisitConnection{
		Edges:      edges,
		PageInfo:   &pageInfo,
		TotalCount: int(total),
	}, nil
}

// --- WikiDocumentVisit field resolvers ---

func (r *wikiDocumentVisitResolver) WikiDocumentVisitID(ctx context.Context, obj *models.WikiDocumentVisit) (string, error) {
	return obj.Id.Hex(), nil
}

func (r *wikiDocumentVisitResolver) WikiDocumentVisitDocument(ctx context.Context, obj *models.WikiDocumentVisit) (*models.WikiDocument, error) {
	doc, err := r.docRepo.FindByID(ctx, obj.DocumentID)
	if err != nil {
		return nil, fmt.Errorf("document not found: %w", err)
	}
	return &doc, nil
}

func (r *wikiDocumentVisitResolver) WikiDocumentVisitVisitedAt(ctx context.Context, obj *models.WikiDocumentVisit) (string, error) {
	return obj.VisitedAt.Format(time.RFC3339), nil
}
