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

// The export dialog absolutises media links so the Markdown is useful
// outside the app. Re-importing an exported page therefore hands the parser
// an absolute href; anchoring to the relative form alone left it as an inert
// link and lost the attachment.
test("an absolute attachment link still lifts to a file node", () => {
  const md =
    "[report.pdf 2048](https://c2.example.com/api/v1/wiki/files/12345678-1234-1234-1234-123456789012)";
  const doc = parseOutlineMarkdown(md);

  const kinds: string[] = [];
  doc.descendants((node) => {
    kinds.push(node.type.name);
    return true;
  });
  assert.ok(kinds.includes("wikiFile"), `no attachment node: ${kinds.join(",")}`);

  // Re-serialising normalises back to the canonical relative form, which is
  // what the document stores and what every in-app link resolves against.
  const out = serializeWikiDocument(doc);
  assert.match(out, /\(\/api\/v1\/wiki\/files\/12345678-1234-1234-1234-123456789012\)/);
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

// The serializer emitted GFM checkboxes from the start; nothing read them
// back, so a read-modify-write turned a task list into a bullet list of
// escaped "\\[x\\]" prose. One round trip per edit, quietly.
test("task list survives the yjs pipeline", () => {
  const md = "- [x] ran the sweep\n- [ ] wrote it up";
  const out = roundTripViaYjs(md);
  assert.match(out, /- \[x\] ran the sweep/);
  assert.match(out, /- \[ \] wrote it up/);
  assert.ok(structurallyEqual(md, out), `expected equivalent, got: ${out}`);
});

// The lift requires every item to carry a marker. A list that merely mentions
// brackets is a bullet list, and rewriting it would be the same damage in the
// other direction.
test("a list where only some items look like tasks stays a bullet list", () => {
  const doc = parseOutlineMarkdown("- [x] done\n- not a task");
  const kinds: string[] = [];
  doc.descendants((node) => {
    kinds.push(node.type.name);
    return true;
  });
  assert.ok(kinds.includes("bulletList"), `expected a bulletList, got ${kinds.join(",")}`);
  assert.ok(!kinds.includes("taskList"), `converted a mixed list: ${kinds.join(",")}`);
});

// Checklist items are the operator's coverage bar. Dropping one loses both
// the question and the answer under it.
test("checklist item round-trips with its attributes and answer", () => {
  const md =
    ':::checklist {"prompt":"Enumerated SMB shares?","required":true,"state":"answered"}\n' +
    "Three shares, one world-readable.\n\n:::";
  const out = roundTripViaYjs(md);
  assert.match(out, /"prompt":"Enumerated SMB shares\?"/);
  assert.match(out, /"required":true/);
  assert.match(out, /"state":"answered"/);
  assert.match(out, /Three shares, one world-readable\./);
  assert.ok(structurallyEqual(md, out), `expected equivalent, got: ${out}`);
});

// A chip that does not survive stops resolving, and the reverse lookups that
// hang off it ("which pages reference this host?") go quiet.
test("host, hash and page chips survive the yjs pipeline", () => {
  const md =
    "reached [host](vibe://host/11111111-1111-1111-1111-111111111111) " +
    "with [hash](vibe://hash/22222222-2222-2222-2222-222222222222), " +
    "see [page](vibe://doc/33333333-3333-3333-3333-333333333333)";
  const out = roundTripViaYjs(md);
  assert.ok(structurallyEqual(md, out), `expected equivalent, got: ${out}`);

  const kinds: string[] = [];
  parseOutlineMarkdown(out).descendants((node) => {
    kinds.push(node.type.name);
    return true;
  });
  for (const node of ["wikiHostReference", "wikiHashReference", "wikiDocumentReference"]) {
    assert.ok(kinds.includes(node), `${node} did not survive: ${kinds.join(",")}`);
  }
});

// An ordinary link must not be swept up by the chip lowering.
test("an ordinary link is not turned into a chip", () => {
  const doc = parseOutlineMarkdown("see [docs](https://example.com/x)");
  const kinds: string[] = [];
  doc.descendants((node) => {
    kinds.push(node.type.name);
    return true;
  });
  assert.ok(!kinds.some((k) => k.endsWith("Reference")), `made a chip: ${kinds.join(",")}`);
});

// The rename is self-healing: a body still carrying the pre-Logos spellings
// lowers into the same nodes, and the next save writes them back out under the
// current ones. This is what lets the swap to Logos images be a plain image
// change — every page that gets saved fixes its own derived markdown, and the
// startup backfill sweeps the rest.
test("legacy vibe:// chips re-serialize as logos://", () => {
  const legacy =
    "reached [host](vibe://host/11111111-1111-1111-1111-111111111111) " +
    "see [page](vibe://doc/33333333-3333-3333-3333-333333333333)";
  const out = roundTripViaYjs(legacy);
  assert.ok(out.includes("logos://host/11111111-1111-1111-1111-111111111111"));
  assert.ok(out.includes("logos://doc/33333333-3333-3333-3333-333333333333"));
  assert.ok(!out.includes("vibe://"), `old scheme survived: ${out}`);
});

test("legacy vibe-credential fence re-serializes as logos-credential", () => {
  const legacy = '```vibe-credential\n{\n  "id": "44444444-4444-4444-4444-444444444444"\n}\n```';
  const out = roundTripDirect(legacy);
  assert.ok(out.includes("```logos-credential"), `not rewritten: ${out}`);
  assert.ok(!out.includes("vibe-credential"), `old fence survived: ${out}`);
});
