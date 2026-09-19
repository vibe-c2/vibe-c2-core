import { test } from "node:test";
import assert from "node:assert/strict";

import { compareElements, inPaintOrder, layerOf } from "../drawing-order.js";

test("layer defaults to 0, which is where hand-drawn shapes sit", () => {
  assert.equal(layerOf({ id: "a" }), 0);
  assert.equal(layerOf({ id: "a", z: 3 }), 3);
  // Anything that is not a real number is not a layer.
  assert.equal(layerOf({ id: "a", z: "2" }), 0);
  assert.equal(layerOf({ id: "a", z: Number.NaN }), 0);
});

test("layer wins over everything else", () => {
  const order = inPaintOrder([
    { id: "front", z: 2 },
    { id: "back", z: -1 },
    { id: "middle" },
  ]);
  assert.deepEqual(order.map((e) => e.id), ["back", "middle", "front"]);
});

// Shapes a person drew carry Excalidraw's fractional index and no z. Ignoring
// it is why their arrangement never survived a reload.
test("within a layer, Excalidraw's fractional index decides", () => {
  const order = inPaintOrder([
    { id: "c", index: "a3" },
    { id: "a", index: "a1" },
    { id: "b", index: "a2" },
  ]);
  assert.deepEqual(order.map((e) => e.id), ["a", "b", "c"]);
});

test("an element with no index sits behind one that has it", () => {
  const order = inPaintOrder([{ id: "drawn", index: "a1" }, { id: "written" }]);
  assert.deepEqual(order.map((e) => e.id), ["written", "drawn"]);
});

// Two elements that tie on layer and index still have to land somewhere, and
// it must be the same somewhere on every client.
test("the sort is total", () => {
  const order = inPaintOrder([{ id: "b" }, { id: "a" }, { id: "c" }]);
  assert.deepEqual(order.map((e) => e.id), ["a", "b", "c"]);
  assert.equal(compareElements({ id: "a" }, { id: "a" }), 0);
});

// The bug: the same elements arriving in any order must paint identically,
// because a Y.Map iterates by CRDT structure and two peers disagree.
test("input order never changes the result", () => {
  const els = [
    { id: "box", index: "a1" },
    { id: "arrow", z: -1 },
    { id: "note", z: 5 },
    { id: "label", index: "a2" },
  ];
  const forwards = inPaintOrder(els).map((e) => e.id);
  const backwards = inPaintOrder([...els].reverse()).map((e) => e.id);
  assert.deepEqual(forwards, backwards);
  assert.deepEqual(forwards, ["arrow", "box", "label", "note"]);
});
