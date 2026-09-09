// Apply an agent's Markdown edit to a wiki document as a Y.js transaction.
//
// This is what makes an AI agent a collaborator rather than an intruder.
//
// The naive approach — convert Markdown to a Y.js update and overwrite
// content_state in Mongo — cannot work while anyone has the page open. A
// connected editor holds the authoritative Y.Doc in memory and writes it back
// on the next debounce, so the agent's work is either erased seconds later or
// lands mid-keystroke and the reader watches their document change under the
// cursor. The Go side used to refuse the write for exactly that reason, which
// meant the agent was locked out of precisely the page the operator was
// working on — the opposite of the point.
//
// openDirectConnection gives us a server-side seat at the same document. The
// edit becomes a normal Y.js transaction: it merges rather than overwrites,
// broadcasts to everyone connected, and persists through the same debounced
// store as any human edit. Concurrency stops being something to defend
// against and becomes something the CRDT handles.

import type { Express, Request, Response } from "express";
import type { Hocuspocus } from "@hocuspocus/server";
import { XmlElement, XmlFragment, XmlText } from "yjs";
import { prosemirrorJSONToYDoc } from "y-prosemirror";
import { wikiSchema } from "./wiki-schema.js";
import { parseOutlineMarkdown } from "./markdown-parser.js";
import { Y_FRAGMENT_FIELD } from "./markdown-to-yjs.js";
import { readRawBody, requireSignature } from "./internal-auth.js";

const MAX_MARKDOWN_BYTES = 1024 * 1024; // matches WikiDocument.Content cap

type ApplyMode = "replace" | "append";

interface ApplyRequestBody {
  documentId?: string;
  markdown?: string;
  mode?: ApplyMode;
}

// Hocuspocus keys rooms by the name the client connects with; the SPA uses
// `wiki/<documentId>`. Reusing it is what puts us in the SAME room as the
// operator rather than a private one nobody sees.
function roomName(documentId: string): string {
  return `wiki/${documentId}`;
}

/**
 * Build the top-level nodes for some Markdown as detached Y.js types, ready to
 * insert into a live fragment.
 *
 * Y.js types cannot be moved between documents, so the nodes are produced in a
 * scratch Y.Doc and then deep-copied. y-prosemirror has no "convert to
 * detached nodes" entry point, which is why this walks the tree itself.
 */
function markdownToDetachedNodes(markdown: string): (XmlElement | XmlText)[] {
  const pmDoc = parseOutlineMarkdown(markdown);
  const scratch = prosemirrorJSONToYDoc(wikiSchema, pmDoc.toJSON(), Y_FRAGMENT_FIELD);
  try {
    const fragment = scratch.getXmlFragment(Y_FRAGMENT_FIELD);
    return fragment.toArray().map(cloneNode);
  } finally {
    scratch.destroy();
  }
}

function cloneNode(node: unknown): XmlElement | XmlText {
  if (node instanceof XmlText) {
    const copy = new XmlText();
    // Deltas carry the inline marks (bold, code, links) alongside the text, so
    // applying the delta preserves formatting that copying the string alone
    // would drop.
    copy.applyDelta(node.toDelta());
    return copy;
  }

  if (node instanceof XmlElement) {
    const copy = new XmlElement(node.nodeName);
    for (const [key, value] of Object.entries(node.getAttributes())) {
      if (value !== undefined && value !== null) copy.setAttribute(key, value as string);
    }
    const children = node.toArray().map(cloneNode);
    if (children.length > 0) copy.insert(0, children);
    return copy;
  }

  if (node instanceof XmlFragment) {
    // Nested fragments do not occur in the wiki schema, but degrade to an
    // empty element rather than throwing away the surrounding edit.
    return new XmlElement("paragraph");
  }

  return new XmlText();
}

export function setupApplyApi(app: Express, server: Hocuspocus): void {
  app.post(
    "/internal/apply-markdown",
    readRawBody(MAX_MARKDOWN_BYTES),
    async (req: Request, res: Response) => {
      const rawBody = requireSignature(req, res);
      if (!rawBody) return;

      let parsed: ApplyRequestBody;
      try {
        parsed = JSON.parse(rawBody.toString("utf8")) as ApplyRequestBody;
      } catch {
        res.status(400).json({ error: "malformed JSON" });
        return;
      }

      const { documentId, markdown } = parsed;
      const mode: ApplyMode = parsed.mode === "append" ? "append" : "replace";

      if (typeof documentId !== "string" || documentId === "") {
        res.status(400).json({ error: "documentId field required" });
        return;
      }
      if (typeof markdown !== "string") {
        res.status(400).json({ error: "markdown field required" });
        return;
      }
      if (Buffer.byteLength(markdown, "utf8") > MAX_MARKDOWN_BYTES) {
        res.status(413).json({ error: "markdown exceeds 1 MB" });
        return;
      }

      let connection;
      try {
        // Loads the document through the Database extension when nobody has it
        // open, and joins the existing room when somebody does. Either way the
        // edit lands on the authoritative copy.
        connection = await server.openDirectConnection(roomName(documentId), {
          // Marks the edit as ours in onStoreDocument and in awareness.
          agent: true,
        });

        let appliedNodes = 0;

        await connection.transact((document) => {
          const fragment = document.getXmlFragment(Y_FRAGMENT_FIELD);
          const nodes = markdownToDetachedNodes(markdown);
          appliedNodes = nodes.length;

          if (mode === "replace") {
            // One transaction, so collaborators see a single coherent change
            // rather than the document briefly emptying.
            fragment.delete(0, fragment.length);
          }
          if (nodes.length > 0) {
            fragment.insert(fragment.length, nodes);
          }
        });

        const connections =
          server.documents.get(roomName(documentId))?.getConnectionsCount() ?? 0;

        res.status(200).json({ ok: true, mode, nodes: appliedNodes, watchers: connections });
      } catch (err) {
        const message = err instanceof Error ? err.message : "apply failed";
        console.error("apply-markdown error:", err);
        res.status(500).json({ error: message });
      } finally {
        // Always release the server-side seat. Leaving it open would keep the
        // room alive forever and defeat the idle-unload the debounced store
        // relies on.
        if (connection) {
          try {
            await connection.disconnect();
          } catch (err) {
            console.warn("apply-markdown: failed to close direct connection:", err);
          }
        }
      }
    }
  );
}

/** Internals exposed for tests only. */
export const __testing = { markdownToDetachedNodes, cloneNode };
