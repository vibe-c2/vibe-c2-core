// Markdown -> ProseMirror parser for the Outline import flow.
//
// Built on top of prosemirror-markdown, with these Outline-specific
// extensions:
//
//   - ::: info / success / warning / tip ... :::  →  wikiNotice nodes
//   - ![](url " =WxH")                            →  image with width/height
//   - [label size](/api/v1/wiki/files/<uuid>)     →  wikiFile atom block
//
// Unknown syntax never throws and never loses text. The parser falls back
// to a paragraph containing the raw markdown when prosemirror-markdown
// rejects a token shape it doesn't understand. See the parseOutlineMarkdown
// wrapper at the bottom of this file.

import MarkdownIt, { type PluginWithParams } from "markdown-it";
import MarkdownItContainer from "markdown-it-container";
import Token from "markdown-it/lib/token.mjs";
import type StateCore from "markdown-it/lib/rules_core/state_core.mjs";
import { MarkdownParser } from "prosemirror-markdown";
import { Node, type Attrs } from "prosemirror-model";
import { wikiSchema } from "./wiki-schema.js";

// The four notice variants our editor supports. New variants must be added
// here, in wiki-schema.ts, and on the editor side at the same time.
const NOTICE_VARIANTS = ["info", "success", "warning", "tip"] as const;
type NoticeVariant = (typeof NOTICE_VARIANTS)[number];

const FILE_HREF_PATTERN =
  /^\/api\/v1\/wiki\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

// markdown-it core rule: walk the block-level token stream and replace any
// paragraph whose inline children are images and whitespace only with one
// synthetic `image_block` token per image. The image node in our schema
// is block-level (matching the editor's `Image.configure({ inline: false })`),
// so it can't sit inside the paragraph's `inline*` content. Hoisting each
// image to a top-level token lets prosemirror-markdown insert them at doc
// level instead of trying — and silently failing — to insert a block node
// into an inline context. Multi-image paragraphs (e.g. two screenshots
// side-by-side, common in Outline) become a sequence of image blocks.
function liftStandaloneImagesRule(state: StateCore): void {
  const tokens = state.tokens;
  const out: Token[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    const inline = tokens[i + 1];
    const close = tokens[i + 2];

    if (
      open?.type === "paragraph_open" &&
      inline?.type === "inline" &&
      close?.type === "paragraph_close" &&
      Array.isArray(inline.children)
    ) {
      const images = collectStandaloneImages(inline.children);
      if (images) {
        for (const { attrs } of images) {
          const blockToken = new Token("image_block", "", 0);
          blockToken.attrs = attrs;
          blockToken.block = true;
          blockToken.map = open.map;
          out.push(blockToken);
        }
        i += 2; // skip inline and paragraph_close
        continue;
      }
    }

    out.push(open);
  }

  state.tokens = out;
}

// Core rule: wrap the `inline` token inside each table cell (`td`/`th`)
// with `paragraph_open` / `paragraph_close`. Our schema's tableCell and
// tableHeader content is `block+`, so raw inline text fails ProseMirror's
// `createAndFill` — the cell is then dropped entirely (you get empty
// rows on the editor side). Markdown-it always emits exactly one `inline`
// token between *_open/*_close for pipe-table cells, including empty
// cells (zero-length inline). We wrap it so the inline children land in
// a paragraph node that satisfies the schema.
function wrapTableCellInlineRule(state: StateCore): void {
  const tokens = state.tokens;
  const out: Token[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i];
    const isCellOpen = open?.type === "td_open" || open?.type === "th_open";
    if (!isCellOpen) {
      out.push(open);
      continue;
    }

    out.push(open);

    // Walk forward to the matching close, wrapping any `inline` token in a
    // paragraph and leaving block-level tokens (rare in pipe tables but
    // possible in extended table syntaxes) untouched.
    const closeType = open.type === "td_open" ? "td_close" : "th_close";
    i += 1;
    while (i < tokens.length && tokens[i].type !== closeType) {
      const t = tokens[i];
      if (t.type === "inline") {
        const pOpen = new Token("paragraph_open", "p", 1);
        pOpen.block = true;
        pOpen.map = t.map;
        const pClose = new Token("paragraph_close", "p", -1);
        pClose.block = true;
        out.push(pOpen, t, pClose);
      } else {
        out.push(t);
      }
      i += 1;
    }
    if (i < tokens.length) out.push(tokens[i]); // the *_close token
  }

  state.tokens = out;
}

// Return the image tokens if the inline children are images with only
// whitespace/softbreak/text-only-spaces between them. Returns null when
// the paragraph contains real text (in which case it must remain a
// paragraph; the inline `image` tokens inside will be dropped by the
// `image: { ignore }` token map). Outline emits standalone block images
// this way, sometimes two side-by-side in a single paragraph.
function collectStandaloneImages(
  children: Token[],
): Array<{ attrs: [string, string][] }> | null {
  const images: Array<{ attrs: [string, string][] }> = [];
  for (const c of children) {
    if (c.type === "image") {
      // Markdown-it stores image alt text inside a children array on the
      // image token; flatten it to a string and stash it as an `alt` attr
      // so our image_block handler doesn't have to walk children later.
      const altText = c.children?.map((t) => t.content).join("") ?? "";
      const attrs: [string, string][] = [...(c.attrs ?? [])];
      if (altText && !attrs.some(([k]) => k === "alt")) {
        attrs.push(["alt", altText]);
      }
      images.push({ attrs });
    } else if (c.type === "text") {
      if (c.content.trim().length > 0) return null;
    } else if (c.type === "softbreak" || c.type === "hardbreak") {
      // ignore whitespace breaks around the images
    } else {
      return null;
    }
  }
  return images.length > 0 ? images : null;
}

// Build a markdown-it instance with notice-block containers registered.
function buildTokenizer(): MarkdownIt {
  const md = new MarkdownIt("default", {
    html: false,
    linkify: false,
    typographer: false,
    breaks: false,
  });

  // Register the standalone-image lifter as a core rule. Runs after
  // `block` (which produces paragraphs) and after `inline` (which fills
  // in inline children). markdown-it's default rule order: normalize →
  // block → inline → linkify → replacements → smartquotes → text_join.
  // We slot in just before `linkify` to see fully-resolved inline tokens.
  md.core.ruler.before("linkify", "lift_standalone_images", liftStandaloneImagesRule);
  md.core.ruler.before("linkify", "wrap_table_cell_inline", wrapTableCellInlineRule);

  for (const variant of NOTICE_VARIANTS) {
    // Type-cast: @types/markdown-it-container expects the legacy
    // `import = require()` shape of MarkdownIt; we use the modern ESM
    // default import. The runtime contract is identical.
    //
    // No `validate` override: the plugin's default validate matches only
    // when the marker line's first word equals the registered name, so
    // each variant routes to its own container_<variant>_open token.
    // Overriding to `() => true` made every container match every marker
    // and the first-registered (info) ate everything.
    md.use(MarkdownItContainer as unknown as PluginWithParams, variant, {});
  }

  return md;
}

// Parse an image token's title attribute for an Outline-style size hint.
// Outline emits images as `![](url " =WxH")` where the title is the literal
// string ` =WxH`. We extract numeric width and height and clear the title.
function parseImageAttrs(token: { attrGet: (name: string) => string | null; children: Array<{ content: string }> | null }): Attrs {
  const src = token.attrGet("src");
  const rawTitle = token.attrGet("title") ?? "";
  const alt = token.children && token.children[0] ? token.children[0].content : null;

  let width: number | null = null;
  let height: number | null = null;
  let cleanedTitle: string | null = rawTitle.length > 0 ? rawTitle : null;

  // Outline puts the size hint as " =WxH" inside the title. Strip whitespace
  // before matching so we don't fail on extra spaces.
  const sizeMatch = rawTitle.trim().match(/^=(\d+)x(\d+)$/);
  if (sizeMatch) {
    width = parseInt(sizeMatch[1], 10);
    height = parseInt(sizeMatch[2], 10);
    cleanedTitle = null;
  }

  return {
    src,
    alt,
    title: cleanedTitle,
    width,
    height,
  };
}

// The raw token map. Keys are markdown-it token names (always snake_case
// from the tokenizer); values reference our schema's camelCase node/mark
// names. Unknown variants of `:::` containers are not registered and
// therefore parsed as plain paragraphs by markdown-it itself — that is
// our graceful-degradation path for unknown notice variants.
function buildTokenMap() {
  const map: Record<string, unknown> = {
    paragraph: { block: "paragraph" },
    heading: {
      block: "heading",
      getAttrs: (tok: { tag: string }) => ({
        level: parseInt(tok.tag.slice(1), 10) || 1,
      }),
    },
    blockquote: { block: "blockquote" },
    bullet_list: { block: "bulletList" },
    ordered_list: {
      block: "orderedList",
      getAttrs: (tok: { attrGet: (name: string) => string | null }) => ({
        start: parseInt(tok.attrGet("start") ?? "1", 10) || 1,
      }),
    },
    list_item: { block: "listItem" },
    code_block: {
      block: "codeBlock",
      noCloseToken: true,
      getAttrs: () => ({ language: null, wrap: false }),
    },
    fence: {
      block: "codeBlock",
      noCloseToken: true,
      getAttrs: (tok: { info: string }) => ({
        language: tok.info ? tok.info.trim() : null,
        wrap: false,
      }),
    },
    hr: {
      node: "horizontalRule",
      getAttrs: () => ({ variant: "line" }),
    },
    // `image` is the inline-image token type — only emitted when an image
    // appears mid-paragraph alongside other text. Our schema doesn't model
    // an inline image (matches editor exactly), so we tell the parser to
    // ignore those. `noCloseToken: true` is required because markdown-it
    // emits `image` as a single atomic token; without this flag the
    // ignore-handler registers under `image_open`/`image_close` instead
    // and the parser throws "Token type `image` not supported" the moment
    // an inline image survives the standalone-image lifter rule above.
    image: { ignore: true, noCloseToken: true },
    image_block: {
      node: "image",
      getAttrs: parseImageAttrs,
    },
    hardbreak: { node: "hardBreak" },

    // Tables (GFM) — markdown-it default preset emits these tokens.
    table: { block: "table" },
    thead: { ignore: true },
    tbody: { ignore: true },
    tr: { block: "tableRow" },
    th: { block: "tableHeader" },
    td: { block: "tableCell" },

    // Marks
    em: { mark: "italic" },
    strong: { mark: "bold" },
    s: { mark: "strike" },
    link: {
      mark: "link",
      getAttrs: (tok: { attrGet: (name: string) => string | null }) => ({
        href: tok.attrGet("href"),
        title: tok.attrGet("title") ?? null,
      }),
    },
    code_inline: { mark: "code", noCloseToken: true },
  };

  for (const variant of NOTICE_VARIANTS) {
    map[`container_${variant}`] = {
      block: "wikiNotice",
      getAttrs: () => ({ variant }),
    };
  }

  return map;
}

const tokenizer = buildTokenizer();
const tokens = buildTokenMap() as ConstructorParameters<typeof MarkdownParser>[2];

const innerParser = new MarkdownParser(wikiSchema, tokenizer, tokens);

// After parsing, sweep the doc and replace any paragraph that consists of
// exactly one link to /api/v1/wiki/files/<uuid> with a wikiFile atom block.
// Outline serialises its block-level attachments as `[Filename 1234](url)`
// inside an otherwise-empty paragraph; we restore the block atom here.
function liftFileLinksToBlocks(doc: Node): Node {
  const replacements: Array<{ pos: number; size: number; node: Node }> = [];

  doc.descendants((node, pos) => {
    if (node.type !== wikiSchema.nodes.paragraph) return true;

    // Outline emits a backslash line on its own to add visual spacing
    // between adjacent block-level attachments. CommonMark parses
    // `\<newline>` as a hardBreak, so the paragraph holding the file link
    // ends up with a leading hardBreak before the linked text. We treat
    // hardBreaks as ignorable when looking for the "lone file link"
    // pattern so the second attachment still lifts correctly.
    const significant: Node[] = [];
    node.forEach((child) => {
      if (child.type !== wikiSchema.nodes.hardBreak) significant.push(child);
    });
    if (significant.length !== 1) return false;
    const onlyChild = significant[0];
    if (!onlyChild.isText) return false;

    const linkMark = onlyChild.marks.find(
      (m) => m.type === wikiSchema.marks.link
    );
    if (!linkMark) return false;

    const href = linkMark.attrs.href as string | null;
    if (!href) return false;

    const match = FILE_HREF_PATTERN.exec(href);
    if (!match) return false;

    // Outline label format: "<filename> <size>". Split off the trailing
    // numeric token; if it's absent or non-numeric, treat the whole label
    // as the filename and report size as 0.
    const label = onlyChild.text ?? "";
    const trailingNumberMatch = label.match(/^(.*) (\d+)$/);
    const filename = trailingNumberMatch ? trailingNumberMatch[1] : label;
    const size = trailingNumberMatch ? parseInt(trailingNumberMatch[2], 10) : 0;

    const fileNode = wikiSchema.nodes.wikiFile.create({
      fileId: match[1],
      url: href,
      filename,
      size,
      contentType: guessContentType(filename),
    });

    // Position+size of the paragraph node itself, not its content.
    replacements.push({ pos, size: node.nodeSize, node: fileNode });
    return false;
  });

  if (replacements.length === 0) return doc;

  // Apply replacements in reverse so later positions stay valid.
  let json = doc.toJSON() as { content?: unknown[] };
  if (!Array.isArray(json.content)) return doc;

  // Rebuilding via JSON is easier than tracking ProseMirror positions
  // through nested replacements. Walk the top-level content array; for
  // each top-level paragraph that matches, swap in the wikiFile JSON.
  // Note: we only lift attachments that are top-level paragraphs. Nested
  // (e.g. inside a list or notice) keep the link mark — Outline's exporter
  // doesn't emit nested attachments either.
  const newContent = (json.content as Array<Record<string, unknown>>).map(
    (child) => {
      if (child.type !== "paragraph") return child;
      const inline = child.content as Array<Record<string, unknown>> | undefined;
      if (!inline) return child;
      // Strip hardBreak children so a leading `\` line break (see above)
      // doesn't prevent the lift.
      const significant = inline.filter((c) => c.type !== "hardBreak");
      if (significant.length !== 1) return child;
      const t = significant[0];
      if (t.type !== "text") return child;
      const marks = t.marks as Array<{ type: string; attrs?: Record<string, unknown> }> | undefined;
      if (!marks || marks.length !== 1) return child;
      const linkMark = marks[0];
      if (linkMark.type !== "link") return child;
      const href = linkMark.attrs?.href as string | undefined;
      if (!href) return child;
      const m = FILE_HREF_PATTERN.exec(href);
      if (!m) return child;
      const label = (t.text as string) ?? "";
      const trailing = label.match(/^(.*) (\d+)$/);
      return {
        type: "wikiFile",
        attrs: {
          fileId: m[1],
          url: href,
          filename: trailing ? trailing[1] : label,
          size: trailing ? parseInt(trailing[2], 10) : 0,
          contentType: guessContentType(trailing ? trailing[1] : label),
        },
      };
    }
  );

  return wikiSchema.nodeFromJSON({ ...json, content: newContent });
}

function guessContentType(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "pdf": return "application/pdf";
    case "png": return "image/png";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "svg": return "image/svg+xml";
    case "txt": return "text/plain";
    case "md": return "text/markdown";
    case "csv": return "text/csv";
    case "json": return "application/json";
    case "zip": return "application/zip";
    case "doc": return "application/msword";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xls": return "application/vnd.ms-excel";
    case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default: return "application/octet-stream";
  }
}

// Public entry point. Always returns a valid ProseMirror Node — never throws
// on malformed markdown. On parser failure, returns a single paragraph
// containing the original markdown so no text content is lost.
export function parseOutlineMarkdown(markdown: string): Node {
  let parsed: Node;
  try {
    parsed = innerParser.parse(markdown) ?? buildFallbackDoc(markdown);
  } catch {
    return buildFallbackDoc(markdown);
  }

  // Empty body → an empty paragraph so the schema's "block+" content rule
  // is satisfied.
  if (parsed.content.size === 0) {
    return wikiSchema.nodes.doc.create(
      null,
      wikiSchema.nodes.paragraph.create()
    );
  }

  return liftFileLinksToBlocks(parsed);
}

function buildFallbackDoc(text: string): Node {
  // Split on blank lines so multi-paragraph input survives as multiple
  // paragraphs. Always emits at least one paragraph (possibly empty) so
  // the doc node validates.
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.length > 0);
  const blocks =
    paragraphs.length > 0
      ? paragraphs.map((p) =>
          wikiSchema.nodes.paragraph.create(null, wikiSchema.text(p))
        )
      : [wikiSchema.nodes.paragraph.create()];
  return wikiSchema.nodes.doc.create(null, blocks);
}
