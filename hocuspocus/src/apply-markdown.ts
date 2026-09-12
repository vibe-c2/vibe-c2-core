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

type ApplyMode = "replace" | "append" | "prepend";

const APPLY_MODES: ReadonlySet<string> = new Set<ApplyMode>([
  "replace",
  "append",
  "prepend",
]);

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
 * Replace a fragment's contents with `nodes`, touching only the blocks that
 * actually differ.
 *
 * Deleting everything and re-inserting is far simpler and was what this did,
 * but it is the wrong shape for a CRDT that someone else may be typing into.
 * Every block is destroyed and recreated, so a collaborator's cursor jumps,
 * their selection is lost, and the update carries the whole document even for
 * a one-word fix. Most edits change one block out of dozens.
 *
 * Common leading and trailing blocks are therefore left in place and only the
 * middle is spliced. This is not a diff: a change in the first block and the
 * last one still rewrites everything between them. It is the cheap 90% case,
 * and the expensive case is no worse than the old behaviour.
 */
function spliceFragment(fragment: XmlFragment, blocks: DetachedBlock[]): void {
  const existing = fragment.toArray().map(nodeKey);
  const incoming = blocks.map((block) => block.key);

  let prefix = 0;
  while (
    prefix < existing.length &&
    prefix < incoming.length &&
    existing[prefix] === incoming[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < existing.length - prefix &&
    suffix < incoming.length - prefix &&
    existing[existing.length - 1 - suffix] === incoming[incoming.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const removeCount = existing.length - prefix - suffix;
  const insert = blocks
    .slice(prefix, blocks.length - suffix)
    .map((block) => block.node);

  if (removeCount > 0) fragment.delete(prefix, removeCount);
  if (insert.length > 0) fragment.insert(prefix, insert);
}

/**
 * Identity of one top-level block, for the splice comparison.
 *
 * The XML serialization carries the node name, its attributes and its whole
 * subtree, which is exactly the granularity wanted: two blocks are "the same"
 * when replacing one with the other would be a no-op.
 */
function nodeKey(node: XmlElement | XmlText | unknown): string {
  return String(node);
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
  return markdownToDetachedBlocks(markdown).map((block) => block.node);
}

/** One top-level block: the detached node, and its identity for splicing. */
interface DetachedBlock {
  node: XmlElement | XmlText;
  key: string;
}

/**
 * The same conversion, keeping each block's serialized form alongside it.
 *
 * The key has to be taken here, while the node is still attached to the
 * scratch document. A detached Y.js type refuses to be read — "Add Yjs type
 * to a document before reading data" — so there is no second chance to
 * compute it after the clone.
 */
function markdownToDetachedBlocks(markdown: string): DetachedBlock[] {
  const pmDoc = parseOutlineMarkdown(markdown);
  const scratch = prosemirrorJSONToYDoc(wikiSchema, pmDoc.toJSON(), Y_FRAGMENT_FIELD);
  try {
    const fragment = scratch.getXmlFragment(Y_FRAGMENT_FIELD);
    return fragment.toArray().map((node) => ({
      node: cloneNode(node),
      key: nodeKey(node),
    }));
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
      // Unknown modes fall back to replace, which is what this did when
      // "append" was the only alternative. Defaulting an unrecognised mode to
      // the destructive one is not obviously right, but changing it now would
      // alter how an older caller behaves, and the Go client validates the
      // mode before it ever gets here.
      const mode: ApplyMode = APPLY_MODES.has(parsed.mode ?? "")
        ? (parsed.mode as ApplyMode)
        : "replace";

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
          const blocks = markdownToDetachedBlocks(markdown);
          appliedNodes = blocks.length;

          // Append and prepend differ only in the insertion point. Both are
          // pure insertions, so neither can disturb what is already in the
          // fragment — that is what makes them safe while somebody is typing,
          // and why prepend is worth having rather than making callers
          // round-trip the whole body through replace.
          if (mode === "append" || mode === "prepend") {
            if (blocks.length > 0) {
              fragment.insert(
                mode === "append" ? fragment.length : 0,
                blocks.map((block) => block.node),
              );
            }
            return;
          }

          // One transaction, so collaborators see a single coherent change
          // rather than the document briefly emptying.
          spliceFragment(fragment, blocks);
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
export const __testing = {
  markdownToDetachedNodes,
  markdownToDetachedBlocks,
  cloneNode,
  spliceFragment,
};
