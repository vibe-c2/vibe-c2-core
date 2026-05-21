// Convert a wiki document's Y.js binary state into Outline-flavored markdown.
//
// Inverse of markdown-to-yjs.ts. Pipeline:
//   Uint8Array update    → Y.Doc                  (Y.applyUpdate)
//                        → ProseMirror Node       (yXmlFragmentToProseMirrorRootNode)
//                        → markdown               (serializeWikiDocument)
//
// Field name "default" matches what hocuspocus/src/persistence.ts reads
// and what markdownToYjsUpdate writes, so an import-then-export round
// trip is bit-stable.

import * as Y from "yjs";
import { yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import { wikiSchema } from "./wiki-schema.js";
import { serializeWikiDocument } from "./markdown-serializer.js";

export const Y_FRAGMENT_FIELD = "default";

/**
 * Convert a Y.js update binary back to markdown. Returns the empty string
 * for a Y.js doc with no content (no XmlFragment children).
 *
 * Throws if the update bytes are not a valid Y.js update; callers should
 * treat that as a per-document failure (the orchestrator skips with a
 * recorded reason) rather than aborting the whole export.
 */
export function yjsUpdateToMarkdown(update: Uint8Array): string {
  const ydoc = new Y.Doc();
  try {
    Y.applyUpdate(ydoc, update);
    const fragment = ydoc.getXmlFragment(Y_FRAGMENT_FIELD);
    if (fragment.length === 0) {
      return "";
    }
    const root = yXmlFragmentToProseMirrorRootNode(fragment, wikiSchema);
    return serializeWikiDocument(root);
  } finally {
    ydoc.destroy();
  }
}
