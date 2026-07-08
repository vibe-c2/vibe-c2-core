package resolver

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/qiniu/qmgo"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/eventbus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/repository"
)

// stubDocRepo embeds the full IWikiDocumentRepository so unimplemented methods
// satisfy the interface (and panic if unexpectedly called). The
// InstantiateTemplate happy path touches only FindByID and Create.
type stubDocRepo struct {
	repository.IWikiDocumentRepository
	byID    map[uuid.UUID]models.WikiDocument
	created *models.WikiDocument
	// templates is the row set returned by FindTemplatesByOperationID, keyed by
	// nothing — the stub filters on OperationID to mirror the real query scope.
	templates []models.WikiDocument
	// updated captures the last Update call's field map (nil if Update was
	// never called), so tests can assert the no-op short-circuit.
	updated map[string]interface{}
}

func (s *stubDocRepo) FindByID(_ context.Context, id uuid.UUID) (models.WikiDocument, error) {
	doc, ok := s.byID[id]
	if !ok {
		// Mirror the real repository, whose qmgo .One() returns this sentinel
		// on a miss — resolvers distinguish it from infra errors via errors.Is.
		return models.WikiDocument{}, qmgo.ErrNoSuchDocuments
	}
	return doc, nil
}

func (s *stubDocRepo) Create(_ context.Context, doc *models.WikiDocument) error {
	s.created = doc
	return nil
}

// Update applies the is_template field to the stored doc so the resolver's
// post-update reload reflects the change. Other fields are ignored — the only
// caller exercised here is SetWikiDocumentTemplate.
func (s *stubDocRepo) Update(_ context.Context, doc *models.WikiDocument, updates map[string]interface{}) error {
	s.updated = updates
	cur := s.byID[doc.DocumentID]
	if v, ok := updates["is_template"].(bool); ok {
		cur.IsTemplate = v
	}
	s.byID[doc.DocumentID] = cur
	return nil
}

// FindTemplatesByOperationID returns the stub's prepared template rows for the
// given operation, mirroring the repo contract (already filtered + sorted).
func (s *stubDocRepo) FindTemplatesByOperationID(_ context.Context, opID uuid.UUID) ([]models.WikiDocument, error) {
	var out []models.WikiDocument
	for _, d := range s.templates {
		if d.OperationID == opID {
			out = append(out, d)
		}
	}
	return out, nil
}

// FindDescendantIDs returns the IDs of docs whose materialized path_ids chain
// contains docID, scoped to opID and excluding trashed rows — the stub mirror
// of the real {operation_id, path_ids} index probe.
func (s *stubDocRepo) FindDescendantIDs(_ context.Context, opID, docID uuid.UUID) ([]uuid.UUID, error) {
	var out []uuid.UUID
	for _, d := range s.byID {
		if d.OperationID != opID || d.DeletedAt != nil {
			continue
		}
		for _, p := range d.PathIDs {
			if p == docID {
				out = append(out, d.DocumentID)
				break
			}
		}
	}
	return out, nil
}

// adminCtx authorizes the caller as an app-level admin so authorizeForOperation
// passes for any target operation without modelling membership.
func adminCtx(userID uuid.UUID) context.Context {
	return gqlctx.WithAuthInfo(context.Background(), gqlctx.AuthInfo{
		UserID: userID.String(),
		Roles:  []string{"admin"},
	})
}

// newInstantiateResolver wires a wikiDocumentResolver with just the
// dependencies InstantiateTemplate needs.
func newInstantiateResolver(docRepo repository.IWikiDocumentRepository) *wikiDocumentResolver {
	return &wikiDocumentResolver{
		docRepo: docRepo,
		operationRepo: &mockOpRepo{
			findByIDFn: func(_ context.Context, id uuid.UUID) (models.Operation, error) {
				return models.Operation{OperationID: id}, nil
			},
		},
		eventBus: eventbus.NopEventBus{},
	}
}

func TestInstantiateTemplate_CopiesTemplateIntoOperation(t *testing.T) {
	templateID := uuid.New()
	targetOp := uuid.New()
	caller := uuid.New()

	template := models.WikiDocument{
		DocumentID:        templateID,
		OperationID:       uuid.New(),
		IsTemplate:        true,
		Title:             "Linux Host Recon",
		Content:           "System / Network / Users",
		ContentState:      []byte{0x01, 0x02, 0x03},
		Emoji:             "🐧",
		ChecklistTotal:    9,
		ChecklistRequired: 7,
		ChecklistAnswered: 0,
	}
	repo := &stubDocRepo{byID: map[uuid.UUID]models.WikiDocument{templateID: template}}
	r := newInstantiateResolver(repo)

	got, err := r.InstantiateTemplate(adminCtx(caller), templateID.String(), targetOp.String(), nil, nil, nil, nil, nil)
	if err != nil {
		t.Fatalf("InstantiateTemplate err = %v", err)
	}

	if got.OperationID != targetOp {
		t.Errorf("instance OperationID = %v, want target %v", got.OperationID, targetOp)
	}
	if got.DocumentID == templateID {
		t.Error("instance must get a fresh DocumentID, not the template's")
	}
	if got.SourceTemplateID == nil || *got.SourceTemplateID != templateID {
		t.Errorf("instance SourceTemplateID = %v, want %v", got.SourceTemplateID, templateID)
	}
	if got.IsTemplate {
		t.Error("instance must not itself be a template — forking yields an ordinary document")
	}
	if got.Title != template.Title || got.Content != template.Content || got.Emoji != template.Emoji {
		t.Error("instance should copy title/content/emoji from template")
	}
	if got.ChecklistTotal != 9 || got.ChecklistRequired != 7 || got.ChecklistAnswered != 0 {
		t.Errorf("coverage = %d/%d/%d, want 0/7/9 (answered/required/total)",
			got.ChecklistAnswered, got.ChecklistRequired, got.ChecklistTotal)
	}

	// ContentState must be byte-equal but a distinct backing array — mutating
	// the template must never reach into the instance's CRDT seed.
	if string(got.ContentState) != string(template.ContentState) {
		t.Errorf("ContentState not copied: got %v want %v", got.ContentState, template.ContentState)
	}
	template.ContentState[0] = 0xFF
	if got.ContentState[0] == 0xFF {
		t.Error("ContentState aliases the template — must be an independent copy")
	}
}

func TestInstantiateTemplate_UsesOperatorTitleWhenGiven(t *testing.T) {
	templateID := uuid.New()
	template := models.WikiDocument{
		DocumentID:  templateID,
		OperationID: uuid.New(),
		IsTemplate:  true,
		Title:       "Linux Host Recon",
	}
	repo := &stubDocRepo{byID: map[uuid.UUID]models.WikiDocument{templateID: template}}
	r := newInstantiateResolver(repo)

	custom := "web-01 recon"
	got, err := r.InstantiateTemplate(
		adminCtx(uuid.New()), templateID.String(), uuid.New().String(), nil, &custom, nil, nil, nil,
	)
	if err != nil {
		t.Fatalf("InstantiateTemplate err = %v", err)
	}
	if got.Title != custom {
		t.Errorf("instance Title = %q, want operator title %q", got.Title, custom)
	}
	if got.TitleLower != "web-01 recon" {
		t.Errorf("TitleLower = %q, want lowercased operator title", got.TitleLower)
	}

	// Blank/whitespace title falls back to the template's title.
	blank := "   "
	got2, err := r.InstantiateTemplate(
		adminCtx(uuid.New()), templateID.String(), uuid.New().String(), nil, &blank, nil, nil, nil,
	)
	if err != nil {
		t.Fatalf("InstantiateTemplate (blank) err = %v", err)
	}
	if got2.Title != template.Title {
		t.Errorf("blank title should fall back to template %q, got %q", template.Title, got2.Title)
	}
}

func TestInstantiateTemplate_IconOverrideAndInherit(t *testing.T) {
	templateID := uuid.New()
	template := models.WikiDocument{
		DocumentID:  templateID,
		OperationID: uuid.New(),
		IsTemplate:  true,
		Title:       "Linux Host Recon",
		Emoji:       "🐧",
		Icon:        "penguin",
		Color:       "green",
	}
	repo := &stubDocRepo{byID: map[uuid.UUID]models.WikiDocument{templateID: template}}
	r := newInstantiateResolver(repo)

	// Non-nil icon args override the inherited glyphs; the operator picked a
	// lucide icon (emoji cleared to "") in a new color.
	overrideEmoji, overrideIcon, overrideColor := "", "server", "blue"
	got, err := r.InstantiateTemplate(
		adminCtx(uuid.New()), templateID.String(), uuid.New().String(), nil, nil,
		&overrideEmoji, &overrideIcon, &overrideColor,
	)
	if err != nil {
		t.Fatalf("InstantiateTemplate err = %v", err)
	}
	if got.Emoji != "" || got.Icon != "server" || got.Color != "blue" {
		t.Errorf("override icon = %q/%q/%q, want \"\"/server/blue", got.Emoji, got.Icon, got.Color)
	}

	// Nil icon args inherit every glyph from the template unchanged.
	got2, err := r.InstantiateTemplate(
		adminCtx(uuid.New()), templateID.String(), uuid.New().String(), nil, nil,
		nil, nil, nil,
	)
	if err != nil {
		t.Fatalf("InstantiateTemplate (inherit) err = %v", err)
	}
	if got2.Emoji != "🐧" || got2.Icon != "penguin" || got2.Color != "green" {
		t.Errorf("inherited icon = %q/%q/%q, want template's 🐧/penguin/green",
			got2.Emoji, got2.Icon, got2.Color)
	}
}

func TestInstantiateTemplate_RejectsNonTemplateSource(t *testing.T) {
	srcID := uuid.New()
	// An ordinary document (IsTemplate=false) is not a fork source.
	src := models.WikiDocument{DocumentID: srcID, OperationID: uuid.New(), Title: "just a doc"}
	repo := &stubDocRepo{byID: map[uuid.UUID]models.WikiDocument{srcID: src}}
	r := newInstantiateResolver(repo)

	_, err := r.InstantiateTemplate(adminCtx(uuid.New()), srcID.String(), uuid.New().String(), nil, nil, nil, nil, nil)
	if err == nil || !strings.Contains(err.Error(), "is not a template") {
		t.Fatalf("want not-a-template error, got %v", err)
	}
	if repo.created != nil {
		t.Error("no document should be created when the source is not a template")
	}
}

func TestInstantiateTemplate_RejectsTrashedTemplate(t *testing.T) {
	templateID := uuid.New()
	ts := time.Now().UTC()
	deleted := models.WikiDocument{
		DocumentID:  templateID,
		OperationID: uuid.New(),
		IsTemplate:  true,
		DeletedAt:   &ts,
	}
	repo := &stubDocRepo{byID: map[uuid.UUID]models.WikiDocument{templateID: deleted}}
	r := newInstantiateResolver(repo)

	_, err := r.InstantiateTemplate(adminCtx(uuid.New()), templateID.String(), uuid.New().String(), nil, nil, nil, nil, nil)
	if err == nil || !strings.Contains(err.Error(), "trashed template") {
		t.Fatalf("want trashed-template error, got %v", err)
	}
}

func TestWikiTemplates_ReturnsOperationTemplates(t *testing.T) {
	targetOp := uuid.New()
	otherOp := uuid.New()
	a := models.WikiDocument{DocumentID: uuid.New(), OperationID: targetOp, IsTemplate: true, Title: "Alpha"}
	b := models.WikiDocument{DocumentID: uuid.New(), OperationID: targetOp, IsTemplate: true, Title: "Beta"}
	elsewhere := models.WikiDocument{DocumentID: uuid.New(), OperationID: otherOp, IsTemplate: true, Title: "Gamma"}
	repo := &stubDocRepo{templates: []models.WikiDocument{a, b, elsewhere}}
	r := newInstantiateResolver(repo)

	got, err := r.WikiTemplates(adminCtx(uuid.New()), targetOp.String())
	if err != nil {
		t.Fatalf("WikiTemplates err = %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("got %d templates, want 2 (scoped to the operation)", len(got))
	}
	for _, d := range got {
		if d.OperationID != targetOp {
			t.Errorf("template %q from operation %v leaked into scope %v", d.Title, d.OperationID, targetOp)
		}
	}
}

func TestWikiTemplates_RejectsInvalidOperationID(t *testing.T) {
	repo := &stubDocRepo{}
	r := newInstantiateResolver(repo)

	if _, err := r.WikiTemplates(adminCtx(uuid.New()), "not-a-uuid"); err == nil {
		t.Fatal("want error for malformed operation ID, got nil")
	}
}

func TestSetWikiDocumentTemplate_FlagsAndUnflags(t *testing.T) {
	docID := uuid.New()
	doc := models.WikiDocument{DocumentID: docID, OperationID: uuid.New(), Title: "Recon"}
	repo := &stubDocRepo{byID: map[uuid.UUID]models.WikiDocument{docID: doc}}
	r := newInstantiateResolver(repo)

	got, err := r.SetWikiDocumentTemplate(adminCtx(uuid.New()), docID.String(), true)
	if err != nil {
		t.Fatalf("SetWikiDocumentTemplate err = %v", err)
	}
	if !got.IsTemplate {
		t.Error("document should be flagged as a template")
	}
	if v, ok := repo.updated["is_template"].(bool); !ok || !v {
		t.Errorf("Update should set is_template=true, got %v", repo.updated["is_template"])
	}
}

func TestSetWikiDocumentTemplate_NoOpWhenUnchanged(t *testing.T) {
	docID := uuid.New()
	doc := models.WikiDocument{DocumentID: docID, OperationID: uuid.New(), IsTemplate: true}
	repo := &stubDocRepo{byID: map[uuid.UUID]models.WikiDocument{docID: doc}}
	r := newInstantiateResolver(repo)

	got, err := r.SetWikiDocumentTemplate(adminCtx(uuid.New()), docID.String(), true)
	if err != nil {
		t.Fatalf("SetWikiDocumentTemplate err = %v", err)
	}
	if !got.IsTemplate {
		t.Error("already-template document should stay a template")
	}
	if repo.updated != nil {
		t.Error("a redundant toggle must not write — no Update call expected")
	}
}

func TestSetWikiDocumentTemplate_RejectsTrashed(t *testing.T) {
	docID := uuid.New()
	ts := time.Now().UTC()
	doc := models.WikiDocument{DocumentID: docID, OperationID: uuid.New(), DeletedAt: &ts}
	repo := &stubDocRepo{byID: map[uuid.UUID]models.WikiDocument{docID: doc}}
	r := newInstantiateResolver(repo)

	_, err := r.SetWikiDocumentTemplate(adminCtx(uuid.New()), docID.String(), true)
	if err == nil || !strings.Contains(err.Error(), "trashed") {
		t.Fatalf("want trashed-document error, got %v", err)
	}
	if repo.updated != nil {
		t.Error("no write should happen for a trashed document")
	}
}

func TestWikiDocumentDescendantIDs_ExcludesSubtree(t *testing.T) {
	op := uuid.New()
	rootID := uuid.New()
	childID := uuid.New()
	grandchildID := uuid.New()
	outsideID := uuid.New()
	docs := map[uuid.UUID]models.WikiDocument{
		rootID:       {DocumentID: rootID, OperationID: op},
		childID:      {DocumentID: childID, OperationID: op, PathIDs: []uuid.UUID{rootID}},
		grandchildID: {DocumentID: grandchildID, OperationID: op, PathIDs: []uuid.UUID{rootID, childID}},
		outsideID:    {DocumentID: outsideID, OperationID: op},
	}
	repo := &stubDocRepo{byID: docs}
	r := newInstantiateResolver(repo)

	got, err := r.WikiDocumentDescendantIDs(adminCtx(uuid.New()), rootID.String())
	if err != nil {
		t.Fatalf("WikiDocumentDescendantIDs err = %v", err)
	}
	// Descendants of rootID only — the target itself and the unrelated doc must
	// not appear (the caller adds the target's own id to the exclusion set).
	want := map[string]bool{childID.String(): true, grandchildID.String(): true}
	if len(got) != len(want) {
		t.Fatalf("got %d descendant IDs, want %d", len(got), len(want))
	}
	for _, id := range got {
		if !want[id] {
			t.Errorf("unexpected descendant ID %s (root/outside must not appear)", id)
		}
	}
}

func TestWikiDocumentDescendantIDs_MissingDocumentReturnsEmpty(t *testing.T) {
	repo := &stubDocRepo{byID: map[uuid.UUID]models.WikiDocument{}}
	r := newInstantiateResolver(repo)

	got, err := r.WikiDocumentDescendantIDs(adminCtx(uuid.New()), uuid.New().String())
	if err != nil {
		t.Fatalf("want nil error for missing document, got %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("want empty descendant set for missing document, got %d", len(got))
	}
}

func TestWikiDocumentDescendantIDs_TrashedTargetReturnsEmpty(t *testing.T) {
	op := uuid.New()
	rootID := uuid.New()
	childID := uuid.New()
	ts := time.Now().UTC()
	docs := map[uuid.UUID]models.WikiDocument{
		// Target is trashed; its (still-active) child must not be reported —
		// the resolver short-circuits before probing descendants.
		rootID:  {DocumentID: rootID, OperationID: op, DeletedAt: &ts},
		childID: {DocumentID: childID, OperationID: op, PathIDs: []uuid.UUID{rootID}},
	}
	repo := &stubDocRepo{byID: docs}
	r := newInstantiateResolver(repo)

	got, err := r.WikiDocumentDescendantIDs(adminCtx(uuid.New()), rootID.String())
	if err != nil {
		t.Fatalf("want nil error for trashed target, got %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("want empty descendant set for trashed target, got %d", len(got))
	}
}

func TestWikiDocumentDescendantIDs_RejectsInvalidID(t *testing.T) {
	repo := &stubDocRepo{}
	r := newInstantiateResolver(repo)

	if _, err := r.WikiDocumentDescendantIDs(adminCtx(uuid.New()), "not-a-uuid"); err == nil {
		t.Fatal("want error for malformed document ID, got nil")
	}
}
