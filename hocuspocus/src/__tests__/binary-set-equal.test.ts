// Unit tests for binarySetEqual — the order-insensitive reference-set
// comparison that powers the "did this document meaningfully change?" guard in
// store(). The guard is what stops an open-time normalization (which rewrites
// content_state but leaves the visible doc identical) from re-attributing the
// document to whoever just opened it. Run via `npm test`.

import test from "node:test";
import assert from "node:assert/strict";
import { Binary } from "mongodb";

function bin(hex: string): Binary {
  return new Binary(Buffer.from(hex, "hex"), Binary.SUBTYPE_DEFAULT);
}

// Re-import after build alias resolution. The function is pure.
import { binarySetEqual } from "../persistence.js";

const A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const C = "cccccccccccccccccccccccccccccccc";

test("empty stored field equals empty derived set", () => {
  assert.equal(binarySetEqual(undefined, []), true);
  assert.equal(binarySetEqual(null, []), true);
  assert.equal(binarySetEqual([], []), true);
});

test("missing field is not equal to a non-empty set", () => {
  assert.equal(binarySetEqual(undefined, [bin(A)]), false);
});

test("identical single-element sets compare equal", () => {
  assert.equal(binarySetEqual([bin(A)], [bin(A)]), true);
});

test("order does not matter", () => {
  assert.equal(
    binarySetEqual([bin(A), bin(B), bin(C)], [bin(C), bin(A), bin(B)]),
    true,
  );
});

test("different length is not equal", () => {
  assert.equal(binarySetEqual([bin(A), bin(B)], [bin(A)]), false);
});

test("same length, different members is not equal", () => {
  assert.equal(binarySetEqual([bin(A), bin(B)], [bin(A), bin(C)]), false);
});

test("non-array stored value is treated as empty", () => {
  assert.equal(binarySetEqual("garbage", []), true);
  assert.equal(binarySetEqual("garbage", [bin(A)]), false);
});
