// What the search index sees.
//
// `content` is a plain-text projection of the document, and the text index
// covers only title and content. A plain walk collects child text, which
// misses atom nodes entirely: an attachment card keeps its filename in an
// attribute. The result was that a page whose body is four files projected to
// an empty string, so searching for any of those filenames found nothing.
//
// Run `npm test`.

import test from "node:test";
import assert from "node:assert/strict";
import { Doc } from "yjs";
import { prosemirrorJSONToYDoc } from "y-prosemirror";

import { wikiSchema } from "../wiki-schema.js";
import { Y_FRAGMENT_FIELD } from "../rebase-document.js";
import { extractTextFromFragment } from "../projection.js";

const FILE_ID = "66666666-6666-4666-8666-666666666666";

type J = Record<string, unknown>;

function textOf(content: J[]): string {
  const ydoc: Doc = prosemirrorJSONToYDoc(
    wikiSchema,
    { type: "doc", content },
    Y_FRAGMENT_FIELD,
  );
  try {
    return extractTextFromFragment(ydoc.getXmlFragment(Y_FRAGMENT_FIELD));
  } finally {
    ydoc.destroy();
  }
}

function paragraph(text: string): J {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function fileCard(filename: string): J {
  return {
    type: "wikiFile",
    attrs: {
      fileId: FILE_ID,
      url: `/api/v1/wiki/files/${FILE_ID}`,
      filename,
      size: 1024,
      contentType: "application/pdf",
    },
  };
}

test("an attachment's filename reaches the search text", () => {
  const text = textOf([fileCard("ConfigurationSettings.xlsx")])
  assert.match(text, /ConfigurationSettings\.xlsx/);
});

test("a page that is only attachments is no longer empty", () => {
  // The reported case: four files and nothing else, projecting to "".
  const text = textOf([
    fileCard("one.xlsx"),
    fileCard("two.docx"),
    fileCard("three.csv"),
  ]);
  assert.notEqual(text, "");
  for (const name of ["one.xlsx", "two.docx", "three.csv"]) {
    assert.ok(text.includes(name), `${name} missing from ${JSON.stringify(text)}`);
  }
});

test("prose still projects, with attachments alongside it", () => {
  const text = textOf([
    paragraph("SMB signing is disabled on dc01."),
    fileCard("scan.json"),
  ]);
  assert.match(text, /SMB signing is disabled on dc01\./);
  assert.match(text, /scan\.json/);
});

test("an image contributes its alt text and nothing else", () => {
  // Alt text is what somebody would search for. The src URL is not.
  const text = textOf([
    {
      type: "image",
      attrs: {
        src: "/api/v1/wiki/images/44444444-4444-4444-8444-444444444444",
        alt: "network diagram",
        title: null,
      },
    },
  ]);
  assert.match(text, /network diagram/);
  assert.doesNotMatch(text, /api\/v1\/wiki\/images/);
});

test("ids, urls, sizes and content types stay out of the index", () => {
  // They would bloat it and match nothing anyone types.
  const text = textOf([fileCard("report.pdf")]);
  assert.doesNotMatch(text, /66666666/);
  assert.doesNotMatch(text, /api\/v1\/wiki\/files/);
  assert.doesNotMatch(text, /application\/pdf/);
  assert.doesNotMatch(text, /1024/);
});

test("an attachment with no filename adds no blank lines", () => {
  const text = textOf([paragraph("before"), fileCard(""), paragraph("after")]);
  assert.equal(text, "before\nafter");
});
