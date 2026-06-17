// Unit tests for projectionShrinks — the predicate behind the stale-client
// write guard. When a tab whose editor schema is older than the doc's stored
// schema emits an update that *drops* content (the y-prosemirror prune of
// unknown node types, e.g. checklist items), store() must discard it. This
// predicate decides "did the derived projection lose content vs what's stored".
// The canonical regression it locks down: a doc with 12 checklist items whose
// stale-client save derives 0 items must register as a shrink. Run `npm test`.

import test from "node:test";
import assert from "node:assert/strict";
import { Binary } from "mongodb";

import { projectionShrinks, type DerivedProjection } from "../persistence.js";

function bin(hex: string): Binary {
  return new Binary(Buffer.from(hex, "hex"), Binary.SUBTYPE_DEFAULT);
}

const ID_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ID_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function derived(overrides: Partial<DerivedProjection> = {}): DerivedProjection {
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

test("brand-new document (no existing row) can never shrink", () => {
  assert.equal(projectionShrinks(null, derived()), false);
  assert.equal(projectionShrinks(undefined, derived()), false);
});

test("identical projection is not a shrink", () => {
  const existing = {
    content: "hello world",
    checklist_total: 0,
    checklist_required: 0,
    checklist_answered: 0,
  };
  assert.equal(projectionShrinks(existing, derived()), false);
});

test("growth (more content) is not a shrink", () => {
  const existing = { content: "hi", checklist_total: 1 };
  const next = derived({ content: "hello world", checklist_total: 3 });
  assert.equal(projectionShrinks(existing, next), false);
});

test("CANONICAL: checklist items dropped to zero is a shrink", () => {
  const existing = {
    content: "hello world",
    checklist_total: 12,
    checklist_required: 5,
    checklist_answered: 3,
  };
  assert.equal(projectionShrinks(existing, derived()), true);
});

test("shorter plain-text content is a shrink", () => {
  const existing = { content: "a much longer body of text" };
  assert.equal(projectionShrinks(existing, derived({ content: "short" })), true);
});

test("losing a reference is a shrink", () => {
  const existing = { content: "hello world", references: [bin(ID_A), bin(ID_B)] };
  const next = derived({ content: "hello world", references: [bin(ID_A)] });
  assert.equal(projectionShrinks(existing, next), true);
});

test("losing any attachment/credential/hash/host index is a shrink", () => {
  for (const key of [
    "credential_references",
    "hash_references",
    "host_references",
    "image_references",
    "file_references",
  ] as const) {
    const existing = { content: "hello world", [key]: [bin(ID_A)] };
    assert.equal(projectionShrinks(existing, derived()), true, key);
  }
});

test("absent stored fields coalesce to defaults — no false positive", () => {
  // Legacy doc with only `content` persisted: every other dimension is absent.
  // A derived projection at the same content with empty refs/zero counts must
  // not register as a shrink (undefined must fold to 0 / empty, not to a loss).
  const existing = { content: "hello world" };
  assert.equal(projectionShrinks(existing, derived()), false);
});

test("required/answered drop alone (total unchanged) is a shrink", () => {
  const existing = {
    content: "hello world",
    checklist_total: 4,
    checklist_required: 4,
    checklist_answered: 2,
  };
  const next = derived({
    checklist_total: 4,
    checklist_required: 1,
    checklist_answered: 2,
  });
  assert.equal(projectionShrinks(existing, next), true);
});
