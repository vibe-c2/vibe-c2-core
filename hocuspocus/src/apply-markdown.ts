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
import { prosemirrorJSONToYDoc, yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import { wikiSchema } from "./wiki-schema.js";
import { parseOutlineMarkdown } from "./markdown-parser.js";
import { auditAttachments, type AttachmentAudit } from "./attachment-audit.js";
import { serializeWikiDocument } from "./markdown-serializer.js";
import { Y_FRAGMENT_FIELD } from "./markdown-to-yjs.js";
import { WIKI_SCHEMA_VERSION } from "./wiki-schema-version.js";
import { readRawBody, requireSignature } from "./internal-auth.js";

const MAX_MARKDOWN_BYTES = 1024 * 1024; // matches WikiDocument.Content cap

type ApplyMode = "replace" | "append" | "prepend" | "edit";

const APPLY_MODES: ReadonlySet<string> = new Set<ApplyMode>([
  "replace",
  "append",
  "prepend",
  "edit",
]);

interface ApplyRequestBody {
  documentId?: string;
  markdown?: string;
  mode?: ApplyMode;
  // Edit mode only: an exact snippet to replace, and what to put there.
  oldText?: string;
  newText?: string;
  replaceAll?: boolean;
  // The operator this edit is made on behalf of. An agent key belongs to a
  // person, and the document should record that person as its last editor —
  // without it the save lands with no attribution and the page never enters
  // the "recently updated" list, which is sorted on a field only attributed
  // saves set.
  userId?: string;
}

/** Render a live fragment to the same markdown a full read returns. */
function fragmentToMarkdown(fragment: XmlFragment): string {
  if (fragment.length === 0) return "";
  return serializeWikiDocument(yXmlFragmentToProseMirrorRootNode(fragment, wikiSchema));
}

/** Non-overlapping occurrence count, matching Go's strings.Count. */
function countOccurrences(haystack: string, needle: string): number {
  if (needle === "") return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return count;
    count += 1;
    from = at + needle.length;
  }
}

const collapseWhitespace = (s: string): string => s.split(/\s+/).filter(Boolean).join(" ");

function firstContentLine(s: string): string {
  for (const line of s.split("\n")) {
    const trimmed = line.trim();
    if (trimmed !== "") return trimmed;
  }
  return "";
}

function clip(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

/**
 * Why an exact-match edit missed.
 *
 * The exact-match rule is deliberate: fuzzy matching succeeds against the
 * wrong text on a page somebody else may be editing. What was wrong was the
 * refusal — "not on the page" is true and useless, and an agent given it
 * re-reads and retries until it converges on a single tab character. Naming
 * the near miss turns that loop into one corrected retry. Only a diagnostic;
 * it never relaxes what the edit accepts.
 */
function diagnoseNoMatch(body: string, oldText: string): string {
  if (body === "") return "The page is empty.";

  const spacing = collapseWhitespace(body).includes(collapseWhitespace(oldText));
  const casing = body.toLowerCase().includes(oldText.toLowerCase());
  const both = collapseWhitespace(body)
    .toLowerCase()
    .includes(collapseWhitespace(oldText).toLowerCase());

  if (spacing) {
    return (
      "The text is there but the whitespace differs — indentation, a tab where you" +
      " sent spaces, or a line broken in a different place."
    );
  }
  if (casing) return "The text is there but the capitalisation differs.";
  if (both) return "The text is there but both the whitespace and the capitalisation differ.";

  const line = firstContentLine(oldText);
  if (line !== "" && body.includes(line)) {
    return (
      `Its first line (${JSON.stringify(clip(line, 60))}) is on the page, so the snippet` +
      " starts in the right place and diverges after it."
    );
  }
  return "No part of it is on the page — you may be editing the wrong one.";
}

/** What an edit did, or why it did nothing. */
interface EditOutcome {
  matches: number;
  replacements: number;
  nodes: number;
  /** Set when matches is 0: the likeliest reason, for the agent. */
  diagnosis?: string;
  /** Set when the resulting body would exceed the size cap. */
  tooLarge?: boolean;
}

/**
 * Replace an exact snippet inside a live fragment.
 *
 * The match runs against markdown rendered from the fragment as it is right
 * now — the same document the operator is typing into — so the edit is never
 * computed from a persisted state that lags the live one, and the splice only
 * touches the blocks that changed. This is what lets edit_wiki_document be a
 * single hop and a genuine merge rather than a read-modify-replace.
 */
function editFragment(
  fragment: XmlFragment,
  oldText: string,
  newText: string,
  replaceAll: boolean,
): EditOutcome {
  const current = fragmentToMarkdown(fragment);
  const matches = countOccurrences(current, oldText);
  if (matches === 0) {
    return { matches: 0, replacements: 0, nodes: 0, diagnosis: diagnoseNoMatch(current, oldText) };
  }
  if (matches > 1 && !replaceAll) {
    return { matches, replacements: 0, nodes: 0 };
  }

  // Function replacers so `$&` and friends in newText stay literal.
  const updated = replaceAll
    ? current.split(oldText).join(newText)
    : current.replace(oldText, () => newText);
  if (Buffer.byteLength(updated, "utf8") > MAX_MARKDOWN_BYTES) {
    return { matches, replacements: 0, nodes: 0, tooLarge: true };
  }

  const blocks = markdownToDetachedBlocks(updated);
  spliceFragment(fragment, blocks);
  return { matches, replacements: replaceAll ? matches : 1, nodes: blocks.length };
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

      const { documentId, markdown, oldText, newText, replaceAll } = parsed;
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
      if (mode === "edit") {
        if (typeof oldText !== "string" || oldText === "") {
          res.status(400).json({ error: "oldText field required" });
          return;
        }
        if (typeof newText !== "string") {
          res.status(400).json({ error: "newText field required" });
          return;
        }
      } else {
        if (typeof markdown !== "string") {
          res.status(400).json({ error: "markdown field required" });
          return;
        }
        if (Buffer.byteLength(markdown, "utf8") > MAX_MARKDOWN_BYTES) {
          res.status(413).json({ error: "markdown exceeds 1 MB" });
          return;
        }
      }

      let connection;
      try {
        // Loads the document through the Database extension when nobody has it
        // open, and joins the existing room when somebody does. Either way the
        // edit lands on the authoritative copy.
        connection = await server.openDirectConnection(roomName(documentId), {
          // Marks the edit as ours in onStoreDocument and in awareness.
          agent: true,
          // Read back in persistence.ts, which stamps last_updated_by_id and
          // last_updated_at only when it knows who edited. A browser gets
          // this from onAuthenticate; an API edit has to carry it.
          userId: parsed.userId,
          // This content is parsed into the current wiki schema, so it is
          // current-schema content. Without saying so it defaults to 0, and
          // persistence.ts treats every shrinking write as a stale browser
          // tab: the edit is discarded while the caller is told it applied.
          schemaVersion: WIKI_SCHEMA_VERSION,
        });

        let appliedNodes = 0;
        let edit: EditOutcome | undefined;
        // How the page's file links stand after the write. Read inside the
        // transaction so it describes exactly the state this write produced.
        let attachments: AttachmentAudit = { attachmentCards: 0, strayFileLinks: [] };

        await connection.transact((document) => {
          const fragment = document.getXmlFragment(Y_FRAGMENT_FIELD);
          try {
            applyTo(fragment);
          } finally {
            attachments = auditAttachments(fragment);
          }
        });

        function applyTo(fragment: XmlFragment): void {

          if (mode === "edit") {
            edit = editFragment(fragment, oldText as string, newText as string, replaceAll === true);
            appliedNodes = edit.nodes;
            return;
          }

          const blocks = markdownToDetachedBlocks(markdown as string);
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
        }

        const connections =
          server.documents.get(roomName(documentId))?.getConnectionsCount() ?? 0;

        if (edit) {
          // Refusals are 409: the document is fine, the request did not fit
          // it. They carry what the agent needs to correct itself.
          if (edit.tooLarge) {
            res.status(413).json({ error: "markdown exceeds 1 MB" });
            return;
          }
          if (edit.matches === 0) {
            res.status(409).json({ error: "no_match", matches: 0, diagnosis: edit.diagnosis });
            return;
          }
          if (edit.replacements === 0) {
            res.status(409).json({ error: "ambiguous", matches: edit.matches });
            return;
          }
          res.status(200).json({
            ok: true,
            mode,
            nodes: appliedNodes,
            watchers: connections,
            matches: edit.matches,
            replacements: edit.replacements,
            ...attachments,
          });
          return;
        }

        res.status(200).json({ ok: true, mode, nodes: appliedNodes, watchers: connections, ...attachments });
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
  editFragment,
  diagnoseNoMatch,
  countOccurrences,
  fragmentToMarkdown,
};
