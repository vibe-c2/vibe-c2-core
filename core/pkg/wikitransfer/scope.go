package wikitransfer

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// CredentialLookup is the read-side dependency exporters use to embed
// credential payloads. Satisfied by repository.ICredentialRepository; tests
// substitute a map-backed fake. FindByID must return the credential with
// its OperationID so the exporter can refuse cross-operation embedding.
type CredentialLookup interface {
	FindByID(ctx context.Context, id uuid.UUID) (models.Credential, error)
}

// Scope is the set of documents one export covers, indexed for a
// parent-first walk. Shared by every export format.
type Scope struct {
	OperationID   uuid.UUID
	OperationName string
	// Root is the subtree root, or nil for a tree-wide export.
	Root *models.WikiDocument
	// Docs is every live document in scope, root included.
	Docs []models.WikiDocument
	// TopLevel are the documents directly under the export root: the
	// subtree root itself, or the operation's root-level documents.
	TopLevel []models.WikiDocument
	// ChildrenByParent lists each document's live children in sort order.
	ChildrenByParent map[uuid.UUID][]models.WikiDocument
}

// Label is "tree" or "subtree".
func (s *Scope) Label() string {
	if s.Root != nil {
		return "subtree"
	}
	return "tree"
}

// Title is the export's display title: the root document's title for a
// subtree, the operation name for a tree, "wiki" when both are blank.
func (s *Scope) Title() string {
	if s.Root != nil {
		if t := strings.TrimSpace(s.Root.Title); t != "" {
			return t
		}
	}
	if t := strings.TrimSpace(s.OperationName); t != "" {
		return t
	}
	return "wiki"
}

// CollectScope loads the documents an export covers. rootID nil means the
// whole operation. Trashed documents are excluded; a trashed root is an
// error.
func CollectScope(ctx context.Context, docRepo repository.IWikiDocumentRepository, operationID uuid.UUID, operationName string, rootID *uuid.UUID) (*Scope, error) {
	s := &Scope{
		OperationID:      operationID,
		OperationName:    operationName,
		ChildrenByParent: map[uuid.UUID][]models.WikiDocument{},
	}

	if rootID != nil {
		root, err := docRepo.FindByID(ctx, *rootID)
		if err != nil {
			return nil, fmt.Errorf("find subtree root: %w", err)
		}
		if root.OperationID != operationID {
			return nil, errors.New("subtree root does not belong to operation")
		}
		if root.DeletedAt != nil {
			return nil, errors.New("subtree root is in trash")
		}
		descendants, err := docRepo.FindDescendants(ctx, root.DocumentID)
		if err != nil {
			return nil, fmt.Errorf("find descendants: %w", err)
		}
		s.Root = &root
		s.Docs = append(s.Docs, root)
		for _, d := range descendants {
			if d.DeletedAt == nil {
				s.Docs = append(s.Docs, d)
			}
		}
	} else {
		all, err := docRepo.FindAllByOperationID(ctx, operationID)
		if err != nil {
			return nil, fmt.Errorf("find by operation: %w", err)
		}
		for _, d := range all {
			if d.DeletedAt == nil {
				s.Docs = append(s.Docs, d)
			}
		}
	}

	for _, d := range s.Docs {
		var key uuid.UUID
		if d.ParentDocumentID != nil {
			key = *d.ParentDocumentID
		}
		s.ChildrenByParent[key] = append(s.ChildrenByParent[key], d)
	}
	for k := range s.ChildrenByParent {
		group := s.ChildrenByParent[k]
		sort.SliceStable(group, func(i, j int) bool { return group[i].SortOrder < group[j].SortOrder })
		s.ChildrenByParent[k] = group
	}

	if s.Root != nil {
		s.TopLevel = []models.WikiDocument{*s.Root}
	} else {
		s.TopLevel = s.ChildrenByParent[uuid.UUID{}]
	}
	return s, nil
}

// Walk visits the scope parent-first in sibling order, passing each
// document's depth below the export root and its index among siblings.
func (s *Scope) Walk(fn func(doc models.WikiDocument, depth, siblingIndex int) bool) {
	var visit func(docs []models.WikiDocument, depth int)
	visit = func(docs []models.WikiDocument, depth int) {
		for i, d := range docs {
			if !fn(d, depth, i) {
				continue
			}
			visit(s.ChildrenByParent[d.DocumentID], depth+1)
		}
	}
	visit(s.TopLevel, 0)
}
