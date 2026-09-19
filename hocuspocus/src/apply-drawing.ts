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
import { DRAWING_ROOT_KEY } from "./drawing-projection.js";
import {
  DrawingElementError,
  normalizeElements,
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
  elementIDs: string[],
): number {
  switch (mode) {
    case "add": {
      for (const el of incoming) elements.set(el.id, el);
      return incoming.length;
    }

    case "update": {
      let applied = 0;
      for (const el of incoming) {
        const existing = elements.get(el.id);
        // An update naming an element that is not there is a mistake worth
        // reporting rather than an insert worth performing — the usual cause
        // is a stale id from a read taken before somebody else's deletion.
        if (!existing) continue;
        elements.set(el.id, {
          ...existing,
          ...el,
          version: (existing.version ?? 1) + 1,
        });
        applied++;
      }
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
      for (const el of incoming) elements.set(el.id, el);
      return incoming.length;
    }
  }
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
          elements = [...elementsOf(document).values()].filter(
            (el) => el && !el.isDeleted,
          );
        });

        res.status(200).json({
          elements,
          watchers:
            server.documents.get(roomName(documentId))?.getConnectionsCount() ?? 0,
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
      if (mode === "delete") {
        if (elementIDs.length === 0) {
          res.status(400).json({ error: "elementIds field required for delete" });
          return;
        }
      } else {
        try {
          incoming = normalizeElements(body.elements ?? []);
        } catch (err) {
          // 422, not 500: the request is understood and wrong, and the message
          // names the offending entry so the agent can fix it in one turn.
          const message =
            err instanceof DrawingElementError ? err.message : "invalid elements";
          res.status(422).json({ error: message });
          return;
        }
        if (incoming.length === 0) {
          res.status(400).json({ error: "elements field required" });
          return;
        }
        if (incoming.length > MAX_ELEMENTS_PER_CALL) {
          res.status(413).json({
            error: `that is ${incoming.length} elements and the limit for one call is ${MAX_ELEMENTS_PER_CALL}`,
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
        await connection.transact((document) => {
          applied = applyMode(elementsOf(document), mode, incoming, elementIDs);
        });

        res.status(200).json({
          ok: true,
          mode,
          applied,
          watchers:
            server.documents.get(roomName(documentId))?.getConnectionsCount() ?? 0,
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
