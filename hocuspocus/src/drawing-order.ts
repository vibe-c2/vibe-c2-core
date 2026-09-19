// The order shapes are drawn in, and therefore what covers what.
//
// Excalidraw takes a flat array and paints it front to back, so the array IS
// the z-order. Our elements live in a Y.Map keyed by id, which has no order at
// all — and handing back its iteration order was a real bug rather than an
// approximation: Yjs orders that map by CRDT structure, so two people in the
// same room saw different arrays for identical state. An arrow could be over
// the box for one of them and under it for the other, and nothing looked
// wrong to either.
//
// So the order is computed, from a key every client derives identically:
//
//   1. `z`, our own integer layer. Absent means 0, which is where everything a
//      person draws sits — so an agent can put a shape behind the whole
//      drawing with -1 without having to know what is already there.
//   2. `index`, Excalidraw's fractional key, within a layer. This is what
//      preserves the order of shapes a person drew and reordered in the app;
//      ignoring it was why their arrangement never survived a reload.
//   3. `id`, so the sort is total. Two elements that tie on both of the above
//      still have to land somewhere, and it must be the same somewhere for
//      everybody.
//
// Mirrored in frontend/src/components/wiki/drawing/drawing-scene.ts. The two
// must agree exactly: a canvas that sorts differently from the server is the
// same bug in a new place.

interface Orderable {
  id: string;
  z?: unknown;
  index?: unknown;
}

/** The layer an element sits in. Anything a person drew has none, and 0 is
 * that layer — so negative is behind them and positive is in front. */
export function layerOf(el: Orderable): number {
  return typeof el.z === "number" && Number.isFinite(el.z) ? el.z : 0;
}

/** Compare two elements by paint order: back first, front last. */
export function compareElements(a: Orderable, b: Orderable): number {
  const byLayer = layerOf(a) - layerOf(b);
  if (byLayer !== 0) return byLayer;

  // Fractional indices are compared as plain strings; that is the whole point
  // of the scheme. An element without one sorts before one with, so an
  // agent-written shape sits behind a person's within the same layer until it
  // is given a layer of its own.
  const ai = typeof a.index === "string" ? a.index : "";
  const bi = typeof b.index === "string" ? b.index : "";
  if (ai !== bi) return ai < bi ? -1 : 1;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Every element, in the order it should be painted. */
export function inPaintOrder<T extends Orderable>(elements: Iterable<T>): T[] {
  return [...elements].sort(compareElements);
}
