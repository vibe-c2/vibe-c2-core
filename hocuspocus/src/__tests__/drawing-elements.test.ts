import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DrawingElementError,
  normalizeElement,
  normalizeElements,
} from "../drawing-elements.js";

// The point of the normalizer: an agent composing a diagram should send
// geometry and words, not Excalidraw's twenty-five fields of bookkeeping.
test("a shape needs only its type", () => {
  const el = normalizeElement({ type: "rectangle" });

  assert.equal(el.type, "rectangle");
  assert.ok(el.id);
  assert.equal(el.isDeleted, false);
  assert.equal(el.strokeColor, "#1e1e1e");
  assert.equal(el.opacity, 100);
  assert.deepEqual(el.groupIds, []);
});

test("supplied fields win over the defaults", () => {
  const el = normalizeElement({
    type: "ellipse",
    id: "chosen",
    x: 40,
    y: 60,
    width: 200,
    height: 120,
    strokeColor: "#c92a2a",
  });

  assert.equal(el.id, "chosen");
  assert.equal(el.x, 40);
  assert.equal(el.width, 200);
  assert.equal(el.strokeColor, "#c92a2a");
});

// Excalidraw derives a shape's hand-drawn jitter from its seed. A constant
// would make every rectangle an agent drew wobble identically — visibly
// machine-made, in a tool whose whole look is that it is not.
test("seeds differ between two identical shapes", () => {
  const a = normalizeElement({ type: "rectangle" });
  const b = normalizeElement({ type: "rectangle" });

  assert.notEqual(a.seed, b.seed);
  assert.notEqual(a.id, b.id);
});

test("an unknown type is refused, and the message lists what works", () => {
  assert.throws(
    () => normalizeElement({ type: "hexagon" }),
    (err: unknown) =>
      err instanceof DrawingElementError && /rectangle/.test(err.message),
  );
});

test("a non-finite coordinate is refused rather than drawn", () => {
  assert.throws(
    () => normalizeElement({ type: "rectangle", x: Number.NaN }),
    DrawingElementError,
  );
  assert.throws(
    () => normalizeElement({ type: "rectangle", y: "120" }),
    DrawingElementError,
  );
});

test("text carries its words through, and mirrors originalText", () => {
  const el = normalizeElement({ type: "text", text: "Domain Controller" });

  assert.equal(el.text, "Domain Controller");
  // Excalidraw re-wraps a bound label from originalText when its container is
  // resized. Diverging here makes a label silently revert to other words the
  // first time somebody drags its box.
  assert.equal(el.originalText, "Domain Controller");
  assert.equal(el.fontSize, 20);
});

test("a text element with no text is refused", () => {
  assert.throws(() => normalizeElement({ type: "text" }), DrawingElementError);
  assert.throws(
    () => normalizeElement({ type: "text", text: "" }),
    DrawingElementError,
  );
});

// An arrow is drawn from its points, not its box: with none it renders as
// nothing at all, which looks like the write having silently failed.
test("an arrow given only geometry still gets points", () => {
  const el = normalizeElement({ type: "arrow", width: 160, height: 0 });

  assert.deepEqual(el.points, [
    [0, 0],
    [160, 0],
  ]);
  assert.equal(el.endArrowhead, "arrow");
});

test("a line gets points but no arrowhead", () => {
  const el = normalizeElement({ type: "line", width: 80, height: 20 });

  assert.deepEqual(el.points, [
    [0, 0],
    [80, 20],
  ]);
  assert.equal(el.endArrowhead, null);
});

test("explicit points are left alone", () => {
  const points = [
    [0, 0],
    [10, 10],
    [40, 0],
  ];
  const el = normalizeElement({ type: "arrow", points });
  assert.deepEqual(el.points, points);
});

// An agent told only "invalid element" has to bisect its own payload to find
// out which one.
test("a batch failure names the offending entry", () => {
  assert.throws(
    () =>
      normalizeElements([
        { type: "rectangle" },
        { type: "rectangle" },
        { type: "trapezoid" },
      ]),
    (err: unknown) =>
      err instanceof DrawingElementError && err.message.startsWith("element 2:"),
  );
});

test("elements must be an array", () => {
  assert.throws(
    () => normalizeElements({ type: "rectangle" }),
    DrawingElementError,
  );
});
