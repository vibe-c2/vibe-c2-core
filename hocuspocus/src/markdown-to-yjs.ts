// Convert Outline-flavored markdown into a Y.js document update binary.
//
// Pipeline:
//   markdown
//     → ProseMirror Node    (parseOutlineMarkdown, our schema)
//     → Y.Doc               (y-prosemirror.prosemirrorJSONToYDoc)
//     → Uint8Array update   (yjs.encodeStateAsUpdate)
//
// Field name "default" matches what hocuspocus/src/persistence.ts reads
// back via ydoc.getXmlFragment("default"). The editor's collab extension
// uses the same field, so the bytes produced here are byte-for-byte
// compatible with what a live editor would have written.

import { encodeStateAsUpdate } from "yjs";
import { prosemirrorJSONToYDoc } from "y-prosemirror";
import { wikiSchema } from "./wiki-schema.js";
import { parseOutlineMarkdown } from "./markdown-parser.js";

export const Y_FRAGMENT_FIELD = "default";

/**
 * Convert markdown text to a Y.js update encoded as bytes. The bytes are
 * suitable for direct insertion into wiki_documents.content_state.
 *
 * Never throws on malformed markdown — the parser falls back to a plain
 * paragraph (see parseOutlineMarkdown). Throws only on out-of-memory or
 * if the Y.js encoder fails (which would indicate a schema/JSON mismatch
 * we'd want to know about).
 */
export function markdownToYjsUpdate(markdown: string): Uint8Array {
  const pmDoc = parseOutlineMarkdown(markdown);
  const ydoc = prosemirrorJSONToYDoc(wikiSchema, pmDoc.toJSON(), Y_FRAGMENT_FIELD);
  try {
    return encodeStateAsUpdate(ydoc);
  } finally {
    ydoc.destroy();
  }
}
