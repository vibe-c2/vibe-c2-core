// Read and edit a drawing page's scene from outside the browser.
//
// The prose equivalent is apply-markdown.ts, and the reason both exist in this
// process rather than in Go is the same: a connected canvas holds the
// authoritative Y.Doc in memory and writes it back on the next debounce, so
// editing the Mongo row directly is either erased seconds later or lands
// mid-stroke. openDirectConnection takes a server-side seat in the same room,
// which turns an agent's edit into an ordinary Y.js transaction — it merges,
// it broadcasts to everyone connected, and it persists through the same store
// a human edit does.
//
// Reads go through the room too, not through Mongo. An agent asked to look at
// a diagram somebody is actively drawing should see what is on their screen,
// not what was last flushed up to two seconds ago.

import type { Express, Request, Response } from "express";
import type { Hocuspocus } from "@hocuspocus/server";
import type * as Y from "yjs";

import { readRawBody, requireSignature } from "./internal-auth.js";
import { inPaintOrder, layerOf } from "./drawing-order.js";
import { DRAWING_ROOT_KEY } from "./drawing-projection.js";
import {
  DrawingElementError,
  normalizeElements,
  normalizePatches,
  type ElementPatch,
  type NormalizedElement,
} from "./drawing-elements.js";

/** Bounds one call. A scene far past this stops being a diagram and starts
 * being a dataset, and the whole thing rides in one Y.js transaction. */
const MAX_ELEMENTS_PER_CALL = 1000;
const MAX_BODY_BYTES = 8 * 1024 * 1024;

type DrawingMode = "add" | "update" | "delete" | "replace";

const MODES: ReadonlySet<string> = new Set<DrawingMode>([
  "add",
  "update",
  "delete",
  "replace",
]);

function roomName(documentId: string): string {
  return `wiki/${documentId}`;
}

function elementsOf(document: Y.Doc): Y.Map<NormalizedElement> {
  return document.getMap<NormalizedElement>(DRAWING_ROOT_KEY);
}

/**
 * How many *people* have this document open.
 *
 * Not getConnectionsCount(), which is `connections.size + directConnectionsCount`
 * and therefore counts the server-side seat this very request is holding. Using
 * it reports one watcher on a page nobody has open, and the caller is told
 * "the operator saw your edit appear" about an empty room. getConnections()
 * returns only the real WebSocket clients, which is the question being asked.
 */
function watcherCount(server: Hocuspocus, documentId: string): number {
  return server.documents.get(roomName(documentId))?.getConnections().length ?? 0;
}

/**
 * Give every element in a batch a layer, so the order it was sent in is the
 * order it is painted.
 *
 * Elements that named a layer keep it — that is the point of the field. The
 * rest stack above whatever is already on the canvas, in the order they
 * arrived, which is what drawing feels like: the last thing you put down is
 * on top.
 */
function assignLayers(
  elements: Y.Map<NormalizedElement>,
  incoming: NormalizedElement[],
): NormalizedElement[] {
  let top = 0;
  for (const existing of elements.values()) {
    if (existing && !existing.isDeleted) top = Math.max(top, layerOf(existing));
  }

  let next = top + 1;
  return incoming.map((el) =>
    typeof el.z === "number" ? el : { ...el, z: next++ },
  );
}

/** A shape's box, for working out where an arrow meets its edge. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function boxOf(el: NormalizedElement | undefined): Box | null {
  if (!el) return null;
  const x = Number(el.x);
  const y = Number(el.y);
  const width = Number(el.width);
  const height = Number(el.height);
  if (![x, y, width, height].every(Number.isFinite)) return null;
  return { x, y, width, height };
}

/** Where a ray from the box's centre leaves its edge, heading towards `to`. */
function edgePoint(box: Box, to: { x: number; y: number }, gap: number): { x: number; y: number } {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = to.x - cx;
  const dy = to.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const halfW = box.width / 2;
  const halfH = box.height / 2;
  // Scale the direction until it touches whichever edge it reaches first.
  const scale = Math.min(
    dx === 0 ? Infinity : halfW / Math.abs(dx),
    dy === 0 ? Infinity : halfH / Math.abs(dy),
  );
  const length = Math.hypot(dx, dy);
  const padded = scale + (length === 0 ? 0 : gap / length);
  return { x: cx + dx * padded, y: cy + dy * padded };
}

/**
 * Place a bound arrow's stroke between the shapes it connects.
 *
 * A binding says which shapes an arrow belongs to. It does not say where the
 * line goes — Excalidraw recomputes that when a person drags something, but a
 * scene written from outside has never been dragged, so whatever geometry
 * arrived is what is drawn. Left to the caller, every arrow in an org chart
 * has to be hand-placed, and getting that wrong looks exactly like getting it
 * right: the write succeeds and the canvas shows one stroke.
 *
 * So an arrow that names both ends and brought no points of its own gets a
 * straight run between the two boxes' edges. Not routed — nothing here avoids
 * a sibling or bends round a frame — but correct and, crucially, different for
 * every pair, which is the property that was missing.
 */
function placeBoundArrow(
  elements: Y.Map<NormalizedElement>,
  arrow: NormalizedElement,
): NormalizedElement {
  const points = arrow.points;
  if (Array.isArray(points) && points.length >= 2) return arrow;

  const start = boxOf(elements.get((arrow.startBinding as { elementId?: string })?.elementId ?? ""));
  const end = boxOf(elements.get((arrow.endBinding as { elementId?: string })?.elementId ?? ""));
  if (!start || !end) {
    // Nothing to measure against. A visible default beats an invisible arrow.
    return { ...arrow, points: [[0, 0], [Number(arrow.width) || 100, 0]] };
  }

  const gap = 4;
  const from = edgePoint(start, { x: end.x + end.width / 2, y: end.y + end.height / 2 }, gap);
  const to = edgePoint(end, { x: start.x + start.width / 2, y: start.y + start.height / 2 }, gap);

  return {
    ...arrow,
    x: from.x,
    y: from.y,
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
    points: [
      [0, 0],
      [to.x - from.x, to.y - from.y],
    ],
  };
}

/** Place every bound arrow in a batch, once the shapes they name are all in
 * the scene. */
function placeBoundArrows(
  elements: Y.Map<NormalizedElement>,
  batch: readonly NormalizedElement[],
): void {
  for (const el of batch) {
    if (el.type !== "arrow" && el.type !== "line") continue;
    const current = elements.get(el.id);
    if (!current) continue;
    const placed = placeBoundArrow(elements, current);
    if (placed !== current) elements.set(el.id, placed);
  }
}

/**
 * Wire the other half of every arrow binding.
 *
 * Excalidraw binds an arrow to a shape from both ends: the arrow names the
 * shape in startBinding/endBinding, and the shape names the arrow back in its
 * boundElements. With only the arrow's half the connection renders correctly
 * and is inert — drag the shape and the arrow stays behind, which is exactly
 * the failure that survives review, because the picture looks right until
 * somebody edits it.
 *
 * Done here rather than in the normalizer because the shape being bound to is
 * usually already on the canvas, so this needs the scene rather than just the
 * incoming batch. Shapes that cannot be found are skipped: binding to an id
 * that is not there is a caller mistake the arrow already records, and
 * inventing a shape to satisfy it would be worse.
 */
function wireBindings(
  elements: Y.Map<NormalizedElement>,
  incoming: NormalizedElement[],
): void {
  for (const arrow of incoming) {
    if (arrow.type !== "arrow" && arrow.type !== "line") continue;

    for (const end of ["startBinding", "endBinding"] as const) {
      const bound = arrow[end] as { elementId?: string } | null | undefined;
      const targetID = bound?.elementId;
      if (!targetID) continue;

      const target = elements.get(targetID);
      if (!target) continue;

      const existing = Array.isArray(target.boundElements)
        ? (target.boundElements as { id?: string }[])
        : [];
      if (existing.some((b) => b?.id === arrow.id)) continue;

      elements.set(targetID, {
        ...target,
        boundElements: [...existing, { id: arrow.id, type: "arrow" }],
        // The shape changed, so its version has to move or no peer will take
        // the update — see the note on applyMode.
        version: (target.version ?? 1) + 1,
      });
    }
  }
}

/**
 * Apply one write to the scene.
 *
 * Versions are bumped on every path that changes an element, because the
 * browsers in the room decide what to take by comparing versions: an element
 * written back at its existing version is indistinguishable from the copy a
 * canvas already holds, and the change would never appear on screen.
 */
function applyMode(
  elements: Y.Map<NormalizedElement>,
  mode: DrawingMode,
  incoming: NormalizedElement[],
  patches: ElementPatch[],
  elementIDs: string[],
): number {
  switch (mode) {
    case "add": {
      // Written first, then the arrows are placed: an arrow bound to a box
      // that arrived in the same batch can only be measured once that box is
      // in the scene. Placing first silently fell back to the default stroke
      // for every arrow in the batch, which is the collapse this was meant to
      // prevent — three arrows to three different boxes, one visible line.
      const layered = assignLayers(elements, incoming);
      for (const el of layered) elements.set(el.id, el);
      placeBoundArrows(elements, layered);
      wireBindings(elements, layered);
      return layered.length;
    }

    case "update": {
      let applied = 0;
      for (const patch of patches) {
        const existing = elements.get(patch.id);
        // An update naming an element that is not there is a mistake worth
        // reporting rather than an insert worth performing — the usual cause
        // is a stale id from a read taken before somebody else's deletion.
        if (!existing) continue;

        // Only the fields that were sent. Merging a fully-defaulted element
        // here is what used to reset a shape's size and detach its label when
        // the caller meant to move it — see normalizePatches.
        const { label, ...fields } = patch;
        let next: NormalizedElement = {
          ...existing,
          ...fields,
          version: (existing.version ?? 1) + 1,
        };
        if (next.type === "arrow" || next.type === "line") {
          next = placeBoundArrow(elements, next);
        }
        elements.set(patch.id, next);

        if (typeof label === "string") {
          retitleLabel(elements, next, label);
        }
        applied++;
      }
      // Bindings are wired here too: an arrow that gains a binding by update
      // needs the same reciprocal entry on the shape as one that arrived with
      // it, or the connection is half-made and the shape drags away from it.
      wireBindings(elements, patches as unknown as NormalizedElement[]);
      return applied;
    }

    case "delete": {
      let applied = 0;
      for (const id of elementIDs) {
        const existing = elements.get(id);
        if (!existing) continue;
        // Tombstoned, not removed. Excalidraw propagates an erasure by
        // flagging the element; dropping the key instead would let a peer
        // that still holds the element write it straight back.
        elements.set(id, {
          ...existing,
          isDeleted: true,
          version: (existing.version ?? 1) + 1,
        });
        applied++;
      }
      return applied;
    }

    case "replace": {
      // Everything currently on the canvas is tombstoned, then the new scene
      // is written, all inside the caller's transaction — so collaborators see
      // one coherent change rather than the canvas briefly emptying.
      for (const [id, existing] of elements.entries()) {
        if (existing?.isDeleted) continue;
        elements.set(id, {
          ...existing,
          isDeleted: true,
          version: (existing.version ?? 1) + 1,
        });
      }
      // Written first, then the arrows are placed: an arrow bound to a box
      // that arrived in the same batch can only be measured once that box is
      // in the scene. Placing first silently fell back to the default stroke
      // for every arrow in the batch, which is the collapse this was meant to
      // prevent — three arrows to three different boxes, one visible line.
      const layered = assignLayers(elements, incoming);
      for (const el of layered) elements.set(el.id, el);
      placeBoundArrows(elements, layered);
      wireBindings(elements, layered);
      return layered.length;
    }
  }
}

/**
 * Change the words on a shape that already has a bound label.
 *
 * Without this, `label` on an update would be written onto the shape as a
 * stray field and the visible text would not move — the caller would be told
 * the update applied and see nothing change.
 */
function retitleLabel(
  elements: Y.Map<NormalizedElement>,
  container: NormalizedElement,
  label: string,
): void {
  const bound = Array.isArray(container.boundElements)
    ? (container.boundElements as { id?: string; type?: string }[])
    : [];
  const textID = bound.find((b) => b?.type === "text")?.id;
  if (!textID) return;

  const text = elements.get(textID);
  if (!text) return;

  elements.set(textID, {
    ...text,
    text: label,
    // originalText is what Excalidraw re-wraps from when the container is
    // resized; leaving it behind makes the label revert to the old words.
    originalText: label,
    version: (text.version ?? 1) + 1,
  });
}

/**
 * Warn when a write leaves shapes stacked exactly on top of one another.
 *
 * A successful write and a pile of overlapping arrows are indistinguishable
 * from the result: both say applied: N. Eighteen arrows given the same
 * geometry draw one stroke, and nothing in the response or in a default read
 * says so, because the outline view lists eighteen distinct ids.
 *
 * Reported rather than refused: stacking is legitimate now and then, and a
 * tool that guesses at intent and blocks the write is worse than one that
 * says what it saw.
 */
function stackedGeometry(written: readonly NormalizedElement[]): string | null {
  const seen = new Map<string, number>();
  for (const el of written) {
    if (el.isDeleted) continue;
    const signature = JSON.stringify([el.type, el.x, el.y, el.width, el.height, el.points ?? null]);
    seen.set(signature, (seen.get(signature) ?? 0) + 1);
  }

  const worst = [...seen.values()].reduce((a, b) => Math.max(a, b), 0);
  if (worst < 2) return null;
  return (
    `${worst} of these shapes share identical position and geometry, so they are ` +
    `drawn on top of each other and read as one. Arrows bound to different shapes ` +
    `still need distinct geometry — or omit points entirely and let the server ` +
    `place them from the bindings.`
  );
}

interface WireRequest {
  documentId?: unknown;
  mode?: unknown;
  elements?: unknown;
  elementIds?: unknown;
  userId?: unknown;
}

export function setupDrawingApi(app: Express, server: Hocuspocus): void {
  // --- Read -------------------------------------------------------------

  app.post(
    "/internal/drawing/read",
    readRawBody(MAX_BODY_BYTES),
    async (req: Request, res: Response) => {
      const rawBody = requireSignature(req, res);
      if (!rawBody) return;

      let body: WireRequest;
      try {
        body = JSON.parse(rawBody.toString("utf8")) as WireRequest;
      } catch {
        res.status(400).json({ error: "malformed JSON" });
        return;
      }

      const documentId = body.documentId;
      if (typeof documentId !== "string" || documentId === "") {
        res.status(400).json({ error: "documentId field required" });
        return;
      }

      let connection;
      try {
        connection = await server.openDirectConnection(roomName(documentId), {
          agent: true,
        });

        let elements: NormalizedElement[] = [];
        await connection.transact((document) => {
          // Returned in paint order rather than whatever order the map
          // iterates: back first, front last, so what covers what is readable
          // from the list itself.
          elements = inPaintOrder(
            [...elementsOf(document).values()].filter((el) => el && !el.isDeleted),
          );
        });

        res.status(200).json({
          elements,
          watchers: watcherCount(server, documentId),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "read failed";
        console.error("drawing read error:", err);
        res.status(500).json({ error: message });
      } finally {
        await release(connection, "drawing read");
      }
    },
  );

  // --- Write ------------------------------------------------------------

  app.post(
    "/internal/drawing/apply",
    readRawBody(MAX_BODY_BYTES),
    async (req: Request, res: Response) => {
      const rawBody = requireSignature(req, res);
      if (!rawBody) return;

      let body: WireRequest;
      try {
        body = JSON.parse(rawBody.toString("utf8")) as WireRequest;
      } catch {
        res.status(400).json({ error: "malformed JSON" });
        return;
      }

      const documentId = body.documentId;
      if (typeof documentId !== "string" || documentId === "") {
        res.status(400).json({ error: "documentId field required" });
        return;
      }

      const mode = (MODES.has(body.mode as string) ? body.mode : "add") as DrawingMode;

      const elementIDs =
        Array.isArray(body.elementIds) &&
        body.elementIds.every((id) => typeof id === "string")
          ? (body.elementIds as string[])
          : [];

      let incoming: NormalizedElement[] = [];
      let patches: ElementPatch[] = [];
      if (mode === "delete") {
        if (elementIDs.length === 0) {
          res.status(400).json({ error: "elementIds field required for delete" });
          return;
        }
      } else {
        try {
          // An update is a patch and is parsed as one: only the fields it
          // names, with no defaults filled in. Anything else is a whole new
          // element and gets the full treatment.
          if (mode === "update") {
            patches = normalizePatches(body.elements ?? []);
          } else {
            incoming = normalizeElements(body.elements ?? []);
          }
        } catch (err) {
          // 422, not 500: the request is understood and wrong, and the message
          // names the offending entry so the agent can fix it in one turn.
          const message =
            err instanceof DrawingElementError ? err.message : "invalid elements";
          res.status(422).json({ error: message });
          return;
        }
        const count = mode === "update" ? patches.length : incoming.length;
        if (count === 0) {
          res.status(400).json({ error: "elements field required" });
          return;
        }
        if (count > MAX_ELEMENTS_PER_CALL) {
          res.status(413).json({
            error: `that is ${count} elements and the limit for one call is ${MAX_ELEMENTS_PER_CALL}`,
          });
          return;
        }
      }

      let connection;
      try {
        connection = await server.openDirectConnection(roomName(documentId), {
          agent: true,
          // Read back in persistence.ts, which attributes the save. A browser
          // gets this from onAuthenticate; an API edit has to carry it.
          userId: body.userId,
          // Deliberately absent: schemaVersion gates the *ProseMirror* schema,
          // and a drawing has none. Claiming one here would stamp a drawing
          // with a prose schema version it does not have.
        });

        let applied = 0;
        let warning: string | null = null;
        await connection.transact((document) => {
          const elements = elementsOf(document);
          applied = applyMode(elements, mode, incoming, patches, elementIDs);
          // Read back after the write, so the check describes what is on the
          // canvas rather than what was asked for — geometry the server placed
          // from bindings is included, and a stacked pile that survived is
          // reported whichever way it got there.
          warning = stackedGeometry(
            (mode === "update" ? patches.map((p) => elements.get(p.id)) : [...elements.values()])
              .filter((el): el is NormalizedElement => Boolean(el)),
          );
        });

        res.status(200).json({
          ok: true,
          mode,
          applied,
          watchers: watcherCount(server, documentId),
          ...(warning ? { warning } : {}),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "apply failed";
        console.error("drawing apply error:", err);
        res.status(500).json({ error: message });
      } finally {
        await release(connection, "drawing apply");
      }
    },
  );
}

/** Always release the server-side seat. Leaving it open keeps the room alive
 * forever and defeats the idle-unload the debounced store relies on. */
async function release(
  connection: { disconnect: () => Promise<unknown> } | undefined,
  label: string,
): Promise<void> {
  if (!connection) return;
  try {
    await connection.disconnect();
  } catch (err) {
    console.warn(`${label}: failed to close direct connection:`, err);
  }
}
