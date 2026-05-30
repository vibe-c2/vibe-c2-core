// ProseMirror -> Markdown serializer for the wiki export flow.
//
// This is the inverse of markdown-parser.ts. Whatever this file emits must
// round-trip back through parseOutlineMarkdown into an equivalent document,
// so that exports can be re-imported via POST /api/v1/wiki/import/outline.
//
// The dialect matches what Outline's markdown export uses:
//
//   - ::: info / success / warning / tip … :::  ←  wikiNotice nodes
//   - ![](url " =WxH")                          ←  image with width/height
//   - [label bytes](url)                        ←  wikiFile atom block
//   - GFM tables, task lists, strikethrough
//
// Built on top of prosemirror-markdown's MarkdownSerializer. The default
// serializer is CommonMark-only, so we register every node type our schema
// declares.

import { MarkdownSerializer } from "prosemirror-markdown";
import { Fragment, Node } from "prosemirror-model";
import { wikiSchema } from "./wiki-schema.js";

const NOTICE_VARIANTS = new Set(["info", "success", "warning", "tip"]);

// Fence info-string identifying a credential block. The core import
// orchestrator and the parser's lifter both key on this exact value, so
// any code that wants to recognise a credential fence should reference
// this constant rather than the literal.
export const CREDENTIAL_FENCE_INFO = "vibe-credential";

// Render the contents of a cell as a single line of markdown so it fits in
// a pipe-table row. Block content (paragraphs) gets flattened: each block's
// inline content is joined with `<br>`.
function renderCellInline(serializer: MarkdownSerializer, cell: Node): string {
  const parts: string[] = [];
  cell.forEach((child) => {
    if (child.type === wikiSchema.nodes.paragraph) {
      parts.push(renderInlineToString(serializer, child));
    } else if (child.isTextblock) {
      parts.push(renderInlineToString(serializer, child));
    }
    // Non-text blocks (lists, code blocks) inside table cells are rare and
    // round-trip poorly through pipe tables. We drop them silently rather
    // than emit broken markdown.
  });
  // Escape pipe characters so they don't terminate the cell.
  return parts.join("<br>").replace(/\|/g, "\\|");
}

// Serialize just the inline content of `node` to a single-line markdown
// string. Used by the table cell renderer above.
function renderInlineToString(
  serializer: MarkdownSerializer,
  node: Node,
): string {
  // The serializer state is the only way to render inline content with
  // marks applied. We use a fresh single-paragraph doc as a vehicle and
  // strip the trailing blank line the block renderer emits.
  const wrapper = wikiSchema.nodes.doc.create(
    null,
    wikiSchema.nodes.paragraph.create(null, node.content),
  );
  return serializer.serialize(wrapper).replace(/\n+$/, "");
}

// Build the serializer. Keep this in one place so both the route handler
// and tests can call serializeWikiDocument with consistent behavior.
function buildSerializer(): MarkdownSerializer {
  // Forward declaration so node serializers can reference the enclosing
  // serializer (needed by table cells).
  let serializer: MarkdownSerializer;

  const nodes: MarkdownSerializer["nodes"] = {
    doc(state, node) {
      state.renderContent(node);
    },

    paragraph(state, node) {
      state.renderInline(node);
      state.closeBlock(node);
    },

    heading(state, node) {
      const level = Math.max(1, Math.min(6, node.attrs.level || 1));
      state.write(state.repeat("#", level) + " ");
      state.renderInline(node);
      state.closeBlock(node);
    },

    blockquote(state, node) {
      state.wrapBlock("> ", null, node, () => state.renderContent(node));
    },

    codeBlock(state, node) {
      // Use a fence longer than any backtick run inside the body so the
      // fence cannot be terminated by content.
      const runs = node.textContent.match(/`{3,}/gm);
      const fence = runs ? runs.sort().slice(-1)[0] + "`" : "```";
      const lang = typeof node.attrs.language === "string" ? node.attrs.language : "";
      state.write(fence + lang + "\n");
      state.text(node.textContent, false);
      state.write("\n" + fence);
      state.closeBlock(node);
    },

    horizontalRule(state, node) {
      state.write("---");
      state.closeBlock(node);
    },

    bulletList(state, node) {
      state.renderList(node, "  ", () => "- ");
    },

    orderedList(state, node) {
      const start = node.attrs.start || 1;
      const maxW = String(start + node.childCount - 1).length;
      const space = state.repeat(" ", maxW + 2);
      state.renderList(node, space, (i) => {
        const n = String(start + i);
        return state.repeat(" ", maxW - n.length) + n + ". ";
      });
    },

    listItem(state, node) {
      state.renderContent(node);
    },

    taskList(state, node) {
      state.renderList(node, "  ", () => "- ");
    },

    taskItem(state, node) {
      // GFM task syntax: "- [x] " or "- [ ] ". The leading "- " comes from
      // taskList's renderList firstDelim; we just inject the checkbox here.
      state.write(node.attrs.checked ? "[x] " : "[ ] ");
      state.renderContent(node);
    },

    image(state, node) {
      const src = String(node.attrs.src ?? "");
      const alt = String(node.attrs.alt ?? "");
      const width = node.attrs.width;
      const height = node.attrs.height;
      let title = "";
      if (typeof width === "number" && typeof height === "number") {
        // Outline-style size hint, exactly what markdown-parser.ts expects.
        title = ` =${width}x${height}`;
      } else if (typeof node.attrs.title === "string" && node.attrs.title.length > 0) {
        title = node.attrs.title;
      }
      const esc = (s: string) => s.replace(/[\(\)]/g, "\\$&");
      state.write(
        "![" +
          state.esc(alt) +
          "](" +
          esc(src) +
          (title ? ' "' + title.replace(/"/g, '\\"') + '"' : "") +
          ")",
      );
      state.closeBlock(node);
    },

    hardBreak(state, node, parent, index) {
      for (let i = index + 1; i < parent.childCount; i++) {
        if (parent.child(i).type !== node.type) {
          state.write("\\\n");
          return;
        }
      }
    },

    wikiNotice(state, node) {
      const variant = NOTICE_VARIANTS.has(node.attrs.variant)
        ? node.attrs.variant
        : "info";
      state.write(":::" + variant + "\n");
      state.renderContent(node);
      state.ensureNewLine();
      state.write(":::");
      state.closeBlock(node);
    },

    wikiCredentialBlock(state, node) {
      // Emit a fenced code block whose info-string is the discriminator the
      // importer's lifter looks for. The payload is JSON.stringified verbatim
      // — the lift pass before serialization is responsible for shaping it.
      // Pretty-printing the JSON costs a few bytes but makes the exported
      // markdown readable by humans and trivially diffable across runs.
      const fence = "```";
      state.write(fence + CREDENTIAL_FENCE_INFO + "\n");
      const payload = (node.attrs.payload as unknown) ?? {
        id: node.attrs.credentialId,
      };
      state.text(JSON.stringify(payload, null, 2), false);
      state.write("\n" + fence);
      state.closeBlock(node);
    },

    wikiFile(state, node) {
      const filename = String(node.attrs.filename ?? "file");
      const size = typeof node.attrs.size === "number" ? node.attrs.size : 0;
      // url is the canonical /api/v1/wiki/files/<uuid> link the importer
      // matches against. When we re-export from a freshly-imported doc the
      // url already carries the right shape; for newly-uploaded files the
      // builder rewrites it to the in-zip relative path before calling us.
      const url = String(node.attrs.url ?? "");
      const label = `${filename} ${size}`;
      const escUrl = url.replace(/[\(\)]/g, "\\$&");
      state.write(`[${label.replace(/[\[\]]/g, "\\$&")}](${escUrl})`);
      state.closeBlock(node);
    },

    table(state, node) {
      if (node.childCount === 0) {
        state.closeBlock(node);
        return;
      }
      const rows: string[][] = [];
      node.forEach((row) => {
        const cells: string[] = [];
        row.forEach((cell) => {
          cells.push(renderCellInline(serializer, cell));
        });
        rows.push(cells);
      });

      // GFM tables require a header row; if the first row isn't headers
      // (no tableHeader cells), promote it anyway — the renderer only sees
      // it as the header row, which is the same visual result.
      const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
      for (const r of rows) {
        while (r.length < colCount) r.push("");
      }
      const [header, ...body] = rows;
      state.write("| " + header.join(" | ") + " |\n");
      state.write("| " + header.map(() => "---").join(" | ") + " |\n");
      for (const r of body) {
        state.write("| " + r.join(" | ") + " |\n");
      }
      state.closeBlock(node);
    },

    tableRow() {
      // Handled by `table` above.
    },

    tableHeader() {
      // Handled by `table` above.
    },

    tableCell() {
      // Handled by `table` above.
    },

    text(state, node) {
      state.text(node.text ?? "");
    },
  };

  const marks: MarkdownSerializer["marks"] = {
    bold: {
      open: "**",
      close: "**",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    italic: {
      open: "*",
      close: "*",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    strike: {
      open: "~~",
      close: "~~",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
    code: {
      open(_state, _mark, parent, index) {
        return backticksFor(parent.child(index), -1);
      },
      close(_state, _mark, parent, index) {
        return backticksFor(parent.child(index - 1), 1);
      },
      escape: false,
    },
    link: {
      open(_state, _mark, _parent, _index) {
        return "[";
      },
      close(_state, mark) {
        const href = String(mark.attrs.href ?? "").replace(/[\(\)"]/g, "\\$&");
        const title =
          typeof mark.attrs.title === "string" && mark.attrs.title.length > 0
            ? ' "' + mark.attrs.title.replace(/"/g, '\\"') + '"'
            : "";
        return `](${href}${title})`;
      },
    },
    // Custom inline highlight mark. Emitted as `<mark>` (no color) or
    // `<mark data-color="oklch(...)">` so the importer's matching inline
    // rule in markdown-parser.ts can pull it back into a wikiHighlight
    // mark with the original color attribute. CommonMark renderers ignore
    // unrecognised attributes and render the bare `<mark>` element, so the
    // round-trip is bit-stable AND the export still reads as plain
    // highlighted text in any markdown viewer that supports raw HTML.
    wikiHighlight: {
      open(_state, mark) {
        const color =
          typeof mark.attrs.color === "string" ? mark.attrs.color : "";
        return color
          ? `<mark data-color="${escapeMarkAttr(color)}">`
          : "<mark>";
      },
      close: "</mark>",
      mixable: true,
      expelEnclosingWhitespace: true,
    },
  };

  serializer = new MarkdownSerializer(nodes, marks, {
    hardBreakNodeName: "hardBreak",
    strict: false,
  });
  return serializer;
}

// Escape attribute values for the `<mark>` open tag the highlight mark
// emits. The OKLCH literals in the icon palette never contain HTML-special
// characters, but the parser allows arbitrary `data-color` strings (e.g.
// imported docs) so we defend against `"`, `&`, `<`, `>` regardless.
function escapeMarkAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function backticksFor(node: Node, side: number): string {
  const ticks = /`+/g;
  let len = 0;
  if (node.isText && node.text) {
    let m: RegExpExecArray | null;
    while ((m = ticks.exec(node.text)) !== null) {
      len = Math.max(len, m[0].length);
    }
  }
  let out = len > 0 && side > 0 ? " `" : "`";
  for (let i = 0; i < len; i++) out += "`";
  if (len > 0 && side < 0) out += " ";
  return out;
}

const serializer = buildSerializer();

/**
 * CredentialPayloadResolver returns the JSON payload to embed for a given
 * credential id. The core export orchestrator passes a resolver backed by
 * the credential repository, scoped to the document's operation. Returning
 * `null` produces a tombstone block (`{"id":"...","deleted":true}`); the
 * resolver should return `null` for ids that don't resolve in the
 * document's operation rather than throwing, so the export keeps going.
 */
export type CredentialPayloadResolver = (
  credentialId: string,
) => Record<string, unknown> | null;

/**
 * Walk the doc and replace every paragraph that contains at least one
 * wikiCredentialReference with a flattened sequence: optional
 * paragraph-of-leading-text, one wikiCredentialBlock per chip in original
 * order, optional paragraph-of-trailing-text. Chips inside the same
 * paragraph each become their own block — sentence structure around them
 * is split, which is the explicit design trade-off (chips never carried
 * inline secret-typed content anyway).
 *
 * Non-credential inline content keeps its marks (bold, links, code).
 *
 * The resolver is called once per unique credential id encountered; when it
 * returns null, the chip is lowered to a tombstone payload so the reader
 * sees "this referred to a deleted credential" rather than a vanished
 * sentence fragment.
 */
function liftCredentialChipsToBlocks(
  doc: Node,
  resolve: CredentialPayloadResolver,
): Node {
  const chipType = wikiSchema.nodes.wikiCredentialReference;
  const blockType = wikiSchema.nodes.wikiCredentialBlock;
  if (!chipType || !blockType) return doc;

  // Resolver memoisation. A credential referenced N times in the same doc
  // produces N identical blocks; we only need to look up the payload once.
  const payloadCache = new Map<string, Record<string, unknown> | null>();
  const resolveOnce = (id: string): Record<string, unknown> | null => {
    if (payloadCache.has(id)) return payloadCache.get(id) ?? null;
    const p = resolve(id);
    payloadCache.set(id, p);
    return p;
  };

  const buildBlockForChip = (chip: Node): Node => {
    const id = String(chip.attrs.credentialId ?? "");
    const resolved = id ? resolveOnce(id) : null;
    const payload: Record<string, unknown> = resolved ?? {
      id,
      deleted: true,
    };
    return blockType.create({ credentialId: id, payload });
  };

  // For a paragraph containing one or more chips, produce the lifted
  // sequence. For a paragraph with no chips, return null so the caller can
  // pass the original node through unchanged.
  const splitParagraph = (para: Node): Node[] | null => {
    let hasChip = false;
    para.content.forEach((child) => {
      if (child.type === chipType) hasChip = true;
    });
    if (!hasChip) return null;

    const out: Node[] = [];
    let pending: Node[] = [];
    const flushPending = () => {
      if (pending.length === 0) return;
      out.push(
        wikiSchema.nodes.paragraph.create(null, Fragment.fromArray(pending)),
      );
      pending = [];
    };
    para.content.forEach((child) => {
      if (child.type === chipType) {
        flushPending();
        out.push(buildBlockForChip(child));
      } else {
        pending.push(child);
      }
    });
    flushPending();
    return out;
  };

  // Recursively walk every block container, splitting paragraphs as we go.
  // Top-level container is `doc`; lists, blockquotes, notice blocks, and
  // table cells can all hold paragraphs that need the same treatment.
  const walk = (node: Node): Node => {
    if (node.isAtom || node.isText) return node;
    const newChildren: Node[] = [];
    node.content.forEach((child) => {
      if (child.type === wikiSchema.nodes.paragraph) {
        const split = splitParagraph(child);
        if (split) {
          for (const piece of split) newChildren.push(piece);
          return;
        }
      }
      newChildren.push(walk(child));
    });
    return node.copy(Fragment.fromArray(newChildren));
  };

  return walk(doc);
}

/**
 * Serialize a ProseMirror Node (the root doc of the wiki editor schema) to
 * Outline-flavored markdown. The output round-trips back through
 * parseOutlineMarkdown into an equivalent document.
 *
 * resolveCredential is optional. Pass it when the caller has a credential
 * repository handy and wants chip references hydrated into their full
 * payload at export time; omit it (or pass () => null) to emit id-only
 * blocks suitable for same-instance round-trip.
 *
 * Never throws on a well-formed doc; the serializer is non-strict so unknown
 * nodes (legacy editor extensions added without a serializer entry) are
 * silently skipped rather than aborting the export.
 */
export function serializeWikiDocument(
  doc: Node,
  resolveCredential?: CredentialPayloadResolver,
): string {
  const lifted = liftCredentialChipsToBlocks(
    doc,
    resolveCredential ?? ((id) => ({ id })),
  );
  return serializer.serialize(lifted);
}
