// Unit tests for isMeaningfulChange — the guard that decides whether a store()
// is a real human edit (re-attribute, bump updateAt, fire webhook) or a no-op
// write triggered purely by *opening* a stale document. The regression these
// lock down: a document created before a field existed (checklist counts landed
// in 405205a; the attachment indexes later) has no such key in Mongo, so a naive
// `existing.checklist_total !== 0` reads `undefined !== 0` → true and falsely
// re-attributes every stale doc to whoever opens it first. Run via `npm test`.

import test from "node:test";
import assert from "node:assert/strict";
import { Binary } from "mongodb";

import { isMeaningfulChange, type DerivedProjection } from "../persistence.js";

function bin(hex: string): Binary {
  return new Binary(Buffer.from(hex, "hex"), Binary.SUBTYPE_DEFAULT);
}

const ID = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

// A doc that contains no references and no checklist — the most common shape.
function emptyDerived(
  overrides: Partial<DerivedProjection> = {},
): DerivedProjection {
  return {
    content: "hello world",
    references: [],
    credential_references: [],
    hash_references: [],
    host_references: [],
    image_references: [],
    file_references: [],
    checklist_total: 0,
    checklist_required: 0,
    checklist_answered: 0,
    ...overrides,
  };
}

test("brand-new document (no existing row) is always a change", () => {
  assert.equal(isMeaningfulChange(null, emptyDerived()), true);
  assert.equal(isMeaningfulChange(undefined, emptyDerived()), true);
});

test("opening a pre-checklist doc does not count as a change", () => {
  // The regression: a stale row has no checklist_* keys at all. Opening it
  // derives 0/0/0, which must compare equal to the absent fields — not flag the
  // opener as the editor.
  const stale = { content: "hello world" }; // no checklist_*, no reference arrays
  assert.equal(isMeaningfulChange(stale, emptyDerived()), false);
});

test("opening a pre-attachment-index doc with no attachments is not a change", () => {
  // image_references / file_references / host_references were added later; a doc
  // with none of those chips has the fields absent and the derived sets empty.
  const stale = {
    content: "hello world",
    references: [],
    checklist_total: 0,
    checklist_required: 0,
    checklist_answered: 0,
  };
  assert.equal(isMeaningfulChange(stale, emptyDerived()), false);
});

test("missing content field compares equal to empty derived content", () => {
  const stale = {}; // truly bare row
  assert.equal(isMeaningfulChange(stale, emptyDerived({ content: "" })), false);
});

test("identical fully-populated row is not a change", () => {
  const derived = emptyDerived({
    content: "body",
    references: [bin(ID)],
    checklist_total: 3,
    checklist_required: 1,
    checklist_answered: 2,
  });
  const existing = {
    content: "body",
    references: [bin(ID)],
    credential_references: [],
    hash_references: [],
    host_references: [],
    image_references: [],
    file_references: [],
    checklist_total: 3,
    checklist_required: 1,
    checklist_answered: 2,
  };
  assert.equal(isMeaningfulChange(existing, derived), false);
});

test("a real content edit is a change", () => {
  const existing = { content: "old text", checklist_total: 0 };
  assert.equal(
    isMeaningfulChange(existing, emptyDerived({ content: "new text" })),
    true,
  );
});

test("answering a checklist item is a change", () => {
  const existing = {
    content: "body",
    checklist_total: 2,
    checklist_required: 1,
    checklist_answered: 0,
  };
  const derived = emptyDerived({
    content: "body",
    checklist_total: 2,
    checklist_required: 1,
    checklist_answered: 1,
  });
  assert.equal(isMeaningfulChange(existing, derived), true);
});

test("adding the first reference chip is a change", () => {
  const existing = { content: "body" }; // no references key yet
  assert.equal(
    isMeaningfulChange(existing, emptyDerived({ references: [bin(ID)] })),
    true,
  );
});

test("non-zero stored count vs zero derived (item removed) is a change", () => {
  const existing = { content: "body", checklist_total: 1 };
  assert.equal(isMeaningfulChange(existing, emptyDerived()), true);
});
