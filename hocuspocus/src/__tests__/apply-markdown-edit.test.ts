import { test } from "node:test";
import assert from "node:assert/strict";
import { Doc, encodeStateAsUpdate } from "yjs";
import { __testing } from "../apply-markdown.js";
import { Y_FRAGMENT_FIELD } from "../markdown-to-yjs.js";
import { yjsUpdateToMarkdown } from "../yjs-to-markdown.js";

const { markdownToDetachedBlocks, editFragment, diagnoseNoMatch, countOccurrences } = __testing;

// The edit path matches against markdown rendered from the LIVE fragment and
// splices only the blocks that changed. These tests drive editFragment the
// same way the endpoint does, inside a transaction on a real Y.Doc.
function docWith(markdown: string): Doc {
  const doc = new Doc();
  const fragment = doc.getXmlFragment(Y_FRAGMENT_FIELD);
  doc.transact(() => {
    fragment.insert(0, markdownToDetachedBlocks(markdown).map((b) => b.node));
  });
  return doc;
}

function edit(doc: Doc, oldText: string, newText: string, replaceAll = false) {
  const fragment = doc.getXmlFragment(Y_FRAGMENT_FIELD);
  let outcome!: ReturnType<typeof editFragment>;
  doc.transact(() => {
    outcome = editFragment(fragment, oldText, newText, replaceAll);
  });
  return { outcome, markdown: yjsUpdateToMarkdown(encodeStateAsUpdate(doc)) };
}

test("edit replaces one exact snippet and leaves the rest alone", () => {
  const doc = docWith("# Hosts\n\n| dc-01 | unknown |\n\nSome **bold** notes.\n");
  const { outcome, markdown } = edit(doc, "| dc-01 | unknown |", "| dc-01 | Windows Server 2019 |");
  assert.equal(outcome.matches, 1);
  assert.equal(outcome.replacements, 1);
  assert.match(markdown, /Windows Server 2019/);
  assert.doesNotMatch(markdown, /unknown/);
  assert.match(markdown, /\*\*bold\*\*/, "an untouched block lost its formatting");
  doc.destroy();
});

test("edit refuses an ambiguous snippet with the count", () => {
  const doc = docWith("alpha\n\nbeta\n\nalpha\n");
  const { outcome, markdown } = edit(doc, "alpha", "gamma");
  assert.equal(outcome.matches, 2);
  assert.equal(outcome.replacements, 0);
  assert.doesNotMatch(markdown, /gamma/, "an ambiguous edit must change nothing");
  doc.destroy();
});

test("edit with replaceAll changes every occurrence", () => {
  const doc = docWith("alpha\n\nbeta\n\nalpha\n");
  const { outcome, markdown } = edit(doc, "alpha", "gamma", true);
  assert.equal(outcome.replacements, 2);
  assert.equal(countOccurrences(markdown, "gamma"), 2);
  doc.destroy();
});

test("edit keeps replacement patterns literal", () => {
  const doc = docWith("price: X\n");
  const { markdown } = edit(doc, "X", "$& and $1");
  assert.match(markdown, /\$& and \$1/);
  doc.destroy();
});

test("edit reports a miss with a diagnosis and changes nothing", () => {
  const doc = docWith("| dc-01  |  Windows |\n");
  const { outcome, markdown } = edit(doc, "| dc-01 | Windows |", "x");
  assert.equal(outcome.matches, 0);
  assert.match(outcome.diagnosis ?? "", /whitespace/);
  assert.match(markdown, /dc-01/);
  doc.destroy();
});

test("edit touches only the changed block", () => {
  const doc = docWith("one\n\ntwo\n\nthree\n");
  const fragment = doc.getXmlFragment(Y_FRAGMENT_FIELD);
  const before = fragment.toArray();
  edit(doc, "two", "TWO");
  const after = fragment.toArray();
  assert.equal(after[0], before[0], "the first block was recreated");
  assert.equal(after[2], before[2], "the last block was recreated");
  assert.notEqual(after[1], before[1]);
  doc.destroy();
});

test("countOccurrences is non-overlapping like Go's strings.Count", () => {
  assert.equal(countOccurrences("aaa", "aa"), 1);
  assert.equal(countOccurrences("abab", "ab"), 2);
  assert.equal(countOccurrences("abc", ""), 0);
});

// Ported from the Go diagnostics this replaced; the messages are what the
// agent reads, so the cases stay.
test("diagnoseNoMatch names the likeliest cause", () => {
  const cases: [string, string, RegExp][] = [
    ["", "anything", /empty/],
    ["| dc-01  |  Windows |", "| dc-01 | Windows |", /whitespace/],
    ["The Domain Controller is dc-01.", "the domain controller is dc-01.", /capitalisation/],
    ["## Hosts\n\nreal content here\n", "## Hosts\n\ninvented content\n", /first line/],
    ["completely unrelated text", "not here at all", /wrong one/],
  ];
  for (const [body, oldText, want] of cases) {
    assert.match(diagnoseNoMatch(body, oldText), want, `${JSON.stringify(oldText)}`);
  }
  const both = diagnoseNoMatch("The  Domain Controller", "the domain controller");
  assert.match(both, /whitespace/);
  assert.match(both, /capitalisation/);
  assert.match(diagnoseNoMatch("The  Domain", "The Domain"), /whitespace/);
  assert.match(diagnoseNoMatch("The Domain", "the domain"), /capitalisation/);
});
