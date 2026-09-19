import { test } from "node:test";
import assert from "node:assert/strict";
import * as Y from "yjs";

import { DRAWING_ROOT_KEY } from "../drawing-projection.js";
import { rebaseDrawing } from "../rebase-drawing.js";

const SOURCE_IMAGE = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const TARGET_IMAGE = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
const OTHER_IMAGE = "1f0e3dad-9990-4b5e-bd3a-6a6a6a6a6a6a";

type SceneElement = Record<string, unknown>;

function stateOf(elements: SceneElement[]): Uint8Array {
  const doc = new Y.Doc();
  const map = doc.getMap<SceneElement>(DRAWING_ROOT_KEY);
  elements.forEach((el, i) => map.set(String(el.id ?? i), el));
  return Y.encodeStateAsUpdate(doc);
}

function elementsOf(state: Uint8Array): SceneElement[] {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return [...doc.getMap<SceneElement>(DRAWING_ROOT_KEY).values()];
}

test("shapes survive the rebase unchanged", () => {
  const result = rebaseDrawing({
    contentState: stateOf([
      { id: "a", type: "rectangle", x: 10, y: 20, version: 3 },
      { id: "b", type: "text", text: "Domain Controller", version: 1 },
    ]),
    idMap: {},
  });

  const elements = elementsOf(result.contentState);
  assert.equal(elements.length, 2);
  assert.equal(result.content, "Domain Controller");
  assert.equal(result.elementCount, 2);
});

// The whole reason this route exists: an image id points at a blob in the
// source installation, so an unrewritten one renders as an empty frame and
// indexes a reference to something that is not there.
test("image ids are rewritten to the importer's ingested blobs", () => {
  const result = rebaseDrawing({
    contentState: stateOf([
      { id: "i", type: "image", fileId: SOURCE_IMAGE, version: 1 },
    ]),
    idMap: { [SOURCE_IMAGE]: TARGET_IMAGE },
  });

  const [image] = elementsOf(result.contentState);
  assert.equal(image.fileId, TARGET_IMAGE);
  assert.equal(result.remapped, 1);
  assert.deepEqual(result.imageReferences, [TARGET_IMAGE]);
  assert.deepEqual(result.unmapped, []);
});

// Ids travel through JSON and Mongo in whatever case each side used. A
// case-sensitive lookup would report an id as unmapped that the importer had
// in fact ingested.
test("id matching ignores case", () => {
  const result = rebaseDrawing({
    contentState: stateOf([
      { id: "i", type: "image", fileId: SOURCE_IMAGE.toUpperCase(), version: 1 },
    ]),
    idMap: { [SOURCE_IMAGE]: TARGET_IMAGE },
  });

  assert.equal(result.remapped, 1);
  assert.deepEqual(result.unmapped, []);
});

test("an unmapped image is reported, and the page still imports", () => {
  const result = rebaseDrawing({
    contentState: stateOf([
      { id: "a", type: "rectangle", version: 1 },
      { id: "i", type: "image", fileId: OTHER_IMAGE, version: 1 },
    ]),
    idMap: {},
  });

  assert.deepEqual(result.unmapped, [OTHER_IMAGE]);
  assert.equal(result.elementCount, 2, "the shapes still came across");
});

// A tombstone exists to tell a live room about an erasure. A freshly created
// document has nobody to tell, so carrying them over would import shapes the
// source had already rubbed out.
test("erased shapes are not carried into the new document", () => {
  const result = rebaseDrawing({
    contentState: stateOf([
      { id: "gone", type: "rectangle", version: 4, isDeleted: true },
      { id: "kept", type: "ellipse", version: 2 },
    ]),
    idMap: {},
  });

  const elements = elementsOf(result.contentState);
  assert.deepEqual(
    elements.map((el) => el.id),
    ["kept"],
  );
  assert.equal(result.elementCount, 1);
});

// The imported page is a new document and must not inherit the source's edit
// history — two installations' client ids would otherwise share a document.
test("the result is a fresh document, not the source's state", () => {
  const source = stateOf([{ id: "a", type: "rectangle", version: 1 }]);
  const result = rebaseDrawing({ contentState: source, idMap: {} });

  assert.notDeepEqual(
    Buffer.from(result.contentState),
    Buffer.from(source),
    "rebased state should not be a byte copy of the source",
  );
  // ...and it still decodes to the same scene.
  assert.equal(elementsOf(result.contentState).length, 1);
});
