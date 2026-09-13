package controller

import (
	"context"
	"io"

	"github.com/google/uuid"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wiki"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/wikitransfer"
)

// wikiTransferIngestor adapts the image and file upload controllers to the
// wikitransfer.Ingestor interface, so the materialiser stores attachments
// through exactly the code path a browser upload takes.
type wikiTransferIngestor struct {
	images *WikiImageController
	files  *WikiFileController
}

// NewWikiTransferIngestor builds the adapter.
func NewWikiTransferIngestor(images *WikiImageController, files *WikiFileController) wikitransfer.Ingestor {
	return &wikiTransferIngestor{images: images, files: files}
}

func (i *wikiTransferIngestor) IngestImageWithID(ctx context.Context, doc *models.WikiDocument, uploaderID uuid.UUID, body io.Reader, imageID uuid.UUID) (*models.WikiImage, *wiki.IngestError) {
	return i.images.IngestImageWithID(ctx, doc, uploaderID, body, imageID)
}

func (i *wikiTransferIngestor) IngestFileWithID(ctx context.Context, doc *models.WikiDocument, uploaderID uuid.UUID, body io.Reader, filename, declaredContentType string, fileID uuid.UUID) (*models.WikiFile, *wiki.IngestError) {
	return i.files.IngestFileWithID(ctx, doc, uploaderID, body, filename, declaredContentType, fileID)
}

func (i *wikiTransferIngestor) DiscardImage(ctx context.Context, imageID uuid.UUID) error {
	return i.images.DiscardImage(ctx, imageID)
}

func (i *wikiTransferIngestor) DiscardFile(ctx context.Context, fileID uuid.UUID) error {
	return i.files.DiscardFile(ctx, fileID)
}
