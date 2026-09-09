import { test } from "node:test";
import assert from "node:assert/strict";
import { Doc } from "yjs";
import { __testing } from "../apply-markdown.js";
import { Y_FRAGMENT_FIELD } from "../markdown-to-yjs.js";
import { yjsUpdateToMarkdown } from "../yjs-to-markdown.js";
import { encodeStateAsUpdate } from "yjs";

const { markdownToDetachedNodes } = __testing;

// Y.js types cannot be moved between documents, so an agent's edit has to be
// deep-copied out of a scratch doc before it can be inserted into the live
// one. Copying by hand is where formatting quietly gets lost, so the copy is
// asserted through a full round-trip rather than by inspecting nodes.
function insertInto(doc: Doc, markdown: string, mode: "replace" | "append"): string {
  const fragment = doc.getXmlFragment(Y_FRAGMENT_FIELD);
  const nodes = markdownToDetachedNodes(markdown);
  doc.transact(() => {
    if (mode === "replace") fragment.delete(0, fragment.length);
    if (nodes.length > 0) fragment.insert(fragment.length, nodes);
  });
  return yjsUpdateToMarkdown(encodeStateAsUpdate(doc));
}

test("detached nodes round-trip into an empty document", () => {
  const doc = new Doc();
  const out = insertInto(doc, "# Title\n\nSome text.\n", "replace");
  assert.match(out, /# Title/);
  assert.match(out, /Some text\./);
  doc.destroy();
});

test("inline marks survive the deep copy", () => {
  // The copy walks the tree by hand; taking the plain string instead of the
  // delta would drop every mark and lose formatting without any error.
  const doc = new Doc();
  const out = insertInto(doc, "Some **bold** and `code` here.\n", "replace");
  assert.match(out, /\*\*bold\*\*/, "bold mark was lost in the copy");
  assert.match(out, /`code`/, "code mark was lost in the copy");
  doc.destroy();
});

test("nested structure survives the deep copy", () => {
  const doc = new Doc();
  const out = insertInto(doc, "- one\n- two\n- three\n", "replace");
  for (const item of ["one", "two", "three"]) {
    assert.match(out, new RegExp(item), `list item ${item} was lost`);
  }
  doc.destroy();
});

// Append is the mode that makes co-editing safe: it never touches what is
// already there, so it cannot race an operator typing above it.
test("append preserves existing content and adds after it", () => {
  const doc = new Doc();
  insertInto(doc, "# Existing\n\nWritten by the operator.\n", "replace");
  const out = insertInto(doc, "## Added by the agent\n\nNew findings.\n", "append");

  assert.match(out, /# Existing/, "append destroyed pre-existing content");
  assert.match(out, /Written by the operator\./, "append destroyed pre-existing content");
  assert.match(out, /## Added by the agent/);
  assert.ok(
    out.indexOf("Existing") < out.indexOf("Added by the agent"),
    "appended content should come after what was already there"
  );
  doc.destroy();
});

test("replace leaves only the new content", () => {
  const doc = new Doc();
  insertInto(doc, "# Old\n\nStale notes.\n", "replace");
  const out = insertInto(doc, "# New\n\nFresh notes.\n", "replace");

  assert.doesNotMatch(out, /Stale notes/, "replace left the old content behind");
  assert.match(out, /Fresh notes/);
  doc.destroy();
});

test("empty markdown appends nothing rather than throwing", () => {
  const doc = new Doc();
  insertInto(doc, "# Kept\n", "replace");
  const out = insertInto(doc, "", "append");
  assert.match(out, /# Kept/);
  doc.destroy();
});
