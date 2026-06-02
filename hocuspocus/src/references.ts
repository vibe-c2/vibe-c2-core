import * as Y from "yjs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface NodeAttrSelector {
  /** TipTap node name (e.g. `wikiDocumentReference`). */
  nodeName: string;
  /** Attribute that carries the UUID (e.g. `documentId`). */
  attrName: string;
}

/**
 * Generic Y.js TipTap walker that collects UUIDs from atom nodes matching the
 * given `(nodeName, attrName)` selector. Pure function — no I/O, no Binary
 * conversion, no mutation. The persistence layer wraps the result in BSON
 * Binary for Mongo.
 *
 * The walker skips the matched atom node's children — TipTap atom nodes have
 * no meaningful descendants and ProseMirror won't render any, so recursing
 * would only pick up phantom attributes on synthetic children.
 *
 * Malformed UUIDs are silently dropped: a single bad chip must never prevent
 * the document from saving. IDs are normalised to lowercase so case variants
 * dedupe.
 */
export function collectNodeAttrIds(
  node: Y.XmlFragment | Y.XmlElement,
  selector: NodeAttrSelector,
): Set<string> {
  const out = new Set<string>();
  walk(node, selector, out);
  return out;
}

function walk(
  node: Y.XmlFragment | Y.XmlElement,
  selector: NodeAttrSelector,
  out: Set<string>,
): void {
  for (const child of node.toArray()) {
    if (!(child instanceof Y.XmlElement)) continue;
    if (child.nodeName === selector.nodeName) {
      const id = child.getAttribute(selector.attrName);
      if (typeof id === "string" && UUID_RE.test(id)) {
        out.add(id.toLowerCase());
      }
      continue;
    }
    walk(child, selector, out);
  }
}

const DOC_REFERENCE_SELECTOR: NodeAttrSelector = {
  nodeName: "wikiDocumentReference",
  attrName: "documentId",
};

const CREDENTIAL_REFERENCE_SELECTOR: NodeAttrSelector = {
  nodeName: "wikiCredentialReference",
  attrName: "credentialId",
};

const HASH_REFERENCE_SELECTOR: NodeAttrSelector = {
  nodeName: "wikiHashReference",
  attrName: "hashId",
};

/**
 * Walk a Y.js TipTap document and return the deduplicated, lowercase set of
 * `documentId` attributes from every `wikiDocumentReference` atom node.
 * Drives the wiki document → document backlinks index.
 */
export function collectDocReferenceIds(
  node: Y.XmlFragment | Y.XmlElement,
): Set<string> {
  return collectNodeAttrIds(node, DOC_REFERENCE_SELECTOR);
}

/**
 * Walk a Y.js TipTap document and return the deduplicated, lowercase set of
 * `credentialId` attributes from every `wikiCredentialReference` atom node.
 * Drives the credential backlinks index — the inverse mapping that lets the
 * Findings page surface "this credential is referenced in these wiki docs".
 */
export function collectCredentialReferenceIds(
  node: Y.XmlFragment | Y.XmlElement,
): Set<string> {
  return collectNodeAttrIds(node, CREDENTIAL_REFERENCE_SELECTOR);
}

/**
 * Walk a Y.js TipTap document and return the deduplicated, lowercase set of
 * `hashId` attributes from every `wikiHashReference` atom node. Drives the
 * hash backlinks index — the inverse mapping that lets the Findings page
 * surface "this hash is referenced in these wiki docs". Sibling of
 * collectCredentialReferenceIds.
 */
export function collectHashReferenceIds(
  node: Y.XmlFragment | Y.XmlElement,
): Set<string> {
  return collectNodeAttrIds(node, HASH_REFERENCE_SELECTOR);
}
