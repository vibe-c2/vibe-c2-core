// The audit tells an agent whether its file links became attachment cards.

import test from "node:test";
import assert from "node:assert/strict";
import { Doc, applyUpdate } from "yjs";
import { markdownToYjsUpdate, Y_FRAGMENT_FIELD } from "../markdown-to-yjs.js";
import { auditAttachments } from "../attachment-audit.js";

const FILE_ID = "0b8f1c2e-1234-4abc-9def-0123456789ab";
const FILE_LINK = `[recon.txt 2048](/api/v1/wiki/files/${FILE_ID})`;

function fragmentFor(md: string) {
  const doc = new Doc();
  applyUpdate(doc, markdownToYjsUpdate(md));
  return doc.getXmlFragment(Y_FRAGMENT_FIELD);
}

test("a lifted file link counts as a card and not as a stray link", () => {
  const audit = auditAttachments(fragmentFor(`Done:\n\n${FILE_LINK}`));
  assert.equal(audit.attachmentCards, 1);
  assert.deepEqual(audit.strayFileLinks, []);
});

test("a file link with text beside it is reported as stray, with its label", () => {
  const audit = auditAttachments(fragmentFor(`Full output: ${FILE_LINK}`));
  assert.equal(audit.attachmentCards, 0);
  assert.deepEqual(audit.strayFileLinks, [{ fileId: FILE_ID, label: "recon.txt 2048" }]);
});

test("a stray link inside a checklist answer is found", () => {
  const md = `:::checklist {"prompt":"Scan?"}\nSee ${FILE_LINK}\n:::`;
  const audit = auditAttachments(fragmentFor(md));
  assert.equal(audit.strayFileLinks.length, 1);
});

test("ordinary links are not file links", () => {
  const audit = auditAttachments(fragmentFor("[docs](https://example.com/api/v1/other)"));
  assert.deepEqual(audit, { attachmentCards: 0, strayFileLinks: [] });
});
