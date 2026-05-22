// Round-trip tests for the markdown → Y.js → markdown pipeline used by the
// wiki export flow. The exported markdown must parse back through the
// importer into an equivalent document; these tests assert that contract.

import test from "node:test";
import assert from "node:assert/strict";
import { markdownToYjsUpdate } from "../markdown-to-yjs.js";
import { yjsUpdateToMarkdown } from "../yjs-to-markdown.js";
import { parseOutlineMarkdown } from "../markdown-parser.js";
import { serializeWikiDocument } from "../markdown-serializer.js";
import { wikiSchema } from "../wiki-schema.js";

// Round-trip via the actual sidecar surfaces: markdown → bytes → markdown.
function roundTripViaYjs(md: string): string {
  return yjsUpdateToMarkdown(markdownToYjsUpdate(md));
}

// Round-trip via the in-process parser + serializer. Faster than the full
// Y.js pipeline and isolates serializer behavior from y-prosemirror's
// XmlFragment translation. Used where we want to inspect the markdown
// shape without Y.js intermediate state.
function roundTripDirect(md: string): string {
  return serializeWikiDocument(parseOutlineMarkdown(md));
}

// Parse twice and compare the JSON shape — exact whitespace differs between
// emitter and parser, so structural equivalence is the right contract.
function structurallyEqual(a: string, b: string): boolean {
  return JSON.stringify(parseOutlineMarkdown(a).toJSON()) ===
    JSON.stringify(parseOutlineMarkdown(b).toJSON());
}

test("paragraph round-trips through the yjs pipeline", () => {
  const md = "hello world";
  const out = roundTripViaYjs(md);
  assert.ok(structurallyEqual(md, out), `expected equivalent, got: ${out}`);
});

test("heading round-trips", () => {
  const md = "## Sub-section";
  assert.ok(structurallyEqual(md, roundTripDirect(md)));
});

test("code fence with language round-trips", () => {
  const md = "```javascript\nconst x = 1;\n```";
  const out = roundTripDirect(md);
  assert.match(out, /^```javascript\n/);
  assert.ok(structurallyEqual(md, out));
});

test("bullet list round-trips", () => {
  const md = "- one\n- two\n- three";
  assert.ok(structurallyEqual(md, roundTripDirect(md)));
});

test("ordered list round-trips", () => {
  const md = "1. one\n2. two\n3. three";
  assert.ok(structurallyEqual(md, roundTripDirect(md)));
});

test("blockquote round-trips", () => {
  const md = "> a quote\n> with two lines";
  assert.ok(structurallyEqual(md, roundTripDirect(md)));
});

test("horizontal rule round-trips", () => {
  const md = "before\n\n---\n\nafter";
  assert.ok(structurallyEqual(md, roundTripDirect(md)));
});

test("notice block round-trips", () => {
  const md = ":::info\nheads up\n:::";
  const out = roundTripDirect(md);
  assert.match(out, /^:::info/);
  assert.ok(out.includes(":::"));
  assert.ok(structurallyEqual(md, out));
});

test("image with size hint round-trips", () => {
  const md = '![](/api/v1/wiki/images/abc " =640x480")';
  const out = roundTripDirect(md);
  assert.match(out, / =640x480/);
});

test("file attachment round-trips", () => {
  const md =
    "[report.pdf 2048](/api/v1/wiki/files/12345678-1234-1234-1234-123456789012)";
  const out = roundTripDirect(md);
  assert.match(out, /report\.pdf 2048/);
});

test("bold + italic + strikethrough round-trip", () => {
  const md = "This **is bold** and *italic* and ~~struck~~.";
  assert.ok(structurallyEqual(md, roundTripDirect(md)));
});

test("inline code round-trips", () => {
  const md = "Use `foo()` to bar.";
  assert.ok(structurallyEqual(md, roundTripDirect(md)));
});

test("link round-trips", () => {
  const md = "See [the docs](https://example.com).";
  assert.ok(structurallyEqual(md, roundTripDirect(md)));
});

test("highlight mark with color round-trips", () => {
  const md =
    'pre <mark data-color="oklch(0.65 0.16 245)">highlighted blue</mark> post';
  const out = roundTripDirect(md);
  assert.match(
    out,
    /<mark data-color="oklch\(0\.65 0\.16 245\)">highlighted blue<\/mark>/,
    `expected highlight to round-trip with color: ${out}`,
  );
  assert.ok(structurallyEqual(md, out));
});

test("highlight mark without color round-trips", () => {
  const md = "untinted <mark>just a mark</mark> tail";
  const out = roundTripDirect(md);
  assert.match(out, /<mark>just a mark<\/mark>/);
  assert.ok(structurallyEqual(md, out));
});

test("highlight mark survives the yjs pipeline", () => {
  const md =
    'red <mark data-color="oklch(0.65 0.18 25)">danger</mark> tail';
  const out = roundTripViaYjs(md);
  assert.ok(
    structurallyEqual(md, out),
    `expected structural equality after yjs round-trip: ${out}`,
  );
});

test("task list (from the editor schema) serializes to GFM task syntax", () => {
  // The Outline markdown importer does not have a taskList/taskItem token
  // mapping, so we can't test this through parseOutlineMarkdown. Construct
  // the node directly the way the editor would and verify the serializer
  // emits `[ ]`/`[x]` checkboxes that the importer's GFM bullet parser
  // would at minimum keep as visible text on re-import.
  const todoItem = wikiSchema.nodes.taskItem.create(
    { checked: false },
    wikiSchema.nodes.paragraph.create(null, wikiSchema.text("todo")),
  );
  const doneItem = wikiSchema.nodes.taskItem.create(
    { checked: true },
    wikiSchema.nodes.paragraph.create(null, wikiSchema.text("done")),
  );
  const taskList = wikiSchema.nodes.taskList.create(null, [todoItem, doneItem]);
  const doc = wikiSchema.nodes.doc.create(null, taskList);
  const out = serializeWikiDocument(doc);
  assert.ok(out.includes("[ ] todo"), `expected "[ ] todo" in: ${out}`);
  assert.ok(out.includes("[x] done"), `expected "[x] done" in: ${out}`);
});

test("empty Y.js update returns empty string", () => {
  // Round-tripping an empty markdown produces an empty paragraph in the
  // schema, but the serializer should still emit something the importer
  // can re-parse.
  const out = roundTripViaYjs("");
  // Empty paragraph or empty string both round-trip back to the empty doc.
  assert.ok(structurallyEqual("", out));
});
