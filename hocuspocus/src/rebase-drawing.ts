// Rebase a drawing's scene onto a new set of identifiers.
//
// The prose counterpart is rebase-document.ts, and the problem is the same: a
// page that moves between operations or installations references things by id,
// and every one of those ids is minted afresh by the target on import. For a
// drawing the only such reference is an image's `fileId`, but leaving it alone
// is not a cosmetic failure — the id points at a blob in the source
// installation, so every picture on the imported diagram renders as an empty
// frame and the attachment index records a reference to something that is not
// there.
//
// The result is built into a *fresh* Y.Doc rather than by mutating the source
// state. The imported page is a new document, and it should not inherit the
// source's edit history; building fresh also drops tombstones, so an imported
// drawing carries only the shapes that are actually on it.

import * as Y from "yjs";

import {
  DRAWING_ROOT_KEY,
  deriveDrawingProjection,
  type DrawingProjection,
} from "./drawing-projection.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RebaseDrawingRequest {
  /** The source page's Y.js state. */
  contentState: Uint8Array;
  /** source id → target id, for the attachments the importer has ingested. */
  idMap: Record<string, string>;
}

export interface RebaseDrawingResult extends DrawingProjection {
  /** Fresh Y.js state encoding the rebased scene. */
  contentState: Uint8Array;
  /** Image ids the scene references that the importer did not map. Reported
   * rather than silently dropped: the page still imports, and the operator is
   * told which pictures did not come with it. */
  unmapped: string[];
  /** How many fileIds were rewritten. */
  remapped: number;
}

type SceneElement = Record<string, unknown>;

export function rebaseDrawing(req: RebaseDrawingRequest): RebaseDrawingResult {
  const source = new Y.Doc();
  Y.applyUpdate(source, req.contentState);

  // Case-insensitive lookup: ids travel through JSON and Mongo in whatever
  // case each side happened to use, and a mismatch here would silently mean
  // "unmapped" for an id the importer did in fact ingest.
  const idMap = new Map<string, string>();
  for (const [from, to] of Object.entries(req.idMap)) {
    idMap.set(from.toLowerCase(), to);
  }

  const unmapped = new Set<string>();
  let remapped = 0;

  const target = new Y.Doc();
  const targetElements = target.getMap<SceneElement>(DRAWING_ROOT_KEY);

  target.transact(() => {
    for (const [key, value] of source.getMap<SceneElement>(DRAWING_ROOT_KEY).entries()) {
      if (typeof value !== "object" || value === null) continue;
      // Tombstones are how a live room propagates an erasure. A fresh document
      // has nobody to tell, so an erased shape is simply not carried over.
      if (value.isDeleted === true) continue;

      const element: SceneElement = { ...value };

      if (element.type === "image" && typeof element.fileId === "string") {
        const fileId = element.fileId;
        // Only ids that look like ours were ever wiki images. An id Excalidraw
        // minted (an upload that never completed on the source) points at no
        // blob on either side, so there is nothing to map and nothing to warn
        // about.
        if (UUID_RE.test(fileId)) {
          const mapped = idMap.get(fileId.toLowerCase());
          if (mapped) {
            element.fileId = mapped;
            remapped++;
          } else {
            unmapped.add(fileId.toLowerCase());
          }
        }
      }

      targetElements.set(key, element);
    }
  });

  return {
    contentState: Y.encodeStateAsUpdate(target),
    ...deriveDrawingProjection(target),
    unmapped: [...unmapped],
    remapped,
  };
}
