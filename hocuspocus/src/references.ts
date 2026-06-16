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

const HOST_REFERENCE_SELECTOR: NodeAttrSelector = {
  nodeName: "wikiHostReference",
  attrName: "hostId",
};

// The wikiFile atom carries the attachment's UUID directly in its `fileId`
// attribute (see wiki-schema.ts), so file references collect exactly like the
// doc/credential/hash chips above.
const FILE_REFERENCE_SELECTOR: NodeAttrSelector = {
  nodeName: "wikiFile",
  attrName: "fileId",
};

// The `image` node has no clean id attribute — only `src`, which holds the
// canonical upload URL (/api/v1/wiki/images/<uuid>). We extract the UUID out
// of that URL. MUST stay in lockstep with the URL the upload endpoint returns
// (core/pkg/controller/wiki_image_controller.go) — the Go sweeper deletes any
// image blob whose id appears in no document's image_references array, so a
// drift here means live images get garbage-collected.
const IMAGE_NODE_NAME = "image";
const IMAGE_SRC_ID_RE =
  /\/api\/v1\/wiki\/images\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

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

/**
 * Walk a Y.js TipTap document and return the deduplicated, lowercase set of
 * `hostId` attributes from every `wikiHostReference` atom node. Drives the host
 * backlinks index — the inverse mapping that lets a host surface "this host is
 * referenced in these wiki docs". Sibling of collectCredentialReferenceIds.
 */
export function collectHostReferenceIds(
  node: Y.XmlFragment | Y.XmlElement,
): Set<string> {
  return collectNodeAttrIds(node, HOST_REFERENCE_SELECTOR);
}

/**
 * Walk a Y.js TipTap document and return the deduplicated, lowercase set of
 * `fileId` attributes from every `wikiFile` atom node. Drives the wiki file
 * attachment garbage collector: the Go sweeper keeps a file's blob alive only
 * while its id appears in some document's file_references array.
 */
export function collectFileReferenceIds(
  node: Y.XmlFragment | Y.XmlElement,
): Set<string> {
  return collectNodeAttrIds(node, FILE_REFERENCE_SELECTOR);
}

/**
 * Walk a Y.js TipTap document and return the deduplicated, lowercase set of
 * image attachment UUIDs referenced by `image` nodes. Unlike the chip
 * collectors, the id is parsed out of the node's `src` URL rather than read
 * from a dedicated attribute. Images sourced from external URLs (no
 * /api/v1/wiki/images/ prefix) contribute nothing. Drives the wiki image
 * garbage collector, mirroring collectFileReferenceIds.
 */
export function collectImageReferenceIds(
  node: Y.XmlFragment | Y.XmlElement,
): Set<string> {
  const out = new Set<string>();
  walkImage(node, out);
  return out;
}

function walkImage(
  node: Y.XmlFragment | Y.XmlElement,
  out: Set<string>,
): void {
  for (const child of node.toArray()) {
    if (!(child instanceof Y.XmlElement)) continue;
    if (child.nodeName === IMAGE_NODE_NAME) {
      const src = child.getAttribute("src");
      if (typeof src === "string") {
        const match = IMAGE_SRC_ID_RE.exec(src);
        if (match && UUID_RE.test(match[1])) {
          out.add(match[1].toLowerCase());
        }
      }
      continue;
    }
    walkImage(child, out);
  }
}

// ---------------------------------------------------------------------------
// Checklist coverage
// ---------------------------------------------------------------------------

// The block node a checklist item renders as (see the frontend
// wiki-checklist-item-node extension). Each item carries a `required` boolean
// attribute and an optional `state` attribute, plus a content region holding
// the answer. Coverage is derived here — there is no separate answers store.
const CHECKLIST_ITEM_NODE = "wikiChecklistItem";

// Leaf/atom nodes that count as a real answer even when they contain no text —
// e.g. an answer that is a single reference chip with no prose. Any of these
// inside an item's content region marks the item answered.
const ANSWER_BEARING_LEAF_NODES = new Set<string>([
  "wikiHostReference",
  "wikiCredentialReference",
  "wikiHashReference",
  "wikiFile",
  IMAGE_NODE_NAME,
]);

export interface ChecklistCoverage {
  /** Total number of checklist items, required or not. A non-zero `total` is
   * the marker that "this document has a checklist" and drives whether the
   * per-document coverage bar renders at all. */
  total: number;
  /** Number of items whose `required` attribute is truthy. Surfaced as a
   * secondary "N required" hint; not the coverage-bar denominator. */
  required: number;
  /**
   * Number of items (required or not) whose derived state is answered or
   * not_applicable. Flagged-but-unanswered and unanswered items are excluded —
   * this is the numerator of the per-document coverage bar, over `total`.
   */
  answered: number;
}

type ItemState = "unanswered" | "answered" | "not_applicable" | "flagged";

/**
 * Walk a Y.js TipTap document and tally checklist coverage from every
 * `wikiChecklistItem` block node. Pure function — no I/O. Returns all-zero for
 * documents with no checklist items, so it is a cheap no-op on ordinary wiki
 * pages. Drives WikiDocument.checklistTotal / .checklistRequired / .checklistAnswered.
 *
 * Counting rule: every item contributes to `total`; it additionally contributes
 * to `required` when its `required` attribute is truthy, and to `answered` when
 * its derived state is `answered` or `not_applicable` (regardless of required).
 * `flagged` and `unanswered` never count toward `answered`.
 */
export function collectChecklistCoverage(
  node: Y.XmlFragment | Y.XmlElement,
): ChecklistCoverage {
  const cov: ChecklistCoverage = { total: 0, required: 0, answered: 0 };
  walkChecklist(node, cov);
  return cov;
}

function walkChecklist(
  node: Y.XmlFragment | Y.XmlElement,
  cov: ChecklistCoverage,
): void {
  for (const child of node.toArray()) {
    if (!(child instanceof Y.XmlElement)) continue;
    if (child.nodeName === CHECKLIST_ITEM_NODE) {
      // Items don't nest — do not recurse into the answer region looking for
      // more items (an answer may itself contain blocks, never checklist items).
      cov.total += 1;
      if (isTruthyAttr(child.getAttribute("required"))) cov.required += 1;
      const state = deriveItemState(child);
      if (state === "answered" || state === "not_applicable") {
        cov.answered += 1;
      }
      continue;
    }
    walkChecklist(child, cov);
  }
}

/**
 * Derive an item's coverage state. An explicit `state` attribute the operator
 * toggled (`not_applicable` / `flagged`) wins; otherwise the state is inferred
 * from the answer region — `answered` when it holds content, else `unanswered`.
 */
function deriveItemState(item: Y.XmlElement): ItemState {
  const explicit = item.getAttribute("state");
  if (explicit === "not_applicable") return "not_applicable";
  if (explicit === "flagged") return "flagged";
  return itemHasAnswer(item) ? "answered" : "unanswered";
}

/**
 * True when a checklist item's content region holds a real answer: any
 * non-whitespace text, or any answer-bearing leaf node (a reference chip,
 * attachment, or image). An item containing only an empty paragraph reads as
 * unanswered.
 */
function itemHasAnswer(node: Y.XmlElement): boolean {
  for (const child of node.toArray()) {
    if (child instanceof Y.XmlText) {
      if (child.toString().trim().length > 0) return true;
      continue;
    }
    if (!(child instanceof Y.XmlElement)) continue;
    if (ANSWER_BEARING_LEAF_NODES.has(child.nodeName)) return true;
    if (itemHasAnswer(child)) return true;
  }
  return false;
}

/**
 * Normalise a Y.js attribute to a boolean. TipTap may persist a boolean
 * attribute as a real boolean or, after an HTML round-trip, as the string
 * "true" — accept either.
 */
function isTruthyAttr(value: unknown): boolean {
  return value === true || value === "true";
}
