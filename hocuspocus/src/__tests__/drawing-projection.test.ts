import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";

import {
  DRAWING_ROOT_KEY,
  deriveDrawingProjection,
  isDrawingState,
} from "../drawing-projection.js";

const WIKI_IMAGE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
/** Excalidraw mints its own file ids as long hex digests, not uuids. */
const LOCAL_FILE_ID = "8f14e45fceea167a5a36dedd4bea2543a1b2c3d4";

type SceneElement = Record<string, unknown>;

function sceneOf(elements: SceneElement[]): Y.Doc {
  const doc = new Y.Doc();
  const map = doc.getMap<SceneElement>(DRAWING_ROOT_KEY);
  elements.forEach((el, i) => map.set(String(el.id ?? i), el));
  return doc;
}

test("an empty document projects nothing", () => {
  const projection = deriveDrawingProjection(new Y.Doc());
  assert.deepEqual(projection, {
    content: "",
    imageReferences: [],
    elementCount: 0,
    versionSum: 0,
  });
});

test("labels become searchable text", () => {
  const projection = deriveDrawingProjection(
    sceneOf([
      { id: "a", type: "rectangle", version: 1 },
      { id: "b", type: "text", text: "Domain Controller", version: 1 },
      { id: "c", type: "text", text: "  Jump host  ", version: 1 },
    ]),
  );

  assert.equal(projection.content, "Domain Controller\nJump host");
});

test("a frame contributes its name", () => {
  const projection = deriveDrawingProjection(
    sceneOf([{ id: "f", type: "frame", name: "DMZ", version: 1 }]),
  );
  assert.equal(projection.content, "DMZ");
});

// This is the whole reason the projection carries a scene dimension at all.
// A drawing's text does not move when somebody drags a box, so without it
// persistence.ts reads every such edit as an open-time no-op: no updateAt, no
// attribution, no webhook, and the page never enters "recently updated".
test("moving a shape changes the projection even though no text does", () => {
  const before = deriveDrawingProjection(
    sceneOf([{ id: "a", type: "rectangle", version: 4 }]),
  );
  const after = deriveDrawingProjection(
    sceneOf([{ id: "a", type: "rectangle", version: 5 }]),
  );

  assert.equal(before.content, after.content);
  assert.notEqual(before.versionSum, after.versionSum);
});

test("image elements populate the attachment index", () => {
  const projection = deriveDrawingProjection(
    sceneOf([{ id: "i", type: "image", fileId: WIKI_IMAGE_ID, version: 1 }]),
  );
  assert.deepEqual(projection.imageReferences, [WIKI_IMAGE_ID]);
});

// An image mid-upload still carries the id Excalidraw minted for it. That id
// points at no blob, so indexing it would put a reference to nothing in the
// liveness index the sweeper reads.
test("an image that has not been uploaded yet is not indexed", () => {
  const projection = deriveDrawingProjection(
    sceneOf([{ id: "i", type: "image", fileId: LOCAL_FILE_ID, version: 1 }]),
  );
  assert.deepEqual(projection.imageReferences, []);
});

// Tombstones are how peers learn about an erasure, but they are not content.
// Counting a deleted image would keep its blob alive forever, since the
// sweeper only reclaims what no document references.
test("deleted elements count for nothing", () => {
  const projection = deriveDrawingProjection(
    sceneOf([
      { id: "a", type: "text", text: "gone", version: 9, isDeleted: true },
      {
        id: "i",
        type: "image",
        fileId: WIKI_IMAGE_ID,
        version: 3,
        isDeleted: true,
      },
      { id: "b", type: "rectangle", version: 2 },
    ]),
  );

  assert.equal(projection.content, "");
  assert.deepEqual(projection.imageReferences, []);
  assert.equal(projection.elementCount, 1);
  assert.equal(projection.versionSum, 2);
});

test("elementCount is what tells a real drawing from a blank canvas", () => {
  assert.equal(deriveDrawingProjection(new Y.Doc()).elementCount, 0);
  assert.equal(
    deriveDrawingProjection(sceneOf([{ id: "a", type: "ellipse", version: 1 }]))
      .elementCount,
    1,
  );
});

test("isDrawingState reads the bytes, not the row", () => {
  assert.equal(isDrawingState(new Y.Doc()), false);
  assert.equal(
    isDrawingState(sceneOf([{ id: "a", type: "rectangle", version: 1 }])),
    true,
  );
});

// The scene and the prose body live in the same room under different root
// keys. A drawing must never look like a page with an empty body, and a prose
// page must never look like a drawing.
test("a prose document projects as an empty drawing", () => {
  const doc = new Y.Doc();
  const fragment = doc.getXmlFragment("default");
  const paragraph = new Y.XmlElement("paragraph");
  paragraph.insert(0, [new Y.XmlText("some prose")]);
  fragment.insert(0, [paragraph]);

  assert.equal(isDrawingState(doc), false);
  assert.equal(deriveDrawingProjection(doc).elementCount, 0);
});
