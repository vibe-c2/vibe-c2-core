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
  collectFileReferenceIds,
  collectHashReferenceIds,
  collectHostReferenceIds,
  collectImageReferenceIds,
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

function hashChip(hashId: string): Y.XmlElement {
  const el = new Y.XmlElement("wikiHashReference");
  el.setAttribute("hashId", hashId);
  return el;
}

function hostChip(hostId: string): Y.XmlElement {
  const el = new Y.XmlElement("wikiHostReference");
  el.setAttribute("hostId", hostId);
  return el;
}

function block(name: string, ...children: Y.XmlElement[]): Y.XmlElement {
  const el = new Y.XmlElement(name);
  if (children.length > 0) el.insert(0, children);
  return el;
}

// image atom: the id lives inside the src URL, not a dedicated attribute.
function imageNode(id: string): Y.XmlElement {
  const el = new Y.XmlElement("image");
  el.setAttribute("src", "/api/v1/wiki/images/" + id);
  return el;
}

// wikiFile atom: carries the id directly in fileId, like the chips.
function fileNode(id: string): Y.XmlElement {
  const el = new Y.XmlElement("wikiFile");
  el.setAttribute("fileId", id);
  el.setAttribute("url", "/api/v1/wiki/files/" + id);
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

// --- Hash reference walker — sibling of the credential walker. ---

test("hash walker collects a single inline hash reference", () => {
  const frag = withDoc((f) => {
    f.insert(0, [block("paragraph", hashChip(ID_A))]);
  });
  const ids = collectHashReferenceIds(frag);
  assert.deepEqual([...ids], [ID_A]);
});

test("hash walker dedupes repeated hash references", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      block("paragraph", hashChip(ID_A), hashChip(ID_A)),
      block("paragraph", hashChip(ID_A)),
    ]);
  });
  const ids = collectHashReferenceIds(frag);
  assert.equal(ids.size, 1);
  assert.ok(ids.has(ID_A));
});

test("hash walker collects references nested deep inside blocks", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      block(
        "bulletList",
        block(
          "listItem",
          block("paragraph", hashChip(ID_A)),
          block("paragraph", hashChip(ID_B)),
        ),
      ),
      block("blockquote", block("paragraph", hashChip(ID_C))),
    ]);
  });
  const ids = collectHashReferenceIds(frag);
  assert.equal(ids.size, 3);
});

test("hash walker ignores malformed hashId", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      block("paragraph", hashChip("not-a-uuid"), hashChip(""), hashChip(ID_A)),
    ]);
  });
  const ids = collectHashReferenceIds(frag);
  assert.deepEqual([...ids], [ID_A]);
});

test("hash walker normalises ids to lowercase", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      block("paragraph", hashChip(ID_A.toUpperCase()), hashChip(ID_A)),
    ]);
  });
  const ids = collectHashReferenceIds(frag);
  assert.equal(ids.size, 1);
  assert.ok(ids.has(ID_A));
});

test("hash walker stays disjoint from credential and doc walkers", () => {
  // Symmetry guard: each of the three indexes must ignore the other two
  // node types so the inverse indexes never cross-contaminate.
  const frag = withDoc((f) => {
    f.insert(0, [
      block("paragraph", chip(ID_A), credChip(ID_B), hashChip(ID_C)),
    ]);
  });
  assert.deepEqual([...collectHashReferenceIds(frag)], [ID_C]);
  assert.deepEqual([...collectCredentialReferenceIds(frag)], [ID_B]);
  assert.deepEqual([...collectDocReferenceIds(frag)], [ID_A]);
});

test("hash walker returns an empty set for an empty document", () => {
  const frag = withDoc(() => {});
  const ids = collectHashReferenceIds(frag);
  assert.equal(ids.size, 0);
});

// --- Host reference walker — sibling of the credential/hash walkers. ---

test("host walker collects a single inline host reference", () => {
  const frag = withDoc((f) => {
    f.insert(0, [block("paragraph", hostChip(ID_A))]);
  });
  const ids = collectHostReferenceIds(frag);
  assert.deepEqual([...ids], [ID_A]);
});

test("host walker dedupes repeated host references", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      block("paragraph", hostChip(ID_A), hostChip(ID_A)),
      block("paragraph", hostChip(ID_A)),
    ]);
  });
  const ids = collectHostReferenceIds(frag);
  assert.equal(ids.size, 1);
  assert.ok(ids.has(ID_A));
});

test("host walker collects references nested deep inside blocks", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      block(
        "bulletList",
        block(
          "listItem",
          block("paragraph", hostChip(ID_A)),
          block("paragraph", hostChip(ID_B)),
        ),
      ),
      block("blockquote", block("paragraph", hostChip(ID_C))),
    ]);
  });
  const ids = collectHostReferenceIds(frag);
  assert.equal(ids.size, 3);
});

test("host walker ignores malformed hostId", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      block("paragraph", hostChip("not-a-uuid"), hostChip(""), hostChip(ID_A)),
    ]);
  });
  const ids = collectHostReferenceIds(frag);
  assert.deepEqual([...ids], [ID_A]);
});

test("host walker normalises ids to lowercase", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      block("paragraph", hostChip(ID_A.toUpperCase()), hostChip(ID_A)),
    ]);
  });
  const ids = collectHostReferenceIds(frag);
  assert.equal(ids.size, 1);
  assert.ok(ids.has(ID_A));
});

test("host walker stays disjoint from the other reference walkers", () => {
  // Symmetry guard: the host index must ignore doc/credential/hash chips so
  // the four inverse indexes never cross-contaminate.
  const frag = withDoc((f) => {
    f.insert(0, [
      block(
        "paragraph",
        chip(ID_A),
        credChip(ID_B),
        hashChip(ID_C),
        hostChip(ID_A),
      ),
    ]);
  });
  assert.deepEqual([...collectHostReferenceIds(frag)], [ID_A]);
  assert.deepEqual([...collectHashReferenceIds(frag)], [ID_C]);
  assert.deepEqual([...collectCredentialReferenceIds(frag)], [ID_B]);
  assert.deepEqual([...collectDocReferenceIds(frag)], [ID_A]);
});

test("host walker returns an empty set for an empty document", () => {
  const frag = withDoc(() => {});
  const ids = collectHostReferenceIds(frag);
  assert.equal(ids.size, 0);
});

// --- Image reference walker — parses the id out of the src URL. ---

test("image walker collects the id from an image src URL", () => {
  const frag = withDoc((f) => {
    f.insert(0, [imageNode(ID_A)]);
  });
  assert.deepEqual([...collectImageReferenceIds(frag)], [ID_A]);
});

test("image walker collects images nested inside other blocks", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      block("bulletList", block("listItem", imageNode(ID_A))),
      block("blockquote", imageNode(ID_B)),
    ]);
  });
  const ids = collectImageReferenceIds(frag);
  assert.equal(ids.size, 2);
  assert.ok(ids.has(ID_A));
  assert.ok(ids.has(ID_B));
});

test("image walker dedupes and lowercases", () => {
  const frag = withDoc((f) => {
    f.insert(0, [imageNode(ID_A.toUpperCase()), imageNode(ID_A)]);
  });
  const ids = collectImageReferenceIds(frag);
  assert.equal(ids.size, 1);
  assert.ok(ids.has(ID_A));
});

test("image walker ignores external (non-wiki) image sources", () => {
  const frag = withDoc((f) => {
    const ext = new Y.XmlElement("image");
    ext.setAttribute("src", "https://example.com/cat.png");
    f.insert(0, [ext, imageNode(ID_A)]);
  });
  // Only the wiki-hosted image contributes; the external URL has no id.
  assert.deepEqual([...collectImageReferenceIds(frag)], [ID_A]);
});

test("image walker ignores a malformed id in the src URL", () => {
  const frag = withDoc((f) => {
    const bad = new Y.XmlElement("image");
    bad.setAttribute("src", "/api/v1/wiki/images/not-a-uuid");
    f.insert(0, [bad, imageNode(ID_A)]);
  });
  assert.deepEqual([...collectImageReferenceIds(frag)], [ID_A]);
});

// --- File reference walker — reads the wikiFile.fileId attribute. ---

test("file walker collects the id from a wikiFile node", () => {
  const frag = withDoc((f) => {
    f.insert(0, [fileNode(ID_A)]);
  });
  assert.deepEqual([...collectFileReferenceIds(frag)], [ID_A]);
});

test("file walker collects files nested inside other blocks and dedupes", () => {
  const frag = withDoc((f) => {
    f.insert(0, [
      block("bulletList", block("listItem", fileNode(ID_A))),
      fileNode(ID_A),
      block("blockquote", fileNode(ID_B)),
    ]);
  });
  const ids = collectFileReferenceIds(frag);
  assert.equal(ids.size, 2);
  assert.ok(ids.has(ID_A));
  assert.ok(ids.has(ID_B));
});

test("image and file walkers stay disjoint from each other and the chips", () => {
  // An image id appearing in a file URL (or vice versa) must never
  // cross-contaminate — that would let one sweeper keep the other's blobs
  // alive or, worse, miss a real reference.
  const frag = withDoc((f) => {
    f.insert(0, [
      block("paragraph", chip(ID_A)),
      imageNode(ID_B),
      fileNode(ID_C),
    ]);
  });
  assert.deepEqual([...collectImageReferenceIds(frag)], [ID_B]);
  assert.deepEqual([...collectFileReferenceIds(frag)], [ID_C]);
  assert.deepEqual([...collectDocReferenceIds(frag)], [ID_A]);
});

test("image and file walkers return empty sets for an empty document", () => {
  const frag = withDoc(() => {});
  assert.equal(collectImageReferenceIds(frag).size, 0);
  assert.equal(collectFileReferenceIds(frag).size, 0);
});
