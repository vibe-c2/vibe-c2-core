// The persisted projection of a drawing page's body.
//
// The prose counterpart is projection.ts, which walks a ProseMirror fragment.
// This walks the Excalidraw scene instead, and produces the same three kinds
// of thing the Go backend needs from any body:
//
//   - searchable text, so a diagram can be found by the words on it;
//   - the attachment index, so the image garbage collector can see which
//     blobs a drawing is using;
//   - a change signal, so a real edit can be told from an open-time no-op.
//
// The change signal is the one that is easy to overlook and impossible to work
// around later. persistence.ts decides whether a save was a genuine edit by
// diffing the projection against what is stored — and a drawing's *text* does
// not move when somebody drags a box across the canvas. Without a dimension
// that tracks the scene itself, every drawing edit would look like a no-op:
// no updateAt, no last-editor attribution, no webhook, and the page would
// never appear in "recently updated" however much work went into it.

import * as Y from "yjs";

/** Root key holding the scene. Mirrors DRAWING_ROOT_KEY in
 * frontend/src/components/wiki/drawing/drawing-scene.ts — the two are one
 * wire format and must be changed together. */
export const DRAWING_ROOT_KEY = "excalidraw";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One element of an Excalidraw scene, in the shape this module reads. Only
 * the fields the projection touches are named; a scene carries about twenty
 * more per element and none of them are the backend's business. */
interface SceneElement {
  type?: string;
  isDeleted?: boolean;
  version?: number;
  text?: string;
  fileId?: string;
  name?: string;
}

export interface DrawingProjection {
  /** Plain text from the scene's labels — the search index field. */
  content: string;
  /** Wiki image ids the scene references. Drives the image sweeper. */
  imageReferences: string[];
  /** Live (non-deleted) elements. Zero means an empty canvas, which is what
   * `hasContent` reads to tell a real drawing from a blank one. */
  elementCount: number;
  /** Sum of every live element's version. Excalidraw bumps an element's
   * version on every change to it, so this moves whenever anything on the
   * canvas moves — which is precisely the change signal described above. It is
   * not a checksum and does not need to be: it only has to differ between two
   * states of the same scene. */
  versionSum: number;
}

export const EMPTY_DRAWING_PROJECTION: DrawingProjection = {
  content: "",
  imageReferences: [],
  elementCount: 0,
  versionSum: 0,
};

/** The scene's elements, as plain objects. */
function sceneElements(ydoc: Y.Doc): SceneElement[] {
  const elements = ydoc.getMap<SceneElement>(DRAWING_ROOT_KEY);
  return [...elements.values()].filter(
    (el): el is SceneElement => typeof el === "object" && el !== null,
  );
}

/**
 * Whether this document's Y.js state actually holds a drawing.
 *
 * The document's `kind` is the authority on what a page *is*; this answers
 * what its bytes currently *contain*, which is what a caller with no Mongo row
 * to hand (the rebase route, a diagnostic) has to go on.
 */
export function isDrawingState(ydoc: Y.Doc): boolean {
  return ydoc.getMap(DRAWING_ROOT_KEY).size > 0;
}

/**
 * Derive the projection of a drawing scene.
 *
 * Deleted elements are skipped throughout. Excalidraw keeps them as tombstones
 * so peers learn about erasures, but a tombstone is not content: counting one
 * would keep a page looking non-empty after everything on it was rubbed out,
 * and — worse — would keep an erased image's blob alive forever, since the
 * sweeper only reclaims what no document references.
 */
export function deriveDrawingProjection(ydoc: Y.Doc): DrawingProjection {
  const elements = sceneElements(ydoc);
  if (elements.length === 0) return EMPTY_DRAWING_PROJECTION;

  const labels: string[] = [];
  const imageIDs = new Set<string>();
  let elementCount = 0;
  let versionSum = 0;

  for (const el of elements) {
    if (el.isDeleted) continue;
    elementCount++;
    versionSum += typeof el.version === "number" ? el.version : 0;

    // Text elements carry both free-floating labels and the captions bound to
    // a shape — Excalidraw models a labelled box as a rectangle plus a text
    // element pointing at it — so reading text elements covers both.
    if (el.type === "text" && typeof el.text === "string") {
      const text = el.text.trim();
      if (text !== "") labels.push(text);
    }

    // A frame's name is the only label it has, and it is usually the name of
    // whatever region of the diagram it groups — exactly what somebody would
    // search for.
    if (el.type === "frame" && typeof el.name === "string") {
      const name = el.name.trim();
      if (name !== "") labels.push(name);
    }

    if (el.type === "image" && typeof el.fileId === "string") {
      // Only ids that are ours. An image still being uploaded carries the id
      // Excalidraw minted for it, which points at no blob and must not enter
      // the index.
      if (UUID_RE.test(el.fileId)) imageIDs.add(el.fileId.toLowerCase());
    }
  }

  return {
    content: labels.join("\n"),
    imageReferences: [...imageIDs],
    elementCount,
    versionSum,
  };
}
