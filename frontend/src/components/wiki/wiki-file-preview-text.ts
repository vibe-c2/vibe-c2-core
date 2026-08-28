// Plain-text and Markdown rendering for the attachment preview panel.
//
// These two formats were previewable before this module existed, but only by
// opening a new tab against the backend's ?preview=1 URL — the browser rendered
// them, so nothing was under our control. Rendering them in the panel instead
// keeps the reader on the page and, more importantly, puts them behind the same
// sandbox + CSP as every other format. A Markdown file that links a remote
// image no longer beacons when someone reads it.
//
// Markdown goes through markdown-it, which the project already depends on for
// paste handling. Its config mirrors wiki-markdown-paste.ts — notably
// html: false, so raw HTML in the source is escaped rather than passed through.
// That makes the rendered output structurally ours, with the sandbox and CSP as
// backstops rather than as the only line of defence.

import {
  escapeHtml,
  noteBody,
  type PreviewBody,
} from "./wiki-file-preview-document"

/** Shown for a file with no content, whatever the flavour of text. */
const EMPTY_FILE = "This file is empty."

/** Renders a plain-text file verbatim. Everything is escaped and wrapped in a
 *  <pre>, so the file's own characters can never become markup — a .txt holding
 *  "<script>" shows those eight characters. */
export function renderTextPreview(text: string): PreviewBody {
  return text.trim() === ""
    ? noteBody(EMPTY_FILE)
    : { bodyHtml: `<pre>${escapeHtml(text)}</pre>` }
}

/** Renders Markdown to HTML. Dynamically imported by the caller, so markdown-it
 *  is only pulled in when someone actually opens a .md attachment. */
export async function renderMarkdownPreview(text: string): Promise<PreviewBody> {
  if (text.trim() === "") return noteBody(EMPTY_FILE)

  const { default: MarkdownIt } = await import("markdown-it")

  const md = new MarkdownIt({
    // Escape raw HTML in the source rather than emitting it. The panel's
    // sandbox and CSP would contain it anyway, but a preview has no reason to
    // execute the document's own markup, and defence in depth is cheap here.
    html: false,
    // Bare URLs become links. They cannot navigate inside the sandbox, but they
    // remain readable and selectable, which is the point.
    linkify: true,
    breaks: false,
    typographer: false,
  })

  return { bodyHtml: md.render(text) }
}
