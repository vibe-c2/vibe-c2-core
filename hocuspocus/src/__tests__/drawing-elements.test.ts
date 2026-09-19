import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DrawingElementError,
  normalizeElement,
  normalizeElements,
  normalizePatches,
  measureText,
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

// A labelled box is two elements the way Excalidraw models it, and the pair
// only holds together if the shape lists the text back. Half-wiring it looks
// correct until somebody drags the box and the words stay behind — which is
// bookkeeping, not composition, so the caller should not have to do it.
test("label expands into a bound text element, wired both ways", () => {
  const [box, label] = normalizeElements([
    { type: "rectangle", id: "p1", x: 80, y: 160, width: 200, height: 90, label: "Scoping" },
  ]);

  assert.equal(box.type, "rectangle");
  assert.equal(label.type, "text");
  assert.equal(label.text, "Scoping");
  // The text points at its container...
  assert.equal(label.containerId, "p1");
  // ...and the container points back.
  assert.deepEqual(box.boundElements, [{ id: label.id, type: "text" }]);
});

test("label is centred in its container", () => {
  const [, label] = normalizeElements([
    { type: "rectangle", id: "p1", width: 200, height: 90, label: "x" },
  ]);
  assert.equal(label.textAlign, "center");
  assert.equal(label.verticalAlign, "middle");
});

test("label on a text element is refused rather than silently ignored", () => {
  assert.throws(
    () => normalizeElements([{ type: "text", text: "a", label: "b" }]),
    (err: unknown) => err instanceof DrawingElementError && /`text`/.test(err.message),
  );
});

test("a shape without a label is still one element", () => {
  assert.equal(normalizeElements([{ type: "rectangle" }]).length, 1);
});

// Excalidraw recomputes focus and gap the moment anything moves, so asking a
// caller to invent them is asking for numbers that are wrong on arrival.
test("an arrow binds to a shape by bare id", () => {
  const el = normalizeElement({ type: "arrow", startBinding: "p1", endBinding: "p2" });

  assert.deepEqual(el.startBinding, { elementId: "p1", focus: 0, gap: 4 });
  assert.deepEqual(el.endBinding, { elementId: "p2", focus: 0, gap: 4 });
});

test("an explicit binding object keeps the focus and gap it was given", () => {
  const el = normalizeElement({
    type: "arrow",
    startBinding: { elementId: "p1", focus: 0.5, gap: 12 },
  });
  assert.deepEqual(el.startBinding, { elementId: "p1", focus: 0.5, gap: 12 });
});

test("an unbound arrow stays unbound", () => {
  const el = normalizeElement({ type: "arrow" });
  assert.equal(el.startBinding, null);
  assert.equal(el.endBinding, null);
});

// An update is a patch. normalizeElement fills every absent field with a
// default, which is right for a new shape and destroys an existing one: an
// update setting only x used to carry y = 0, width = 100, height = 100 and no
// boundElements, and the merge wrote all of it over the shape. The caller
// moved a box and silently reset its size and detached its label, while the
// result said applied: 1.
test("a patch carries only the fields it was given", () => {
  const [patch] = normalizePatches([{ id: "box", x: 500 }]);

  assert.deepEqual(patch, { id: "box", x: 500 });
  assert.equal("y" in patch, false);
  assert.equal("width" in patch, false);
  assert.equal("boundElements" in patch, false);
});

// The shape is named by id and already has a type; demanding one again is a
// hoop, and demanding non-empty text to retitle a label is worse.
test("a patch needs no type, and text may be anything", () => {
  assert.doesNotThrow(() => normalizePatches([{ id: "box", x: 1 }]));
  assert.doesNotThrow(() => normalizePatches([{ id: "label", text: "" }]));
});

test("a patch must name the shape it changes", () => {
  assert.throws(
    () => normalizePatches([{ x: 1 }]),
    (err: unknown) => err instanceof DrawingElementError && /by id/.test(err.message),
  );
});

test("a patch still refuses a coordinate that is not a number", () => {
  assert.throws(
    () => normalizePatches([{ id: "box", x: "left" }]),
    DrawingElementError,
  );
});

test("a patch normalizes a binding given as a bare id", () => {
  const [patch] = normalizePatches([{ id: "link", startBinding: "box" }]);
  assert.deepEqual(patch.startBinding, { elementId: "box", focus: 0, gap: 4 });
});

// A binding says which shapes an arrow belongs to, not where the line goes.
// Leaving the points empty is the signal for the apply step — which has the
// scene — to place the stroke between the two boxes. Guessing from
// width/height here is how eighteen arrows bound to eighteen different shapes
// were all drawn as the same stroke.
test("a bound arrow leaves its geometry to be placed from the shapes", () => {
  const el = normalizeElement({ type: "arrow", startBinding: "a", endBinding: "b" });
  assert.deepEqual(el.points, []);
});

test("an unbound arrow still gets a visible default stroke", () => {
  const el = normalizeElement({ type: "arrow", width: 160, height: 0 });
  assert.deepEqual(el.points, [
    [0, 0],
    [160, 0],
  ]);
});

test("explicit points always win, bound or not", () => {
  const points = [
    [0, 0],
    [40, 40],
  ];
  const el = normalizeElement({ type: "arrow", startBinding: "a", points });
  assert.deepEqual(el.points, points);
});

// The reported defect: a shape left at the default width held a label wider
// than itself, the words ran over the border, and nothing said so.
test("a labelled shape grows to hold its label", () => {
  const [box] = normalizeElements([
    { type: "rectangle", id: "dc", label: "Domain Controller" },
  ]);

  const width = Number(box.width);
  assert.ok(width > 100, `box should outgrow the 100px default, got ${width}`);
  // Room for the words plus padding on both sides.
  assert.ok(width >= measureText("Domain Controller", 16).width, "label must fit");
});

// A caller who asked for 400px meant 400px, even if one word would have fitted
// in less. Only the absent dimension is chosen for them.
test("an explicit size is never overridden", () => {
  const [box] = normalizeElements([
    { type: "rectangle", id: "wide", width: 400, height: 300, label: "Hi" },
  ]);
  assert.equal(box.width, 400);
  assert.equal(box.height, 300);
});

test("only the dimension that was left out is chosen", () => {
  const [box] = normalizeElements([
    { type: "rectangle", id: "half", width: 500, label: "Domain Controller" },
  ]);
  assert.equal(box.width, 500);
  assert.ok(Number(box.height) >= 48);
});

// Free-standing text had the same 100x100 default and clipped the same way.
test("free-standing text is sized to its own words", () => {
  const short = normalizeElement({ type: "text", text: "Hi" });
  const long = normalizeElement({
    type: "text",
    text: "Lateral movement to the domain controller",
  });
  assert.ok(Number(long.width) > Number(short.width));
  assert.ok(Number(long.width) > 100, "must outgrow the old fixed default");
});

test("a multi-line label is taller than a single-line one", () => {
  const [one] = normalizeElements([{ type: "rectangle", id: "a", label: "One" }]);
  const [two] = normalizeElements([{ type: "rectangle", id: "b", label: "One\nTwo" }]);
  assert.ok(Number(two.height) > Number(one.height));
});

// A very long label wraps rather than growing a box wider than the canvas.
test("a long label wraps instead of growing without bound", () => {
  const [box] = normalizeElements([
    {
      type: "rectangle",
      id: "essay",
      label:
        "This label is deliberately long enough that it has to wrap onto several lines rather than producing one absurdly wide box",
    },
  ]);
  assert.ok(Number(box.width) < 600, `expected a wrapped box, got ${box.width}`);
  assert.ok(Number(box.height) > 48, "wrapped text needs more than one line");
});

// CJK and emoji are about twice the width of Latin at the same size; Cyrillic
// is not. Measuring them all as Latin truncates labels in exactly the scripts
// nobody tests with.
test("wide scripts are measured wider, Cyrillic like Latin", () => {
  const latin = measureText("AAAA", 16).width;
  const cyrillic = measureText("АААА", 16).width;
  const cjk = measureText("四四四四", 16).width;

  assert.equal(cyrillic, latin, "Cyrillic measures like Latin");
  assert.ok(cjk > latin * 1.5, `CJK should be far wider, got ${cjk} vs ${latin}`);
});
