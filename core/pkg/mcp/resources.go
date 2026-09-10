package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/focus"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/graphql/gqlctx"
	"github.com/vibe-c2/vibe-c2-core/core/pkg/models"
)

// Resources let an agent cite a wiki page or a host by URI instead of spending
// a tool call to fetch it, and let a client attach one to a conversation
// directly. They read through exactly the same authorization as the tools —
// a resource URI is not a way around the scope list or the role ceiling.
const (
	wikiResourceScheme  = "vibe://op/"
	focusResourceURI    = "vibe://session/focus"
	guideResourceURI    = "vibe://guide"
	resourceMIMEText    = "text/markdown"
	resourceMIMEJSON    = "application/json"
	resourceMIMEPlain   = "text/plain"
	wikiResourceSegment = "/wiki/"
	hostResourceSegment = "/host/"
)

func registerResources(s *Server) {
	s.server.AddResourceTemplate(&mcp.ResourceTemplate{
		Name:        "wiki-page",
		Title:       "Wiki page",
		URITemplate: "vibe://op/{operationId}/wiki/{documentId}",
		Description: "A wiki page's Markdown body. Same access rules as get_wiki_document.",
		MIMEType:    resourceMIMEText,
	}, s.readResource)

	s.server.AddResourceTemplate(&mcp.ResourceTemplate{
		Name:        "host",
		Title:       "Host",
		URITemplate: "vibe://op/{operationId}/host/{hostId}",
		Description: "One host with its interfaces, routes and login footprints, as JSON.",
		MIMEType:    resourceMIMEJSON,
	}, s.readResource)

	s.server.AddResource(&mcp.Resource{
		Name:  "vibe-c2-guide",
		Title: "How to work in Vibe C2",
		URI:   guideResourceURI,
		Description: "The platform's data model, the full tool surface, and how to work " +
			"alongside the operator. Read this first if you have not worked here before.",
		MIMEType: resourceMIMEText,
	}, s.readResource)

	s.server.AddResource(&mcp.Resource{
		Name:        "operator-focus",
		Title:       "What the operator is looking at",
		URI:         focusResourceURI,
		Description: "The operator's current location in the app, or a note that they are away.",
		MIMEType:    resourceMIMEJSON,
	}, s.readResource)
}

// readResource dispatches every vibe:// URI. One handler rather than three
// closures so the authorization path is impossible to skip for a new kind.
func (s *Server) readResource(ctx context.Context, req *mcp.ReadResourceRequest) (*mcp.ReadResourceResult, error) {
	uri := req.Params.URI

	if uri == guideResourceURI {
		// No authorization: the guide describes the tool surface, which the
		// caller can already enumerate, and contains nothing about any
		// operation. Gating it would only stop an agent learning how to
		// behave.
		return textResource(uri, resourceMIMEText, s.GuideText()), nil
	}

	if uri == focusResourceURI {
		return s.readFocusResource(ctx, uri)
	}

	opID, kind, id, err := parseVibeURI(uri)
	if err != nil {
		return nil, err
	}
	if _, err := s.authorizeOperation(ctx, opID, models.OperationRoleViewer); err != nil {
		return nil, err
	}

	switch kind {
	case "wiki":
		doc, err := s.deps.WikiDocs.WikiDocument(ctx, id)
		if err != nil || doc.OperationID != opID {
			return nil, fmt.Errorf("wiki page not found")
		}
		body, _ := truncateBody(s.documentMarkdown(ctx, doc))
		return textResource(uri, resourceMIMEText, body), nil
	case "host":
		host, err := s.deps.Hosts.Host(ctx, id)
		if err != nil || host.OperationID != opID {
			return nil, fmt.Errorf("host not found")
		}
		encoded, err := encodeResult(toHostDetailView(host))
		if err != nil {
			return nil, fmt.Errorf("failed to encode host: %w", err)
		}
		return textResource(uri, resourceMIMEJSON, string(encoded)), nil
	}

	return nil, fmt.Errorf("unknown resource %q", uri)
}

func (s *Server) readFocusResource(ctx context.Context, uri string) (*mcp.ReadResourceResult, error) {
	auth := gqlctx.AuthFromContext(ctx)
	current, ok := focus.Read(ctx, s.deps.Cache, auth.UserID)
	if !ok {
		return textResource(uri, resourceMIMEPlain,
			"The operator is not currently active in the app."), nil
	}
	encoded, err := json.Marshal(current)
	if err != nil {
		return nil, fmt.Errorf("failed to encode focus: %w", err)
	}
	return textResource(uri, resourceMIMEJSON, string(encoded)), nil
}

func textResource(uri, mime, text string) *mcp.ReadResourceResult {
	return &mcp.ReadResourceResult{
		Contents: []*mcp.ResourceContents{{URI: uri, MIMEType: mime, Text: text}},
	}
}

// parseVibeURI splits vibe://op/{operationId}/{kind}/{id}.
func parseVibeURI(uri string) (uuid.UUID, string, string, error) {
	if !strings.HasPrefix(uri, wikiResourceScheme) {
		return uuid.Nil, "", "", fmt.Errorf("unknown resource %q", uri)
	}
	rest := strings.TrimPrefix(uri, wikiResourceScheme)

	var kind, segment string
	switch {
	case strings.Contains(rest, wikiResourceSegment):
		kind, segment = "wiki", wikiResourceSegment
	case strings.Contains(rest, hostResourceSegment):
		kind, segment = "host", hostResourceSegment
	default:
		return uuid.Nil, "", "", fmt.Errorf("unknown resource %q", uri)
	}

	opPart, idPart, found := strings.Cut(rest, segment)
	if !found || opPart == "" || idPart == "" {
		return uuid.Nil, "", "", fmt.Errorf("malformed resource uri %q", uri)
	}
	opID, err := uuid.Parse(opPart)
	if err != nil {
		return uuid.Nil, "", "", fmt.Errorf("malformed operation id in %q", uri)
	}
	return opID, kind, idPart, nil
}
