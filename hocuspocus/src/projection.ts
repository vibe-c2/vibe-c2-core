// The persisted projection of a wiki document body, derived from its Y.js
// state: the plain-text search field, every inverse-reference index, and the
// checklist coverage counters.
//
// persistence.ts derives this on every collaborative save. The rebase route
// (rebase-document.ts) derives the identical shape for pages the Go backend
// creates directly — imports, transfers — so a page that was never opened in
// the editor is indexed exactly as one that was. One derivation, two callers,
// so the two can never disagree about what a body references.

import * as Y from "yjs";
import {
  collectChecklistCoverage,
  collectCredentialReferenceIds,
  collectDocReferenceIds,
  collectFileReferenceIds,
  collectHashReferenceIds,
  collectHostReferenceIds,
  collectImageReferenceIds,
  type ChecklistCoverage,
} from "./references.js";

export interface BodyProjection {
  /** Plain text, block-separated by newlines. The search index field. */
  content: string;
  /** wikiDocumentReference → documentId, lowercase, deduplicated. */
  references: string[];
  credentialReferences: string[];
  hashReferences: string[];
  hostReferences: string[];
  imageReferences: string[];
  fileReferences: string[];
  checklist: ChecklistCoverage;
}

/**
 * Recursively extract plain text from a Y.XmlFragment (TipTap document).
 * Block-level elements are separated by newlines.
 *
 * Atom nodes carry their words in attributes rather than as child text, so a
 * plain walk skips them. An attachment card is the case that matters: a page
 * whose body is four files projected to an empty string, which made the page
 * unfindable by the name of any file on it. Their filenames are emitted here
 * so the search index covers them.
 */
export function extractTextFromFragment(
  node: Y.XmlFragment | Y.XmlElement,
): string {
  const parts: string[] = [];
  for (const child of node.toArray()) {
    if (child instanceof Y.XmlText) {
      parts.push(child.toString());
    } else if (child instanceof Y.XmlElement) {
      const searchable = searchableAttrText(child);
      if (searchable !== "") parts.push(searchable);
      parts.push(extractTextFromFragment(child));
    }
  }
  return parts.filter((part) => part !== "").join("\n").trim();
}

/**
 * The words an atom node contributes to the text projection.
 *
 * Deliberately narrow: a filename and an image's alt text are what somebody
 * would type into search. URLs, ids, sizes and content types are not — they
 * would bloat the index and match nothing anyone looks for.
 */
function searchableAttrText(node: Y.XmlElement): string {
  switch (node.nodeName) {
    case "wikiFile":
      return String(node.getAttribute("filename") ?? "").trim();
    case "image":
      return String(node.getAttribute("alt") ?? "").trim();
    default:
      return "";
  }
}

/**
 * Derive the full projection of a document fragment. An empty fragment
 * yields empty text, empty indexes and a 0/0/0 checklist.
 */
export function deriveProjection(
  fragment: Y.XmlFragment,
): BodyProjection {
  if (fragment.length === 0) {
    return {
      content: "",
      references: [],
      credentialReferences: [],
      hashReferences: [],
      hostReferences: [],
      imageReferences: [],
      fileReferences: [],
      checklist: { total: 0, required: 0, answered: 0 },
    };
  }
  return {
    content: extractTextFromFragment(fragment),
    references: [...collectDocReferenceIds(fragment)],
    credentialReferences: [...collectCredentialReferenceIds(fragment)],
    hashReferences: [...collectHashReferenceIds(fragment)],
    hostReferences: [...collectHostReferenceIds(fragment)],
    imageReferences: [...collectImageReferenceIds(fragment)],
    fileReferences: [...collectFileReferenceIds(fragment)],
    checklist: collectChecklistCoverage(fragment),
  };
}
