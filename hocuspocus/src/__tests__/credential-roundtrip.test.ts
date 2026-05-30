// Round-trip tests for the credential reference chip pipeline:
//
//   editor doc (paragraph with inline wikiCredentialReference chip)
//     → markdown via serializeWikiDocument               (lift to fence)
//     → markdown parse via parseOutlineMarkdown          (lower to paragraph + chip)
//
// These tests pin the serializer/parser contract that the core export
// orchestrator (Go: pkg/wikiexport) and import orchestrator (Go:
// pkg/wikiimport) build on. Any change here must keep both Go packages
// happy — the fence info-string `vibe-credential` is shared between all
// three.

import test from "node:test";
import assert from "node:assert/strict";

import {
  CREDENTIAL_FENCE_INFO,
  serializeWikiDocument,
} from "../markdown-serializer.js";
import {
  extractCredentialPayloads,
  parseOutlineMarkdown,
} from "../markdown-parser.js";
import { wikiSchema } from "../wiki-schema.js";

const CRED_ID = "11111111-1111-4111-8111-111111111111";
const CRED_ID_2 = "22222222-2222-4222-8222-222222222222";

// Build a doc with one inline credential chip inside a paragraph carrying
// surrounding text. Mirrors the editor's typical chip placement.
function buildDocWithInlineChip(credentialId: string) {
  return wikiSchema.nodes.doc.create(
    null,
    wikiSchema.nodes.paragraph.create(null, [
      wikiSchema.text("before "),
      wikiSchema.nodes.wikiCredentialReference.create({ credentialId }),
      wikiSchema.text(" after"),
    ]),
  );
}

test("serializer emits a vibe-credential fence for an inline chip", () => {
  const doc = buildDocWithInlineChip(CRED_ID);
  const md = serializeWikiDocument(doc);
  assert.match(
    md,
    new RegExp("```" + CREDENTIAL_FENCE_INFO + "\\n"),
    "expected a fenced block carrying the credential payload",
  );
  // The id is what the importer keys on; the rest of the payload is
  // resolver-supplied. With no resolver, the default produces {id: <id>}.
  assert.ok(md.includes(`"id": "${CRED_ID}"`), `id missing from ${md}`);
});

test("serializer splits the surrounding paragraph around the chip", () => {
  const doc = buildDocWithInlineChip(CRED_ID);
  const md = serializeWikiDocument(doc);
  // before-text and after-text both land on their own lines (separate
  // paragraphs), with the fence between them. The exact ordering is what
  // the importer's lowerer relies on for placement.
  const lines = md.split("\n").map((l) => l.trim()).filter(Boolean);
  const fenceIdx = lines.findIndex((l) => l.startsWith("```" + CREDENTIAL_FENCE_INFO));
  assert.ok(fenceIdx > 0, "expected leading paragraph before the fence");
  assert.ok(lines.indexOf("before") < fenceIdx, "leading text must precede fence");
  assert.ok(lines.indexOf("after") > fenceIdx, "trailing text must follow fence");
});

test("serializer hydrates payload via the resolver callback", () => {
  const doc = buildDocWithInlineChip(CRED_ID);
  const md = serializeWikiDocument(doc, (id) => ({
    id,
    name: "prod-ssh",
    username: "root",
    password: "hunter2",
    isValid: true,
  }));
  assert.match(md, /"name": "prod-ssh"/);
  assert.match(md, /"username": "root"/);
  assert.match(md, /"password": "hunter2"/);
});

test("serializer tombstones a chip whose resolver returns null", () => {
  const doc = buildDocWithInlineChip(CRED_ID);
  const md = serializeWikiDocument(doc, () => null);
  assert.match(md, /"deleted": true/);
  assert.match(md, new RegExp(`"id": "${CRED_ID}"`));
});

test("parser lowers a vibe-credential fence back to a paragraph + chip", () => {
  const md = [
    "before",
    "",
    "```" + CREDENTIAL_FENCE_INFO,
    JSON.stringify({ id: CRED_ID, name: "x" }, null, 2),
    "```",
    "",
    "after",
  ].join("\n");
  const doc = parseOutlineMarkdown(md);
  // First, second, third top-level children: paragraph(before), chip-paragraph, paragraph(after).
  const json = doc.toJSON() as { content: Array<Record<string, unknown>> };
  assert.equal(json.content.length, 3, `expected 3 blocks, got ${json.content.length}`);
  const middle = json.content[1] as { type: string; content?: Array<{ type: string; attrs?: Record<string, unknown> }> };
  assert.equal(middle.type, "paragraph");
  assert.ok(middle.content && middle.content.length === 1, "chip paragraph should hold one node");
  const chip = middle.content![0];
  assert.equal(chip.type, "wikiCredentialReference");
  assert.equal(chip.attrs?.credentialId, CRED_ID);
});

test("full round-trip: inline chip → serialize → parse produces an inline chip again", () => {
  const original = buildDocWithInlineChip(CRED_ID);
  const md = serializeWikiDocument(original, (id) => ({ id, name: "n" }));
  const reparsed = parseOutlineMarkdown(md);

  // Find the chip in the reparsed doc — it should sit alone in a paragraph.
  let found: string | null = null;
  reparsed.descendants((node) => {
    if (node.type === wikiSchema.nodes.wikiCredentialReference) {
      found = String(node.attrs.credentialId ?? "");
      return false;
    }
    return true;
  });
  assert.equal(found, CRED_ID);
});

test("multiple chips in one paragraph each become their own fence", () => {
  const doc = wikiSchema.nodes.doc.create(
    null,
    wikiSchema.nodes.paragraph.create(null, [
      wikiSchema.text("see "),
      wikiSchema.nodes.wikiCredentialReference.create({ credentialId: CRED_ID }),
      wikiSchema.text(" and "),
      wikiSchema.nodes.wikiCredentialReference.create({ credentialId: CRED_ID_2 }),
      wikiSchema.text("."),
    ]),
  );
  const md = serializeWikiDocument(doc, (id) => ({ id }));
  const fenceCount = (md.match(new RegExp("```" + CREDENTIAL_FENCE_INFO, "g")) || []).length;
  assert.equal(fenceCount, 2, `expected 2 fences, got ${fenceCount}: ${md}`);
});

test("repeated references to the same id are hydrated once per unique id", () => {
  const doc = wikiSchema.nodes.doc.create(
    null,
    wikiSchema.nodes.paragraph.create(null, [
      wikiSchema.nodes.wikiCredentialReference.create({ credentialId: CRED_ID }),
      wikiSchema.text(" / "),
      wikiSchema.nodes.wikiCredentialReference.create({ credentialId: CRED_ID }),
    ]),
  );
  let calls = 0;
  serializeWikiDocument(doc, (id) => {
    calls++;
    return { id, name: "n" };
  });
  assert.equal(calls, 1, `expected resolver to be called once, got ${calls}`);
});

test("extractCredentialPayloads pulls payloads in source order", () => {
  const md = [
    "para",
    "",
    "```" + CREDENTIAL_FENCE_INFO,
    JSON.stringify({ id: CRED_ID, name: "first" }, null, 2),
    "```",
    "",
    "more",
    "",
    "```" + CREDENTIAL_FENCE_INFO,
    JSON.stringify({ id: CRED_ID_2, name: "second" }, null, 2),
    "```",
  ].join("\n");
  const payloads = extractCredentialPayloads(md);
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].id, CRED_ID);
  assert.equal(payloads[0].name, "first");
  assert.equal(payloads[1].id, CRED_ID_2);
  assert.equal(payloads[1].name, "second");
});

test("malformed JSON in a vibe-credential fence falls through to a code block", () => {
  // The recogniser only converts fences whose body parses as JSON with a
  // string id; everything else stays a code block. Verifies we never lose
  // data on a malformed fence.
  const md = [
    "```" + CREDENTIAL_FENCE_INFO,
    "{ not valid json",
    "```",
  ].join("\n");
  const doc = parseOutlineMarkdown(md);
  const json = doc.toJSON() as { content: Array<Record<string, unknown>> };
  assert.equal(json.content.length, 1);
  // codeBlock keeps the raw content; the chip lowerer must NOT touch it.
  assert.equal(json.content[0].type, "codeBlock");
});

test("a fence missing the id field stays a code block", () => {
  const md = [
    "```" + CREDENTIAL_FENCE_INFO,
    JSON.stringify({ name: "no id here" }),
    "```",
  ].join("\n");
  const doc = parseOutlineMarkdown(md);
  const json = doc.toJSON() as { content: Array<Record<string, unknown>> };
  assert.equal(json.content[0].type, "codeBlock");
});
