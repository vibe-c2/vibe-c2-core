// Unit tests for collectChecklistCoverage — the projection that drives
// WikiDocument.checklistRequired / .checklistAnswered. Run via `npm test`.
// The function is pure; we build Y.XmlElement trees by hand (as the sibling
// references tests do) so the tests focus on the counting/derivation rules.

import test from "node:test";
import assert from "node:assert/strict";
import { Doc } from "yjs";
import * as Y from "yjs";
import { collectChecklistCoverage } from "../references.js";

// A live Doc is required for setAttribute / child inserts to persist.
function withDoc(build: (frag: Y.XmlFragment) => void): Y.XmlFragment {
  const doc = new Doc();
  const frag = doc.getXmlFragment("default");
  build(frag);
  return frag;
}

// Build a wikiChecklistItem. `answer` children populate the answer region.
function item(
  attrs: { required?: boolean | string; state?: string },
  ...answer: Y.XmlElement[]
): Y.XmlElement {
  const el = new Y.XmlElement("wikiChecklistItem");
  if (attrs.required !== undefined) {
    el.setAttribute("required", attrs.required as string);
  }
  if (attrs.state !== undefined) el.setAttribute("state", attrs.state);
  if (answer.length > 0) el.insert(0, answer);
  return el;
}

// An (empty or filled) paragraph for the answer region.
function para(text?: string): Y.XmlElement {
  const el = new Y.XmlElement("paragraph");
  if (text !== undefined) {
    const t = new Y.XmlText();
    t.insert(0, text);
    el.insert(0, [t as unknown as Y.XmlElement]);
  }
  return el;
}

function hostChip(hostId: string): Y.XmlElement {
  const el = new Y.XmlElement("wikiHostReference");
  el.setAttribute("hostId", hostId);
  return el;
}

const UID = "11111111-1111-1111-1111-111111111111";

test("empty document has zero coverage", () => {
  const frag = withDoc(() => {});
  assert.deepEqual(collectChecklistCoverage(frag), {
    total: 0,
    required: 0,
    answered: 0,
  });
});

test("document with no checklist items is a no-op", () => {
  const frag = withDoc((f) => {
    f.insert(0, [para("just prose"), para("more prose")]);
  });
  assert.deepEqual(collectChecklistCoverage(frag), {
    total: 0,
    required: 0,
    answered: 0,
  });
});

test("every item counts toward total; required is just a subset", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      item({ required: true }, para("answered")),
      item({ required: false }, para("answered too")),
      item({}, para("answered, no required attr")),
    ]);
  });
  // All three items count toward total and (being answered) toward answered;
  // only the first is required.
  assert.deepEqual(collectChecklistCoverage(frag), {
    total: 3,
    required: 1,
    answered: 3,
  });
});

test("empty answer region reads as unanswered", () => {
  const frag = withDoc((f) => {
    f.insert(0, [item({ required: true }, para())]);
  });
  assert.deepEqual(collectChecklistCoverage(frag), {
    total: 1,
    required: 1,
    answered: 0,
  });
});

test("whitespace-only answer reads as unanswered", () => {
  const frag = withDoc((f) => {
    f.insert(0, [item({ required: true }, para("   \n  "))]);
  });
  assert.deepEqual(collectChecklistCoverage(frag), {
    total: 1,
    required: 1,
    answered: 0,
  });
});

test("non-whitespace text answer counts as answered", () => {
  const frag = withDoc((f) => {
    f.insert(0, [item({ required: true }, para("10.0.0.0/24 via eth0"))]);
  });
  assert.deepEqual(collectChecklistCoverage(frag), {
    total: 1,
    required: 1,
    answered: 1,
  });
});

test("an optional item with a text answer counts as answered", () => {
  const frag = withDoc((f) => {
    f.insert(0, [item({ required: false }, para("answered but optional"))]);
  });
  assert.deepEqual(collectChecklistCoverage(frag), {
    total: 1,
    required: 0,
    answered: 1,
  });
});

test("a reference chip with no prose counts as answered", () => {
  const frag = withDoc((f) => {
    // ref:host answer: an empty paragraph plus a host chip.
    f.insert(0, [item({ required: true }, para(), hostChip(UID))]);
  });
  assert.deepEqual(collectChecklistCoverage(frag), {
    total: 1,
    required: 1,
    answered: 1,
  });
});

test("explicit not_applicable counts as answered", () => {
  const frag = withDoc((f) => {
    f.insert(0, [item({ required: true, state: "not_applicable" }, para())]);
  });
  assert.deepEqual(collectChecklistCoverage(frag), {
    total: 1,
    required: 1,
    answered: 1,
  });
});

test("explicit flagged does NOT count as answered, even with content", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      item({ required: true, state: "flagged" }, para("has text but flagged")),
    ]);
  });
  assert.deepEqual(collectChecklistCoverage(frag), {
    total: 1,
    required: 1,
    answered: 0,
  });
});

test("required attr accepts the string 'true' (HTML round-trip)", () => {
  const frag = withDoc((f) => {
    f.insert(0, [item({ required: "true" }, para("answered"))]);
  });
  assert.deepEqual(collectChecklistCoverage(frag), {
    total: 1,
    required: 1,
    answered: 1,
  });
});

test("mixed document tallies correctly", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      para("intro prose"),
      item({ required: true }, para("answered")), // t+1 r+1 a+1
      item({ required: true }, para()), // t+1 r+1 a+0
      item({ required: true, state: "not_applicable" }, para()), // t+1 r+1 a+1
      item({ required: true, state: "flagged" }, para("x")), // t+1 r+1 a+0
      item({ required: false }, para("optional answered")), // t+1 r+0 a+1
      item({ required: true }, hostChip(UID)), // t+1 r+1 a+1
    ]);
  });
  assert.deepEqual(collectChecklistCoverage(frag), {
    total: 6,
    required: 5,
    answered: 4,
  });
});

test("items nested under other blocks are still found", () => {
  const frag = withDoc((f) => {
    const wrapper = new Y.XmlElement("blockquote");
    wrapper.insert(0, [item({ required: true }, para("answered"))]);
    f.insert(0, [wrapper]);
  });
  assert.deepEqual(collectChecklistCoverage(frag), {
    total: 1,
    required: 1,
    answered: 1,
  });
});
