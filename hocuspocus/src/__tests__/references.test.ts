// Unit tests for the /doc and /credential reference extractors that drive
// backlinks. Run via `npm test`. The functions are pure — we build
// Y.XmlElement trees by hand instead of round-tripping through TipTap /
// ProseMirror so the tests stay focused on the walk semantics.

import test from "node:test";
import assert from "node:assert/strict";
import { Doc } from "yjs";
import * as Y from "yjs";
import {
  collectCredentialReferenceIds,
  collectDocReferenceIds,
} from "../references.js";

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

function credChip(credentialId: string): Y.XmlElement {
  const el = new Y.XmlElement("wikiCredentialReference");
  el.setAttribute("credentialId", credentialId);
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
  const ids = collectDocReferenceIds(frag);
  assert.deepEqual([...ids], [ID_A]);
});

test("deduplicates repeated references to the same doc", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      block("paragraph", chip(ID_A), chip(ID_A)),
      block("paragraph", chip(ID_A)),
    ]);
  });
  const ids = collectDocReferenceIds(frag);
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
  const ids = collectDocReferenceIds(frag);
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
  const ids = collectDocReferenceIds(frag);
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
  const ids = collectDocReferenceIds(frag);
  assert.equal(ids.size, 1);
  assert.ok(ids.has(ID_A));
});

test("skips chips that lack a documentId attribute entirely", () => {
  const frag = withDoc((f) => {
    const ghost = new Y.XmlElement("wikiDocumentReference");
    f.insert(0, [block("paragraph", ghost, chip(ID_A))]);
  });
  const ids = collectDocReferenceIds(frag);
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
  const ids = collectDocReferenceIds(frag);
  assert.equal(ids.size, 0);
});

test("returns an empty set for an empty document", () => {
  const frag = withDoc(() => {});
  const ids = collectDocReferenceIds(frag);
  assert.equal(ids.size, 0);
});

// --- Credential reference walker — sibling of the doc walker. ---

test("credential walker collects a single inline credential reference", () => {
  const frag = withDoc((f) => {
    f.insert(0, [block("paragraph", credChip(ID_A))]);
  });
  const ids = collectCredentialReferenceIds(frag);
  assert.deepEqual([...ids], [ID_A]);
});

test("credential walker dedupes repeated credential references", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      block("paragraph", credChip(ID_A), credChip(ID_A)),
      block("paragraph", credChip(ID_A)),
    ]);
  });
  const ids = collectCredentialReferenceIds(frag);
  assert.equal(ids.size, 1);
  assert.ok(ids.has(ID_A));
});

test("credential walker collects references nested deep inside blocks", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      block(
        "bulletList",
        block(
          "listItem",
          block("paragraph", credChip(ID_A)),
          block("paragraph", credChip(ID_B)),
        ),
      ),
      block("blockquote", block("paragraph", credChip(ID_C))),
    ]);
  });
  const ids = collectCredentialReferenceIds(frag);
  assert.equal(ids.size, 3);
});

test("credential walker ignores malformed credentialId", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      block(
        "paragraph",
        credChip("not-a-uuid"),
        credChip(""),
        credChip(ID_A),
      ),
    ]);
  });
  const ids = collectCredentialReferenceIds(frag);
  assert.deepEqual([...ids], [ID_A]);
});

test("credential walker normalises ids to lowercase", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      block("paragraph", credChip(ID_A.toUpperCase()), credChip(ID_A)),
    ]);
  });
  const ids = collectCredentialReferenceIds(frag);
  assert.equal(ids.size, 1);
  assert.ok(ids.has(ID_A));
});

test("credential walker does NOT pick up wikiDocumentReference nodes", () => {
  // Symmetry guard: the doc walker explicitly ignores credential chips
  // (asserted above) and the credential walker must explicitly ignore doc
  // chips. The two indexes stay disjoint.
  const frag = withDoc((f) => {
    f.insert(0, [block("paragraph", chip(ID_A), credChip(ID_B))]);
  });
  assert.deepEqual([...collectCredentialReferenceIds(frag)], [ID_B]);
  assert.deepEqual([...collectDocReferenceIds(frag)], [ID_A]);
});

test("credential walker returns an empty set for an empty document", () => {
  const frag = withDoc(() => {});
  const ids = collectCredentialReferenceIds(frag);
  assert.equal(ids.size, 0);
});
