import * as Y from "yjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Walk a Y.js TipTap document and return the deduplicated, lowercase set of
 * `documentId` attributes from every `wikiDocumentReference` atom node.
 *
 * Pure function — no I/O, no Binary conversion, no mutation of inputs. The
 * persistence layer wraps the result in BSON Binary for Mongo; the rest of
 * the test surface checks the string contract.
 *
 * Malformed UUIDs are silently dropped: a single bad chip must never prevent
 * the document from saving. `wikiDocumentReference` is registered as an
 * atom in the editor schema, so the walker doesn't recurse into it — that
 * mirrors how ProseMirror models the node and avoids picking up phantom
 * attributes on synthetic children.
 */
export function collectReferenceIds(
  node: Y.XmlFragment | Y.XmlElement,
): Set<string> {
  const out = new Set<string>();
  walk(node, out);
  return out;
}

function walk(
  node: Y.XmlFragment | Y.XmlElement,
  out: Set<string>,
): void {
  for (const child of node.toArray()) {
    if (!(child instanceof Y.XmlElement)) continue;
    if (child.nodeName === "wikiDocumentReference") {
      const id = child.getAttribute("documentId");
      if (typeof id === "string" && UUID_RE.test(id)) {
        out.add(id.toLowerCase());
      }
      continue;
    }
    walk(child, out);
  }
}
