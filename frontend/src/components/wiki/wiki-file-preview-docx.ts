// DOCX → HTML conversion for the attachment preview panel.
//
// mammoth converts WordprocessingML to a semantic HTML fragment (headings,
// lists, tables, inline images as data: URIs). It deliberately does not attempt
// pixel fidelity — no page layout, no headers/footers, no columns — which is
// the right trade for a preview: the output is clean, predictable markup we can
// style to match the app instead of a wall of absolutely-positioned spans.
//
// Two properties make it the right fit for this panel specifically:
//   1. It returns an HTML *string*, so it drops into the existing sandboxed
//      srcdoc iframe with no new containment story. Libraries that render into
//      a live DOM node would have to run inside our own origin.
//   2. Embedded images become data: URIs, which the preview CSP allows, while
//      externally-linked images keep their remote URL and are therefore blocked
//      by that same policy rather than beaconing.
//
// The library is ~133 kB gzipped, so it is imported dynamically and only when a
// docx preview is actually expanded — it must never reach the main chunk.

import {
  escapeHtml,
  noteBody,
  type PreviewBody,
} from "./wiki-file-preview-document"

/**
 * Converts docx bytes into preview content.
 *
 * Throws on a corrupt or non-docx payload; the caller surfaces that as the
 * panel's error state. A document that converts to empty markup is not an
 * error — it falls back to extracted plain text, and only an empty extraction
 * produces the "no readable content" note.
 */
export async function renderDocxPreview(bytes: ArrayBuffer): Promise<PreviewBody> {
  const mammoth = await import("mammoth")

  const html = (await mammoth.convertToHtml({ arrayBuffer: bytes })).value.trim()
  if (html !== "") return { bodyHtml: html }

  // Nothing survived conversion — try plain text before giving up, so a
  // document built entirely from unsupported constructs still shows its words.
  const text = (await mammoth.extractRawText({ arrayBuffer: bytes })).value.trim()
  if (text === "") return noteBody("This document has no readable content.")

  return {
    bodyHtml: `<pre>${escapeHtml(text)}</pre>`,
    notice:
      "Formatting could not be preserved for this document — showing extracted text.",
  }
}
