// Unit tests for the /doc reference extractor that drives backlinks. Run
// via `npm test`. The function is pure — we build Y.XmlElement trees by
// hand instead of round-tripping through TipTap/ProseMirror so the tests
// stay focused on the walk semantics.

import test from "node:test";
import assert from "node:assert/strict";
import { Doc } from "yjs";
import * as Y from "yjs";
import { collectReferenceIds } from "../references.js";

// Helper — must be attached to a live Doc before setAttribute will persist.
function withDoc(build: (frag: Y.XmlFragment) => void): Y.XmlFragment {
  const doc = new Doc();
  const frag = doc.getXmlFragment("default");
  build(frag);
  return frag;
}

function chip(documentId: string): Y.XmlElement {
  const el = new Y.XmlElement("wikiDocumentReference");
  // setAttribute works pre-integration but the integrated Doc is required
  // for child elements to retain attributes after insert.
  el.setAttribute("documentId", documentId);
  return el;
}

function block(name: string, ...children: Y.XmlElement[]): Y.XmlElement {
  const el = new Y.XmlElement(name);
  if (children.length > 0) el.insert(0, children);
  return el;
}

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";

test("collects a single inline reference", () => {
  const frag = withDoc((f) => {
    f.insert(0, [block("paragraph", chip(ID_A))]);
  });
  const ids = collectReferenceIds(frag);
  assert.deepEqual([...ids], [ID_A]);
});

test("deduplicates repeated references to the same doc", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      block("paragraph", chip(ID_A), chip(ID_A)),
      block("paragraph", chip(ID_A)),
    ]);
  });
  const ids = collectReferenceIds(frag);
  assert.equal(ids.size, 1);
  assert.ok(ids.has(ID_A));
});

test("collects references nested deep inside other blocks", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      block(
        "bulletList",
        block(
          "listItem",
          block("paragraph", chip(ID_A)),
          block("paragraph", chip(ID_B)),
        ),
      ),
      block("blockquote", block("paragraph", chip(ID_C))),
    ]);
  });
  const ids = collectReferenceIds(frag);
  assert.equal(ids.size, 3);
  assert.ok(ids.has(ID_A));
  assert.ok(ids.has(ID_B));
  assert.ok(ids.has(ID_C));
});

test("ignores chips with malformed documentId", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      block(
        "paragraph",
        chip("not-a-uuid"),
        chip(""),
        chip(ID_A),
      ),
    ]);
  });
  const ids = collectReferenceIds(frag);
  assert.deepEqual([...ids], [ID_A]);
});

test("normalizes ids to lowercase so case variants dedupe", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      block(
        "paragraph",
        chip(ID_A.toUpperCase()),
        chip(ID_A),
      ),
    ]);
  });
  const ids = collectReferenceIds(frag);
  assert.equal(ids.size, 1);
  assert.ok(ids.has(ID_A));
});

test("skips chips that lack a documentId attribute entirely", () => {
  const frag = withDoc((f) => {
    const ghost = new Y.XmlElement("wikiDocumentReference");
    f.insert(0, [block("paragraph", ghost, chip(ID_A))]);
  });
  const ids = collectReferenceIds(frag);
  assert.deepEqual([...ids], [ID_A]);
});

test("does not pick up unrelated node types", () => {
  const frag = withDoc((f) => {
    // wikiCredentialReference is a sibling node type — must NOT be tracked
    // here. Backlinks are document-to-document only; credentials live in
    // their own index.
    const cred = new Y.XmlElement("wikiCredentialReference");
    cred.setAttribute("credentialId", ID_A);
    f.insert(0, [block("paragraph", cred)]);
  });
  const ids = collectReferenceIds(frag);
  assert.equal(ids.size, 0);
});

test("returns an empty set for an empty document", () => {
  const frag = withDoc(() => {});
  const ids = collectReferenceIds(frag);
  assert.equal(ids.size, 0);
});
