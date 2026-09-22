import { test } from "node:test";
import assert from "node:assert/strict";
import { Doc, encodeStateAsUpdate } from "yjs";
import { __testing } from "../apply-markdown.js";
import { Y_FRAGMENT_FIELD } from "../markdown-to-yjs.js";
import { yjsUpdateToMarkdown } from "../yjs-to-markdown.js";

const { markdownToDetachedBlocks, editFragment, nodeKey } = __testing;

// A document as the BROWSER would have written it: the SPA's codeBlock carries
// a client-generated `blockId` that this schema does not declare, so it is a
// faithful stand-in for any attribute the server cannot see.
function docWithBrowserBlockIds(markdown: string): Doc {
  const doc = new Doc();
  const fragment = doc.getXmlFragment(Y_FRAGMENT_FIELD);
  doc.transact(() => {
    fragment.insert(0, markdownToDetachedBlocks(markdown).map((b) => b.node));
    for (const node of fragment.toArray()) {
      if (typeof node === "object" && "nodeName" in node && node.nodeName === "codeBlock") {
        node.setAttribute("blockId", crypto.randomUUID());
      }
    }
  });
  return doc;
}

function fragmentOf(doc: Doc) {
  return doc.getXmlFragment(Y_FRAGMENT_FIELD);
}

// The bug: keys were `String(node)`, so a client-only attribute made a block
// compare unequal to its own re-parsed self. The prefix scan then stopped at
// the first code block and the suffix scan at the last, and every block between
// them was deleted and re-inserted — which on the client replaces the DOM and
// throws the reader's scroll position away.
test("a client-only attribute does not make a block look changed", () => {
  const markdown = "```go\nfmt.Println(1)\n```\n";
  const doc = docWithBrowserBlockIds(markdown);
  const existing = fragmentOf(doc).toArray()[0];
  const incoming = markdownToDetachedBlocks(markdown)[0];

  assert.equal(
    nodeKey(existing),
    incoming.key,
    "a code block with a blockId must match its own re-parsed form",
  );
  // And the old key really did differ, so this test is guarding a live
  // regression rather than restating something that was always true.
  assert.notEqual(
    String(existing),
    String(incoming.node),
    "raw serialization should still disagree — that was the bug",
  );
  doc.destroy();
});

test("an edit below a code block leaves the code block's node identity intact", () => {
  const doc = docWithBrowserBlockIds(
    "# Findings\n\n```go\nfmt.Println(1)\n```\n\nThe host is unpatched.\n",
  );
  const fragment = fragmentOf(doc);
  const codeBefore = fragment.toArray()[1];
  const headingBefore = fragment.toArray()[0];

  doc.transact(() => {
    editFragment(fragment, "The host is unpatched.", "The host is patched.", false);
  });

  const after = fragment.toArray();
  assert.equal(after[0], headingBefore, "the heading was rewritten");
  assert.equal(after[1], codeBefore, "the code block was rewritten");
  assert.equal(
    (codeBefore as { getAttribute(name: string): unknown }).getAttribute("blockId") !== null,
    true,
    "the code block lost the id its collapse state is keyed on",
  );
  doc.destroy();
});

// The shape that made this so visible: code near the top AND the bottom meant
// the rewritten span covered everything in between.
test("an edit between two code blocks rewrites only the edited block", () => {
  const doc = docWithBrowserBlockIds(
    "```sh\nnmap -sV\n```\n\nNothing found yet.\n\nSome notes.\n\n```go\nfmt.Println(2)\n```\n",
  );
  const fragment = fragmentOf(doc);
  const before = fragment.toArray();

  doc.transact(() => {
    editFragment(fragment, "Nothing found yet.", "Two hosts found.", false);
  });

  const after = fragment.toArray();
  assert.equal(after.length, before.length);
  assert.equal(after[0], before[0], "the leading code block was rewritten");
  assert.notEqual(after[1], before[1], "the edited paragraph should have been replaced");
  assert.equal(after[2], before[2], "an untouched paragraph was rewritten");
  assert.equal(after[3], before[3], "the trailing code block was rewritten");
  doc.destroy();
});

// The filter must not go so far that real changes stop counting.
test("a change the schema does know about still counts as a change", () => {
  const a = markdownToDetachedBlocks("```go\nfmt.Println(1)\n```\n")[0];
  const b = markdownToDetachedBlocks("```go\nfmt.Println(2)\n```\n")[0];
  assert.notEqual(a.key, b.key, "different code bodies must not share a key");

  const go = markdownToDetachedBlocks("```go\nx\n```\n")[0];
  const sh = markdownToDetachedBlocks("```sh\nx\n```\n")[0];
  assert.notEqual(go.key, sh.key, "language is a declared attribute and must count");
});

test("inline marks still count as a change", () => {
  const plain = markdownToDetachedBlocks("the host is down\n")[0];
  const bold = markdownToDetachedBlocks("the host is **down**\n")[0];
  assert.notEqual(plain.key, bold.key, "bold must not be treated as cosmetic");
});

// End to end through the same path the endpoint uses, so the markdown result is
// asserted alongside the node identities.
test("the edit still produces the right markdown", () => {
  const doc = docWithBrowserBlockIds("```go\nfmt.Println(1)\n```\n\nunknown\n");
  const fragment = fragmentOf(doc);
  doc.transact(() => {
    editFragment(fragment, "unknown", "Windows Server 2019", false);
  });
  const markdown = yjsUpdateToMarkdown(encodeStateAsUpdate(doc));
  assert.match(markdown, /Windows Server 2019/);
  assert.match(markdown, /fmt\.Println\(1\)/);
  doc.destroy();
});
