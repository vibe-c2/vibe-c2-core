package wikitransfer

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

const (
	holdingPenTitle = "import"
	// holdingPenEmoji marks the singleton root as a system folder rather
	// than a regular page.
	holdingPenEmoji = "⬇️"
	// DefaultDocumentIcon mirrors DEFAULT_ICON_VALUE in
	// create-wiki-document-dialog.tsx: the adaptive lucide glyph that renders
	// as page or folder depending on the row's state.
	DefaultDocumentIcon = "Adaptive"
)

// holdingPenMu serialises lookup-or-create of the singleton "import" root
// per process. Two concurrent imports into the same operation would
// otherwise each create their own. A Mongo unique index is the durable
// follow-up.
var holdingPenMu sync.Mutex

// HoldingPen is the pair of folders an import lands in when the caller does
// not choose a parent: import/<timestamp>/.
type HoldingPen struct {
	ImportRootID    uuid.UUID
	TimestampID     uuid.UUID
	ImportRootFresh bool
}

// EnsureHoldingPen finds or creates the operation's "import" root and
// creates a fresh timestamp folder under it, publishing the document
// events the sidebar needs to show them. Returns the timestamp folder as
// the parent to import under.
func EnsureHoldingPen(
	ctx context.Context,
	docRepo repository.IWikiDocumentRepository,
	bus eventbus.IEventBus,
	operationID, callerID uuid.UUID,
	now time.Time,
) (HoldingPen, error) {
	holdingPenMu.Lock()
	defer holdingPenMu.Unlock()

	var pen HoldingPen
	all, err := docRepo.FindAllByOperationID(ctx, operationID)
	if err != nil {
		return pen, fmt.Errorf("list documents: %w", err)
	}
	var root *models.WikiDocument
	for i := range all {
		d := &all[i]
		if d.ParentDocumentID == nil && d.DeletedAt == nil && strings.EqualFold(d.Title, holdingPenTitle) {
			root = d
			break
		}
	}
	if root == nil {
		root = newFolder(operationID, callerID, nil, holdingPenTitle, holdingPenEmoji, "", "0", now)
		if err := docRepo.Create(ctx, root); err != nil {
			return pen, fmt.Errorf("create import root: %w", err)
		}
		pen.ImportRootFresh = true
	}
	pen.ImportRootID = root.DocumentID

	label := now.UTC().Format(time.RFC3339)
	ts := newFolder(operationID, callerID, &root.DocumentID, label, "", DefaultDocumentIcon, label, now)
	if err := docRepo.Create(ctx, ts); err != nil {
		return pen, fmt.Errorf("create timestamp folder: %w", err)
	}
	pen.TimestampID = ts.DocumentID

	if bus != nil {
		actor := eventbus.UserActor(callerID.String())
		if pen.ImportRootFresh {
			bus.Publish(eventbus.NewWikiDocumentCreatedEvent(actor, eventbus.WikiDocumentEventPayload{
				DocumentID:  root.DocumentID.String(),
				OperationID: operationID.String(),
				Title:       root.Title,
			}))
		}
		bus.Publish(eventbus.NewWikiDocumentCreatedEvent(actor, eventbus.WikiDocumentEventPayload{
			DocumentID:       ts.DocumentID.String(),
			OperationID:      operationID.String(),
			ParentDocumentID: root.DocumentID.String(),
			Title:            ts.Title,
		}))
	}
	return pen, nil
}

func newFolder(opID, callerID uuid.UUID, parent *uuid.UUID, title, emoji, icon, sortOrder string, now time.Time) *models.WikiDocument {
	return &models.WikiDocument{
		DocumentID:       uuid.New(),
		OperationID:      opID,
		ParentDocumentID: parent,
		Title:            title,
		TitleLower:       strings.ToLower(title),
		Emoji:            emoji,
		Icon:             icon,
		SortOrder:        sortOrder,
		CreatedByID:      callerID,
		LastUpdatedByID:  &callerID,
		LastUpdatedAt:    &now,
	}
}
