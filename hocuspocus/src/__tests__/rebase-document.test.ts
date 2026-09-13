// rebase-document: id rewriting on the ProseMirror tree plus the derived
// projection. Pins the contract the Go transfer materialiser
// (core/pkg/wikitransfer) builds on.

import test from "node:test";
import assert from "node:assert/strict";
import { Doc, applyUpdate, encodeStateAsUpdate } from "yjs";
import { prosemirrorJSONToYDoc, yXmlFragmentToProsemirrorJSON } from "y-prosemirror";
import { wikiSchema } from "../wiki-schema.js";
import { rebaseDocument, Y_FRAGMENT_FIELD } from "../rebase-document.js";
import { parseRebaseRequest } from "../rebase-api.js";
import { deriveProjection } from "../projection.js";

const DOC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DOC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const HOST_1 = "11111111-1111-4111-8111-111111111111";
const HASH_1 = "22222222-2222-4222-8222-222222222222";
const CRED_1 = "33333333-3333-4333-8333-333333333333";
const IMG_1 = "44444444-4444-4444-8444-444444444444";
const IMG_2 = "55555555-5555-4555-8555-555555555555";
const FILE_1 = "66666666-6666-4666-8666-666666666666";
const FILE_2 = "77777777-7777-4777-8777-777777777777";

type J = Record<string, unknown>;

function encode(json: J): Uint8Array {
  const ydoc = prosemirrorJSONToYDoc(wikiSchema, json, Y_FRAGMENT_FIELD);
  try {
    return encodeStateAsUpdate(ydoc);
  } finally {
    ydoc.destroy();
  }
}

function decode(update: Uint8Array): J {
  const ydoc = new Doc();
  applyUpdate(ydoc, update);
  const json = yXmlFragmentToProsemirrorJSON(ydoc.getXmlFragment(Y_FRAGMENT_FIELD)) as J;
  ydoc.destroy();
  return json;
}

// A page exercising every id-bearing node type once.
function richDoc(): J {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "see " },
          { type: "wikiDocumentReference", attrs: { documentId: DOC_A } },
          { type: "text", text: " on " },
          { type: "wikiHostReference", attrs: { hostId: HOST_1 } },
          { type: "text", text: " with " },
          { type: "wikiHashReference", attrs: { hashId: HASH_1 } },
          { type: "text", text: " and " },
          { type: "wikiCredentialReference", attrs: { credentialId: CRED_1 } },
        ],
      },
      {
        type: "image",
        attrs: { src: `https://old.example/api/v1/wiki/images/${IMG_1}`, width: 10, height: 5 },
      },
      {
        type: "wikiFile",
        attrs: {
          fileId: FILE_1,
          url: `/api/v1/wiki/files/${FILE_1}`,
          filename: "notes.pdf",
          size: 12,
          contentType: "application/pdf",
        },
      },
      {
        type: "wikiChecklistItem",
        attrs: { key: "q1", prompt: "Scoped?", required: true },
        content: [{ type: "paragraph", content: [{ type: "text", text: "yes" }] }],
      },
    ],
  };
}

function findNodes(json: J, type: string): J[] {
  const out: J[] = [];
  const walk = (n: J) => {
    if (n.type === type) out.push(n);
    for (const c of (n.content as J[] | undefined) ?? []) walk(c);
  };
  walk(json);
  return out;
}

test("remaps every id kind and rewrites attachment URLs to canonical form", () => {
  const res = rebaseDocument({
    contentState: encode(richDoc()),
    idMap: {
      [DOC_A]: DOC_B,
      [IMG_1]: IMG_2,
      [FILE_1]: FILE_2,
      [CRED_1]: CRED_1.replace(/3/g, "9"),
    },
  });
  const out = decode(res.contentState);

  const docRef = findNodes(out, "wikiDocumentReference")[0] as { attrs: J };
  assert.equal(docRef.attrs.documentId, DOC_B);

  const img = findNodes(out, "image")[0] as { attrs: J };
  assert.equal(img.attrs.src, `/api/v1/wiki/images/${IMG_2}`, "absolute host stripped");
  assert.equal(img.attrs.width, 10, "other attrs preserved");

  const file = findNodes(out, "wikiFile")[0] as { attrs: J };
  assert.equal(file.attrs.fileId, FILE_2);
  assert.equal(file.attrs.url, `/api/v1/wiki/files/${FILE_2}`);
  assert.equal(file.attrs.filename, "notes.pdf");

  assert.equal(res.remapped, 4);
  assert.equal(res.dropped, 0);
  // Host and hash were not in the map and no kinds were marked droppable:
  // they are kept, and reported as unmapped so the caller can decide.
  assert.deepEqual(res.unmapped, [HOST_1, HASH_1].sort());
});

test("projection matches what persistence derives for the same state", () => {
  const res = rebaseDocument({
    contentState: encode(richDoc()),
    idMap: { [DOC_A]: DOC_B, [IMG_1]: IMG_2, [FILE_1]: FILE_2 },
  });
  assert.deepEqual(res.references, [DOC_B]);
  assert.deepEqual(res.hostReferences, [HOST_1]);
  assert.deepEqual(res.hashReferences, [HASH_1]);
  assert.deepEqual(res.credentialReferences, [CRED_1]);
  assert.deepEqual(res.imageReferences, [IMG_2]);
  assert.deepEqual(res.fileReferences, [FILE_2]);
  assert.deepEqual(res.checklist, { total: 1, required: 1, answered: 1 });
  assert.ok(res.content.includes("see"));

  // Same bytes through the persistence-side derivation must agree.
  const ydoc = new Doc();
  applyUpdate(ydoc, res.contentState);
  const again = deriveProjection(ydoc.getXmlFragment(Y_FRAGMENT_FIELD));
  ydoc.destroy();
  assert.deepEqual(again, {
    content: res.content,
    references: res.references,
    credentialReferences: res.credentialReferences,
    hashReferences: res.hashReferences,
    hostReferences: res.hostReferences,
    imageReferences: res.imageReferences,
    fileReferences: res.fileReferences,
    checklist: res.checklist,
  });
});

test("explicit drop lowers a chip to its label, keeping the sentence readable", () => {
  const res = rebaseDocument({
    contentState: encode(richDoc()),
    idMap: { [IMG_1]: IMG_2, [FILE_1]: FILE_2 },
    drop: [CRED_1],
  });
  const out = decode(res.contentState);
  assert.equal(findNodes(out, "wikiCredentialReference").length, 0);
  assert.ok(res.content.includes("and credential"), res.content);
  assert.equal(res.dropped, 1);
  assert.deepEqual(res.credentialReferences, []);
});

test("dropUnmappedKinds lowers only the named kinds", () => {
  const res = rebaseDocument({
    contentState: encode(richDoc()),
    idMap: { [IMG_1]: IMG_2, [FILE_1]: FILE_2, [DOC_A]: DOC_B },
    dropUnmappedKinds: ["host", "hash"],
  });
  const out = decode(res.contentState);
  assert.equal(findNodes(out, "wikiHostReference").length, 0);
  assert.equal(findNodes(out, "wikiHashReference").length, 0);
  assert.equal(findNodes(out, "wikiCredentialReference").length, 1, "credential kept");
  assert.equal(findNodes(out, "wikiDocumentReference").length, 1, "mapped doc kept");
  assert.deepEqual(res.unmapped, [CRED_1]);
  assert.equal(res.dropped, 2);
});

test("accepts markdown input and lowers reference links the same way", () => {
  const md =
    `intro [page](vibe://doc/${DOC_A}) and [host](vibe://host/${HOST_1})\n\n` +
    `![](/api/v1/wiki/images/${IMG_1} " =10x5")`;
  const res = rebaseDocument({
    markdown: md,
    idMap: { [DOC_A]: DOC_B, [IMG_1]: IMG_2 },
    dropUnmappedKinds: ["host"],
  });
  const out = decode(res.contentState);
  const docRef = findNodes(out, "wikiDocumentReference")[0] as { attrs: J };
  assert.equal(docRef.attrs.documentId, DOC_B);
  assert.equal(findNodes(out, "wikiHostReference").length, 0);
  assert.deepEqual(res.imageReferences, [IMG_2]);
  assert.deepEqual(res.references, [DOC_B]);
});

test("empty state yields an empty page with an empty projection", () => {
  const res = rebaseDocument({ contentState: new Uint8Array(), markdown: "", idMap: {} });
  const out = decode(res.contentState);
  assert.equal((out.content as J[]).length, 1);
  assert.equal(res.content, "");
  assert.deepEqual(res.checklist, { total: 0, required: 0, answered: 0 });
});

test("a chip with a malformed id is lowered rather than carried forward", () => {
  const res = rebaseDocument({
    contentState: encode({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "wikiHostReference", attrs: { hostId: "not-a-uuid" } }],
        },
      ],
    }),
    idMap: {},
  });
  assert.equal(res.dropped, 1);
  assert.deepEqual(res.hostReferences, []);
});

test("rejects corrupt Y.js bytes", () => {
  assert.throws(() =>
    rebaseDocument({ contentState: new Uint8Array([1, 2, 3, 4, 5]), idMap: {} }),
  );
});

test("wire parser enforces exactly one input and validates the map", () => {
  assert.equal(parseRebaseRequest({}).ok, false);
  assert.equal(parseRebaseRequest({ markdown: "x", contentState: "AA==" }).ok, false);
  assert.equal(parseRebaseRequest({ markdown: "x", idMap: { a: 1 } }).ok, false);
  assert.equal(parseRebaseRequest({ markdown: "x", dropUnmappedKinds: ["page"] }).ok, false);
  const ok = parseRebaseRequest({ markdown: "x", idMap: { a: "b" }, dropUnmappedKinds: ["doc"] });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.req.markdown, "x");
    assert.deepEqual(ok.req.dropUnmappedKinds, ["doc"]);
  }
});
