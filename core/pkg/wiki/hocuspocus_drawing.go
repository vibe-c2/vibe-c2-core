package wiki

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

// Drawing scenes, read and written through the sidecar.
//
// Both directions go through the live Y.js room rather than through Mongo, for
// the same reason ApplyMarkdown does: a connected canvas holds the
// authoritative document in memory and writes it back on the next debounce, so
// a direct row write is either erased seconds later or lands mid-stroke.
// Reading through the room additionally means an agent asked to look at a
// diagram somebody is drawing sees what is on their screen, not what was last
// flushed.

// DrawingMode is what a write does to the scene.
type DrawingMode string

const (
	// DrawingAdd inserts elements, leaving everything already there alone.
	DrawingAdd DrawingMode = "add"
	// DrawingUpdate merges fields into existing elements by id. An id that is
	// not on the canvas is skipped rather than inserted — the usual cause is a
	// stale read, and inventing the element would hide that.
	DrawingUpdate DrawingMode = "update"
	// DrawingDelete tombstones elements by id.
	DrawingDelete DrawingMode = "delete"
	// DrawingReplace tombstones the whole scene and writes a new one, in a
	// single transaction so collaborators never see the canvas empty.
	DrawingReplace DrawingMode = "replace"
)

// ErrDrawingElementsInvalid is a caller error: the elements were understood
// and rejected. Kept distinct from a transport failure so the MCP layer can
// refuse (a policy answer) rather than report a fault.
var ErrDrawingElementsInvalid = errors.New("invalid drawing elements")

// DrawingElement is one Excalidraw element, carried opaquely.
//
// Deliberately untyped: the element schema belongs to Excalidraw, changes with
// it, and nothing in Go reads a field of one. Mirroring it here would be a
// second definition to keep in step for no benefit — the sidecar normalizes
// and validates, because that is where the schema already lives.
type DrawingElement map[string]any

type drawingReadRequest struct {
	DocumentID string `json:"documentId"`
}

// DrawingScene is the live scene, with deleted elements already filtered out.
type DrawingScene struct {
	Elements []DrawingElement `json:"elements"`
	Watchers int              `json:"watchers"`
}

type drawingApplyRequest struct {
	DocumentID string           `json:"documentId"`
	Mode       DrawingMode      `json:"mode"`
	Elements   []DrawingElement `json:"elements,omitempty"`
	ElementIDs []string         `json:"elementIds,omitempty"`
	UserID     string           `json:"userId,omitempty"`
}

// ApplyDrawingResult reports what the sidecar did. Watchers is how many people
// had the page open — the difference between an edit somebody watched appear
// and one that happened quietly.
type ApplyDrawingResult struct {
	Applied  int `json:"applied"`
	Watchers int `json:"watchers"`
	// Warning describes something the write did that succeeded and is probably
	// not what was meant — shapes stacked exactly on top of one another, most
	// often. Empty when there is nothing to say.
	Warning string `json:"warning,omitempty"`
}

// ReadDrawing returns the scene as it stands in the live room.
func (c *HocuspocusClient) ReadDrawing(ctx context.Context, documentID string) (DrawingScene, error) {
	var scene DrawingScene

	body, err := json.Marshal(drawingReadRequest{DocumentID: documentID})
	if err != nil {
		return scene, fmt.Errorf("marshal drawing read payload: %w", err)
	}

	resp, err := c.postInternal(ctx, "/internal/drawing/read", body)
	if err != nil {
		return scene, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return scene, fmt.Errorf("drawing read returned %d: %s", resp.StatusCode, string(errBody))
	}

	// A scene is bounded by the sidecar's per-call element cap, but each
	// element is a couple of hundred bytes of geometry, so the envelope is
	// generous rather than tight.
	if err := json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(&scene); err != nil {
		return scene, fmt.Errorf("read drawing response: %w", err)
	}
	return scene, nil
}

// ApplyDrawing edits a drawing as a Y.js transaction on the live document.
func (c *HocuspocusClient) ApplyDrawing(
	ctx context.Context,
	documentID string,
	mode DrawingMode,
	elements []DrawingElement,
	elementIDs []string,
	userID string,
) (ApplyDrawingResult, error) {
	var result ApplyDrawingResult

	switch mode {
	case DrawingAdd, DrawingUpdate, DrawingDelete, DrawingReplace:
	default:
		return result, fmt.Errorf("apply-drawing: unknown mode %q", mode)
	}

	body, err := json.Marshal(drawingApplyRequest{
		DocumentID: documentID,
		Mode:       mode,
		Elements:   elements,
		ElementIDs: elementIDs,
		UserID:     userID,
	})
	if err != nil {
		return result, fmt.Errorf("marshal drawing apply payload: %w", err)
	}

	resp, err := c.postInternal(ctx, "/internal/drawing/apply", body)
	if err != nil {
		return result, err
	}
	defer resp.Body.Close()

	// 422 is the sidecar saying the elements themselves are wrong, with the
	// offending entry named. That is the agent's to fix, so the message is
	// carried through rather than flattened into "apply failed".
	if resp.StatusCode == http.StatusUnprocessableEntity {
		var payload struct {
			Error string `json:"error"`
		}
		_ = json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&payload)
		return result, fmt.Errorf("%w: %s", ErrDrawingElementsInvalid, payload.Error)
	}
	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return result, fmt.Errorf("apply-drawing returned %d: %s", resp.StatusCode, string(errBody))
	}

	if err := json.NewDecoder(io.LimitReader(resp.Body, 4096)).Decode(&result); err != nil {
		return result, fmt.Errorf("read apply-drawing response: %w", err)
	}
	return result, nil
}

// postInternal signs a body with the shared secret and posts it to one of the
// sidecar's internal routes. The signature is over the exact bytes sent, which
// is why those routes read the raw body before any JSON middleware.
func (c *HocuspocusClient) postInternal(ctx context.Context, path string, body []byte) (*http.Response, error) {
	if c.internalSecret == "" {
		return nil, fmt.Errorf("%s: no internal secret configured", path)
	}

	mac := hmac.New(sha256.New, []byte(c.internalSecret))
	mac.Write(body)
	signature := "sha256=" + hex.EncodeToString(mac.Sum(nil))

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build %s request: %w", path, err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Signature-256", signature)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call hocuspocus %s: %w", path, err)
	}
	return resp, nil
}

// RebaseDrawingRequest rebases a drawing's scene onto the target's ids.
type RebaseDrawingRequest struct {
	ContentState []byte
	// IDMap maps every source attachment id the scene may reference to the id
	// it must carry on the target. An image id absent from the map comes back
	// in Unmapped rather than failing the import.
	IDMap map[string]string
}

// RebaseDrawingResult is fresh scene state plus the projection the Go backend
// needs to create the page fully indexed in one write — the drawing analogue
// of RebaseResult.
type RebaseDrawingResult struct {
	ContentState    []byte
	Content         string   `json:"content"`
	ImageReferences []string `json:"imageReferences"`
	ElementCount    int      `json:"elementCount"`
	VersionSum      int      `json:"versionSum"`
	// Unmapped lists image ids the scene references that the importer did not
	// ingest. The page still imports; those pictures are missing from it.
	Unmapped []string `json:"unmapped"`
	Remapped int      `json:"remapped"`
}

type rebaseDrawingWireRequest struct {
	ContentState string            `json:"contentState"`
	IDMap        map[string]string `json:"idMap"`
}

type rebaseDrawingWireResponse struct {
	ContentState string `json:"contentState"`
	RebaseDrawingResult
}

// RebaseDrawing rewrites a scene's attachment ids for the target installation.
//
// Without it an imported drawing's images point at blobs in the source
// installation: every picture renders as an empty frame, and the attachment
// index records references to things that are not there. The scene itself is
// carried verbatim — it is the ids that have to move, not the shapes.
func (c *HocuspocusClient) RebaseDrawing(ctx context.Context, req RebaseDrawingRequest) (RebaseDrawingResult, error) {
	var result RebaseDrawingResult

	idMap := req.IDMap
	if idMap == nil {
		idMap = map[string]string{}
	}

	body, err := json.Marshal(rebaseDrawingWireRequest{
		ContentState: base64.StdEncoding.EncodeToString(req.ContentState),
		IDMap:        idMap,
	})
	if err != nil {
		return result, fmt.Errorf("marshal rebase-drawing payload: %w", err)
	}

	resp, err := c.postInternal(ctx, "/internal/rebase-drawing", body)
	if err != nil {
		return result, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return result, fmt.Errorf("rebase-drawing returned %d: %s", resp.StatusCode, string(errBody))
	}

	var wire rebaseDrawingWireResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 16<<20)).Decode(&wire); err != nil {
		return result, fmt.Errorf("read rebase-drawing response: %w", err)
	}

	state, err := base64.StdEncoding.DecodeString(wire.ContentState)
	if err != nil {
		return result, fmt.Errorf("decode rebased scene: %w", err)
	}

	result = wire.RebaseDrawingResult
	result.ContentState = state
	return result, nil
}
