package markdown

import (
	"context"
	"io"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer/transfertest"
	"go.uber.org/zap"
)

// TestReadPlan_Fixture reads the real Outline export into a Plan: one
// collection page holding the three documents, attachment links rewritten
// to the canonical form under minted ids.
func TestReadPlan_Fixture(t *testing.T) {
	zr := openFixture(t)
	plan, err := ReadPlan(&zr.Reader)
	if err != nil {
		t.Fatalf("ReadPlan: %v", err)
	}
	if plan.SourceOperationID != uuid.Nil || plan.BundleID == uuid.Nil {
		t.Errorf("foreign plan must carry no source op and a fresh bundle id")
	}
	if len(plan.Pages) != 1 || plan.Pages[0].Title != "test" || plan.Pages[0].HasBody() {
		t.Fatalf("expected one empty collection page, got %+v", plan.Pages)
	}
	if got := plan.CountPages(); got != 4 {
		t.Errorf("CountPages = %d, want 4 (collection + 3 docs)", got)
	}
	if len(plan.Attachments) != 2 {
		t.Fatalf("attachments = %d, want 2", len(plan.Attachments))
	}

	var withImage, withFile *wikitransfer.Page
	plan.Walk(func(p *wikitransfer.Page, _ int) {
		if strings.Contains(p.Markdown, "/api/v1/wiki/images/") {
			withImage = p
		}
		if strings.Contains(p.Markdown, "/api/v1/wiki/files/") {
			withFile = p
		}
		if strings.Contains(p.Markdown, "uploads/") {
			t.Errorf("page %q still references uploads/: %s", p.Title, p.Markdown)
		}
	})
	if withImage == nil || withFile == nil {
		t.Fatal("expected pages with an image and a file reference")
	}
	for _, id := range withImage.Attachments {
		att := plan.Attachments[id]
		if att.Kind == wikitransfer.AttachmentImage {
			if !strings.Contains(withImage.Markdown, "/api/v1/wiki/images/"+id.String()) {
				t.Error("image link must use the minted attachment id")
			}
			rc, err := att.Open()
			if err != nil {
				t.Fatal(err)
			}
			b, _ := io.ReadAll(rc)
			_ = rc.Close()
			if len(b) == 0 {
				t.Error("attachment must open to its bytes")
			}
		}
	}
}

// TestReadPlan_ThroughMaterialiser drives the fixture through the shared
// materialiser and checks every created page carries its attachment index
// — the guarantee the old importer lacked.
func TestReadPlan_ThroughMaterialiser(t *testing.T) {
	zr := openFixture(t)
	plan, err := ReadPlan(&zr.Reader)
	if err != nil {
		t.Fatalf("ReadPlan: %v", err)
	}
	docs := transfertest.NewDocRepo()
	ingestor := transfertest.NewIngestor()
	m := wikitransfer.NewMaterialiser(docs, nil, nil, nil, ingestor, &transfertest.Rebaser{}, nil, zap.NewNop())
	report, err := m.Run(context.Background(), plan, wikitransfer.Target{OperationID: uuid.New(), CallerID: uuid.New()}, nil)
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if report.CreatedDocs != 4 || report.ImagesIngested != 1 || report.FilesIngested != 1 {
		t.Fatalf("report = %+v", report)
	}
	indexed := 0
	for _, d := range docs.Docs {
		indexed += len(d.ImageReferences) + len(d.FileReferences)
		for _, id := range d.ImageReferences {
			if ingestor.Owners[id] != d.DocumentID {
				t.Error("image index must name a blob owned by the page")
			}
		}
	}
	if indexed != 2 {
		t.Errorf("expected 2 indexed attachments across pages, got %d", indexed)
	}
}

func TestReadPlan_CredentialFences(t *testing.T) {
	live, dead := uuid.New(), uuid.New()
	body := "intro\n\n```vibe-credential\n{\"id\":\"" + live.String() + "\",\"name\":\"svc\",\"username\":\"u\"}\n```\n\n```vibe-credential\n{\"id\":\"" + dead.String() + "\",\"deleted\":true}\n```\n"
	into := map[uuid.UUID]wikitransfer.CredentialPayload{}
	tomb := map[uuid.UUID]struct{}{}
	collectCredentialFences(body, into, tomb)
	if p, ok := into[live]; !ok || p.Username != "u" {
		t.Errorf("live payload = %+v", into)
	}
	if _, ok := tomb[dead]; !ok {
		t.Error("tombstone not collected")
	}
}
