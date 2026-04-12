package wiki

import (
	"sync"
	"time"

	"github.com/google/uuid"
	"go.uber.org/zap"
)

// Editor represents a user actively editing a document via the Hocuspocus WebSocket.
type Editor struct {
	UserID      uuid.UUID
	OperationID uuid.UUID
	Username    string
	ConnectedAt time.Time
}

// PresenceTracker maintains an in-memory map of who is editing which document.
// Updated by Hocuspocus webhooks (onConnect/onDisconnect), queried by the
// wikiDocumentPresence GraphQL resolver. No database involved.
type PresenceTracker struct {
	editors map[uuid.UUID][]Editor // documentID -> active editors
	mu      sync.RWMutex
	logger  *zap.Logger
}

// NewPresenceTracker creates a new presence tracker.
func NewPresenceTracker(logger *zap.Logger) *PresenceTracker {
	return &PresenceTracker{
		editors: make(map[uuid.UUID][]Editor),
		logger:  logger,
	}
}

// AddEditor registers a user as actively editing a document.
func (t *PresenceTracker) AddEditor(documentID, operationID, userID uuid.UUID, username string) {
	t.mu.Lock()
	defer t.mu.Unlock()

	// Don't add duplicates
	for _, e := range t.editors[documentID] {
		if e.UserID == userID {
			return
		}
	}

	t.editors[documentID] = append(t.editors[documentID], Editor{
		UserID:      userID,
		OperationID: operationID,
		Username:    username,
		ConnectedAt: time.Now().UTC(),
	})
}

// RemoveEditor removes a user from the active editors of a document.
func (t *PresenceTracker) RemoveEditor(documentID, userID uuid.UUID) {
	t.mu.Lock()
	defer t.mu.Unlock()

	editors := t.editors[documentID]
	for i, e := range editors {
		if e.UserID == userID {
			t.editors[documentID] = append(editors[:i], editors[i+1:]...)
			break
		}
	}

	// Clean up empty entries
	if len(t.editors[documentID]) == 0 {
		delete(t.editors, documentID)
	}
}

// GetPresence returns the list of active editors for a document.
func (t *PresenceTracker) GetPresence(documentID uuid.UUID) []Editor {
	t.mu.RLock()
	defer t.mu.RUnlock()

	editors := t.editors[documentID]
	if editors == nil {
		return []Editor{}
	}

	// Return a copy to avoid callers mutating the internal slice
	result := make([]Editor, len(editors))
	copy(result, editors)
	return result
}

// GetPresenceByOperation returns all active editors grouped by document for
// the given operation. Used by the tree sidebar to show presence indicators
// without N per-document queries.
func (t *PresenceTracker) GetPresenceByOperation(operationID uuid.UUID) map[uuid.UUID][]Editor {
	t.mu.RLock()
	defer t.mu.RUnlock()

	result := make(map[uuid.UUID][]Editor)
	for docID, editors := range t.editors {
		var matched []Editor
		for _, e := range editors {
			if e.OperationID == operationID {
				matched = append(matched, e)
			}
		}
		if len(matched) > 0 {
			result[docID] = matched
		}
	}
	return result
}
