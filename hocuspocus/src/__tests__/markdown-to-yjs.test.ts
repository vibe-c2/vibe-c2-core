// Round-trip + spec coverage for the markdown→Y.js pipeline used by the
// Outline importer. Run with `node --test --import tsx src/__tests__/`.

import test from "node:test";
import assert from "node:assert/strict";
import { Doc, applyUpdate } from "yjs";
import { yXmlFragmentToProsemirrorJSON } from "y-prosemirror";
import { parseOutlineMarkdown } from "../markdown-parser.js";
import { markdownToYjsUpdate, Y_FRAGMENT_FIELD } from "../markdown-to-yjs.js";

// Decode bytes → ProseMirror JSON via the same path the editor uses on load.
function decode(update: Uint8Array): Record<string, unknown> {
  const ydoc = new Doc();
  applyUpdate(ydoc, update);
  const fragment = ydoc.getXmlFragment(Y_FRAGMENT_FIELD);
  const json = yXmlFragmentToProsemirrorJSON(fragment) as Record<string, unknown>;
  ydoc.destroy();
  return json;
}

test("round-trips a simple paragraph", () => {
  const md = "hello world";
  const json = decode(markdownToYjsUpdate(md));
  assert.equal((json.type as string), "doc");
  const content = json.content as Array<Record<string, unknown>>;
  assert.equal(content.length, 1);
  assert.equal(content[0].type, "paragraph");
  const inline = content[0].content as Array<Record<string, unknown>>;
  assert.equal(inline[0].type, "text");
  assert.equal(inline[0].text, "hello world");
});

test("round-trips a heading", () => {
  const md = "## Sub-section";
  const json = decode(markdownToYjsUpdate(md));
  const content = json.content as Array<Record<string, unknown>>;
  assert.equal(content[0].type, "heading");
  assert.deepEqual(content[0].attrs, { level: 2 });
});

test("round-trips a code fence with language", () => {
  const md = "```javascript\nconst x = 1;\n```";
  const json = decode(markdownToYjsUpdate(md));
  const content = json.content as Array<Record<string, unknown>>;
  assert.equal(content[0].type, "codeBlock");
  const attrs = content[0].attrs as Record<string, unknown>;
  assert.equal(attrs.language, "javascript");
  assert.equal(attrs.wrap, false);
  const inline = content[0].content as Array<Record<string, unknown>>;
  assert.equal(inline[0].type, "text");
  assert.equal(inline[0].text, "const x = 1;");
});

test("horizontal rule defaults to variant=line", () => {
  const md = "---";
  const json = decode(markdownToYjsUpdate(md));
  const content = json.content as Array<Record<string, unknown>>;
  assert.equal(content[0].type, "horizontalRule");
  const attrs = content[0].attrs as Record<string, unknown>;
  assert.equal(attrs.variant, "line");
});

for (const variant of ["info", "success", "warning", "tip"] as const) {
  test(`:::${variant} container becomes wikiNotice variant=${variant}`, () => {
    const md = `:::${variant}\nhello\n:::`;
    const json = decode(markdownToYjsUpdate(md));
    const content = json.content as Array<Record<string, unknown>>;
    assert.equal(content[0].type, "wikiNotice");
    assert.deepEqual(content[0].attrs, { variant });
    const inner = content[0].content as Array<Record<string, unknown>>;
    assert.equal(inner[0].type, "paragraph");
  });
}

test("unknown ::: variant degrades to plain paragraphs (no crash)", () => {
  // ":::danger" is not registered — markdown-it keeps it as plain text in
  // surrounding paragraphs. The parser invariant is "never crash, never
  // lose text"; the literal markers leak through as text content.
  const md = ":::danger\nrisky text\n:::";
  const json = decode(markdownToYjsUpdate(md));
  const content = json.content as Array<Record<string, unknown>>;
  // At least one paragraph must contain "risky text" — exact paragraph
  // shape can vary because markdown-it's paragraph splitting depends on
  // the surrounding markers.
  const allText = JSON.stringify(json);
  assert.ok(allText.includes("risky text"), "text content must survive");
  assert.ok(content.length > 0, "must produce at least one block");
});

test("standalone image with =WxH title hint becomes a top-level image block", () => {
  // The editor stores images as block-level nodes (TipTap is configured
  // with `Image.configure({ inline: false })`), so the parser lifts a
  // standalone-image paragraph into a top-level image block.
  const md = '![](https://example.com/x.png " =640x480")';
  const json = decode(markdownToYjsUpdate(md));
  const content = json.content as Array<Record<string, unknown>>;
  assert.equal(content[0].type, "image");
  const attrs = content[0].attrs as Record<string, unknown>;
  assert.equal(attrs.src, "https://example.com/x.png");
  assert.equal(attrs.width, 640);
  assert.equal(attrs.height, 480);
  assert.ok(attrs.title === null || attrs.title === undefined);
});

test("inline images mid-paragraph are dropped (not modeled in our schema)", () => {
  // Our schema follows the editor's `inline: false` for images, so a
  // mid-paragraph image is not representable. The surrounding text
  // survives — we never lose words.
  const md = "Look at this ![](https://example.com/x.png) inline.";
  const json = decode(markdownToYjsUpdate(md));
  const content = json.content as Array<Record<string, unknown>>;
  // Real parse path, not the catch-all fallback: the only top-level node
  // must be a paragraph (no doc-level image, no leaked `![](...)` text).
  assert.equal(content.length, 1);
  assert.equal(content[0].type, "paragraph");
  const inline = content[0].content as Array<Record<string, unknown>>;
  const text = inline.map((n) => (n.text as string) ?? "").join("");
  assert.ok(text.includes("Look at this"));
  assert.ok(text.includes("inline."));
  assert.ok(!text.includes("!["), "raw markdown image syntax must not leak");
});

test("two side-by-side images in one paragraph become two image blocks", () => {
  // Outline emits multi-image rows like this verbatim. Without the
  // multi-image lift + `noCloseToken: true` on the `image` ignore-spec,
  // prosemirror-markdown throws "Token type `image` not supported",
  // parseOutlineMarkdown silently falls back to plaintext, and the whole
  // document loses its structure (this is the BootExec.md regression).
  const md =
    '![](https://example.com/a.png " =895x341") ![](https://example.com/b.png " =889x210")';
  const json = decode(markdownToYjsUpdate(md));
  const content = json.content as Array<Record<string, unknown>>;
  assert.equal(content.length, 2);
  assert.equal(content[0].type, "image");
  assert.equal(content[1].type, "image");
  const first = content[0].attrs as Record<string, unknown>;
  const second = content[1].attrs as Record<string, unknown>;
  assert.equal(first.src, "https://example.com/a.png");
  assert.equal(first.width, 895);
  assert.equal(first.height, 341);
  assert.equal(second.src, "https://example.com/b.png");
  assert.equal(second.width, 889);
  assert.equal(second.height, 210);
});

test("outline doc with notices, code, hr, multi-image survives parse", () => {
  // Mini reproduction of the BootExec.md shape that previously crashed
  // the parser and triggered the catch-all fallback. We assert the real
  // structure is preserved end-to-end.
  const md = [
    "# Title",
    "",
    ":::info",
    "context line",
    ":::",
    "",
    "## ==Heading==",
    "",
    "```bash",
    "sudo something",
    "```",
    "",
    '![](https://example.com/a.png " =100x100") ![](https://example.com/b.png " =100x100")',
    "",
    "---",
    "---",
    "",
    ":::success",
    "DONE",
    ":::",
  ].join("\n");

  const json = decode(markdownToYjsUpdate(md));
  const content = json.content as Array<Record<string, unknown>>;
  const types = content.map((n) => n.type as string);
  // Must include real structured nodes, not 196 plain paragraphs.
  assert.ok(types.includes("heading"));
  assert.ok(types.includes("wikiNotice"));
  assert.ok(types.includes("codeBlock"));
  assert.ok(types.includes("horizontalRule"));
  assert.equal(types.filter((t) => t === "image").length, 2);
});

test("file attachment link in a lone paragraph lifts to wikiFile block", () => {
  // Outline's serialized format: filename then space then byte size then
  // a link to /api/v1/wiki/files/<uuid>.
  const md =
    "[Roles & Responsibilities.pdf 2011979](/api/v1/wiki/files/6ae945b2-05c1-40d7-a9ba-e63b1c5d0fcb)";
  const json = decode(markdownToYjsUpdate(md));
  const content = json.content as Array<Record<string, unknown>>;
  assert.equal(content[0].type, "wikiFile");
  const attrs = content[0].attrs as Record<string, unknown>;
  assert.equal(attrs.fileId, "6ae945b2-05c1-40d7-a9ba-e63b1c5d0fcb");
  assert.equal(attrs.filename, "Roles & Responsibilities.pdf");
  assert.equal(attrs.size, 2011979);
  assert.equal(attrs.contentType, "application/pdf");
});

test("file attachment preceded by a backslash line break still lifts to wikiFile", () => {
  // Outline emits a backslash on its own line as visual spacing between
  // adjacent block-level attachments. In CommonMark `\<newline>` is a hard
  // line break, so markdown-it parses the second paragraph as
  // hardBreak + linked-text. The lifter must still recognise this as a
  // single-attachment paragraph or the file renders as a plain hyperlink.
  const md = [
    "[ALL vpn configs.zip 310328](/api/v1/wiki/files/6ae945b2-05c1-40d7-a9ba-e63b1c5d0fcb)",
    "",
    "",
    "\\",
    "[sic_new25.ovpn 1694](/api/v1/wiki/files/cc4ed915-cf27-44d9-8279-ca9f74c0c5eb)",
  ].join("\n");
  const json = decode(markdownToYjsUpdate(md));
  const content = json.content as Array<Record<string, unknown>>;
  const fileBlocks = content.filter((n) => n.type === "wikiFile");
  assert.equal(fileBlocks.length, 2, "both attachments must lift to wikiFile");
  const second = fileBlocks[1].attrs as Record<string, unknown>;
  assert.equal(second.fileId, "cc4ed915-cf27-44d9-8279-ca9f74c0c5eb");
  assert.equal(second.filename, "sic_new25.ovpn");
  assert.equal(second.size, 1694);
});

test("non-attachment links keep the link mark", () => {
  const md = "Visit [the docs](https://example.com/docs) for more.";
  const json = decode(markdownToYjsUpdate(md));
  const content = json.content as Array<Record<string, unknown>>;
  assert.equal(content[0].type, "paragraph");
  const inline = content[0].content as Array<Record<string, unknown>>;
  // One of the inline children must carry a link mark to example.com.
  const linked = inline.find((n) => {
    const marks = n.marks as Array<{ type: string; attrs?: Record<string, unknown> }> | undefined;
    return marks?.some(
      (m) => m.type === "link" && (m.attrs?.href as string) === "https://example.com/docs"
    );
  });
  assert.ok(linked, "link mark must be preserved on inline text");
});

test("empty markdown produces a doc with one empty paragraph", () => {
  const json = decode(markdownToYjsUpdate(""));
  assert.equal(json.type, "doc");
  const content = json.content as Array<Record<string, unknown>>;
  assert.equal(content.length, 1);
  assert.equal(content[0].type, "paragraph");
});

test("parseOutlineMarkdown never throws on garbage", () => {
  // Stresses the parser fallback path. Anything that prosemirror-markdown
  // would normally choke on must still produce a valid PM Node.
  const evilInputs = [
    "  unprintable bytes",
    "::::::::::::::::::: malformed marker run",
    "[broken](unclosed",
    "```\n\nno close fence",
  ];
  for (const md of evilInputs) {
    const node = parseOutlineMarkdown(md);
    assert.equal(node.type.name, "doc", `input: ${JSON.stringify(md)}`);
    assert.ok(node.content.size > 0, `content lost for: ${JSON.stringify(md)}`);
  }
});

test("markdownToYjsUpdate produces non-empty bytes for non-empty content", () => {
  const update = markdownToYjsUpdate("# title\n\nbody paragraph");
  assert.ok(update instanceof Uint8Array);
  assert.ok(update.byteLength > 0);
});

test("GFM table preserves header, body cells, links, and empty cells", () => {
  // Regression: prosemirror-markdown's MarkdownParser cannot fit raw inline
  // text into our schema's tableCell/tableHeader (content: "block+"), so
  // without the wrap_table_cell_inline core rule the cells (and their text)
  // get dropped via createAndFill. The editor then renders blank rows.
  const md = `| H1 | H2 | H3 |
|----|----|----|
| a  | [link](https://example.com) | c |
|    | empty first | x |`;
  const json = decode(markdownToYjsUpdate(md));
  const content = json.content as Array<Record<string, unknown>>;
  assert.equal(content[0].type, "table");
  const rows = content[0].content as Array<Record<string, unknown>>;
  assert.equal(rows.length, 3, "header + two body rows");

  const headers = rows[0].content as Array<Record<string, unknown>>;
  assert.equal(headers.length, 3, "three header cells");
  assert.equal(headers[0].type, "tableHeader");
  const h0Para = (headers[0].content as Array<Record<string, unknown>>)[0];
  assert.equal(h0Para.type, "paragraph");
  const h0Text = (h0Para.content as Array<Record<string, unknown>>)[0];
  assert.equal(h0Text.text, "H1");

  const bodyCells = rows[1].content as Array<Record<string, unknown>>;
  assert.equal(bodyCells.length, 3);
  assert.equal(bodyCells[0].type, "tableCell");
  const linkPara = (bodyCells[1].content as Array<Record<string, unknown>>)[0];
  const linkInline = (linkPara.content as Array<Record<string, unknown>>)[0];
  const marks = linkInline.marks as Array<{ type: string; attrs?: Record<string, unknown> }> | undefined;
  assert.ok(
    marks?.some((m) => m.type === "link" && m.attrs?.href === "https://example.com"),
    "link mark must survive inside a table cell",
  );

  // Empty cell still produces a tableCell containing one empty paragraph,
  // so the row keeps its column count and the editor can place the caret.
  const emptyRow = rows[2].content as Array<Record<string, unknown>>;
  assert.equal(emptyRow.length, 3);
  const emptyCellParas = emptyRow[0].content as Array<Record<string, unknown>>;
  assert.equal(emptyCellParas.length, 1);
  assert.equal(emptyCellParas[0].type, "paragraph");
});
