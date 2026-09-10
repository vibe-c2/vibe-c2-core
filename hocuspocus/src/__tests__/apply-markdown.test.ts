import { test } from "node:test";
import assert from "node:assert/strict";
import { Doc } from "yjs";
import { __testing } from "../apply-markdown.js";
import { Y_FRAGMENT_FIELD } from "../markdown-to-yjs.js";
import { yjsUpdateToMarkdown } from "../yjs-to-markdown.js";
import { encodeStateAsUpdate } from "yjs";

const { markdownToDetachedNodes, markdownToDetachedBlocks, spliceFragment } = __testing;

// Y.js types cannot be moved between documents, so an agent's edit has to be
// deep-copied out of a scratch doc before it can be inserted into the live
// one. Copying by hand is where formatting quietly gets lost, so the copy is
// asserted through a full round-trip rather than by inspecting nodes.
function insertInto(doc: Doc, markdown: string, mode: "replace" | "append"): string {
  const fragment = doc.getXmlFragment(Y_FRAGMENT_FIELD);
  const blocks = markdownToDetachedBlocks(markdown);
  doc.transact(() => {
    // Same branch the endpoint takes, so these tests exercise the real write
    // path rather than a second copy of it that can drift.
    if (mode === "append") {
      if (blocks.length > 0) {
        fragment.insert(fragment.length, blocks.map((b) => b.node));
      }
      return;
    }
    spliceFragment(fragment, blocks);
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

// Replacing used to delete every block and re-insert it. For a collaborator
// typing in the same page that is destructive — their cursor sits in a block
// that no longer exists — and it puts the whole document on the wire for a
// one-word fix. Untouched blocks must survive as the same Y.js items.
test("replace leaves untouched blocks alone", () => {
  const doc = new Doc();
  const fragment = doc.getXmlFragment(Y_FRAGMENT_FIELD);

  insertInto(doc, "# Title\n\nfirst\n\nsecond\n\nthird\n", "replace");
  const before = fragment.toArray();
  const untouchedFirst = before[0];
  const untouchedLast = before[before.length - 1];

  insertInto(doc, "# Title\n\nfirst\n\nCHANGED\n\nthird\n", "replace");
  const after = fragment.toArray();

  assert.equal(after.length, before.length);
  assert.equal(after[0], untouchedFirst, "leading block was recreated");
  assert.equal(after[after.length - 1], untouchedLast, "trailing block was recreated");
  assert.notEqual(after[2], before[2], "the changed block should be a new node");

  const markdown = yjsUpdateToMarkdown(encodeStateAsUpdate(doc));
  assert.match(markdown, /CHANGED/);
  assert.ok(!markdown.includes("second"), `old text survived: ${markdown}`);
  doc.destroy();
});

test("replace with identical content changes nothing", () => {
  const doc = new Doc();
  const fragment = doc.getXmlFragment(Y_FRAGMENT_FIELD);
  const md = "# Title\n\nfirst\n\nsecond\n";

  insertInto(doc, md, "replace");
  const before = fragment.toArray();

  insertInto(doc, md, "replace");
  const after = fragment.toArray();

  assert.deepEqual(after, before, "a no-op edit rewrote the document");
  doc.destroy();
});

test("replace handles growing and shrinking documents", () => {
  const doc = new Doc();
  insertInto(doc, "a\n\nb\n", "replace");

  let out = insertInto(doc, "a\n\nb\n\nc\n", "replace");
  assert.match(out, /a\n\na?b?/);
  assert.ok(out.includes("c"), `grew wrongly: ${out}`);

  out = insertInto(doc, "a\n", "replace");
  assert.ok(!out.includes("b"), `shrank wrongly: ${out}`);
  assert.ok(!out.includes("c"), `shrank wrongly: ${out}`);
  assert.match(out, /a/);
  doc.destroy();
});

test("replace can empty a document", () => {
  const doc = new Doc();
  insertInto(doc, "something\n", "replace");
  const out = insertInto(doc, "", "replace");
  assert.equal(out.trim(), "");
  doc.destroy();
});
