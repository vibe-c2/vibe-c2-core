// Builds the self-contained HTML document that the preview iframe renders.
//
// Converted attachments (docx via mammoth, xlsx via our own table builder)
// arrive as a bare body fragment with no styling — dropped into a srcdoc frame
// as-is they render as unstyled black-on-white text, which looks broken next to
// the rest of the app. The iframe is also style-isolated by design, so the
// app's Tailwind sheet and theme class cannot reach inside it.
//
// This module wraps a fragment in a minimal document that carries its own
// stylesheet and its own copy of the current theme's colours, then routes the
// result through withPreviewCsp() so the network-egress policy is applied
// uniformly to converted documents and to raw HTML attachments alike.

import { withPreviewCsp } from "./wiki-file-preview-csp"

/** Palette per theme. Values mirror the app's own surface/foreground/border
 *  tokens closely enough that the frame reads as part of the page, but are
 *  written out literally: the iframe cannot see the app's CSS custom
 *  properties, so nothing here can be expressed as a var() reference. */
const THEME_COLORS = {
  light: {
    bg: "#ffffff",
    fg: "#18181b",
    muted: "#71717a",
    border: "#e4e4e7",
    headerBg: "#f4f4f5",
    stripe: "#fafafa",
    accent: "#3f3f46",
    jsonKey: "#1d4ed8",
    jsonString: "#15803d",
    jsonNumber: "#b45309",
    jsonLiteral: "#a21caf",
  },
  dark: {
    bg: "#18181b",
    fg: "#e4e4e7",
    muted: "#a1a1aa",
    border: "#3f3f46",
    headerBg: "#27272a",
    stripe: "#1f1f23",
    accent: "#d4d4d8",
    jsonKey: "#93c5fd",
    jsonString: "#86efac",
    jsonNumber: "#fcd34d",
    jsonLiteral: "#f0abfc",
  },
} as const

export type PreviewTheme = keyof typeof THEME_COLORS

/** What a converter produces: the document's content, plus anything the reader
 *  should be told about it. Deliberately *not* a finished document — theming is
 *  applied later by buildPreviewDocument, so toggling light/dark re-frames the
 *  cached body instead of re-fetching and re-parsing the attachment. */
export interface PreviewBody {
  bodyHtml: string
  /** Truncation or fidelity warning shown above the content. */
  notice?: string
  /** Set when bodyHtml is already a complete, self-styled document — the raw
   *  HTML attachment path. Such a document must reach the frame untouched;
   *  wrapping it in our shell would nest a whole document inside a <body> and
   *  discard its own styling. Converted formats leave this unset. */
  verbatim?: boolean
}

/** A short muted line standing in for content — an empty file, a sheet with no
 *  cells, a document whose every element was dropped in conversion. */
export function noteBody(message: string): PreviewBody {
  return { bodyHtml: `<p class="doc-note">${escapeHtml(message)}</p>` }
}

interface PreviewDocumentOptions extends PreviewBody {
  /** Drives the embedded palette. */
  theme: PreviewTheme
  /** Used as the document title; shown by the browser in fullscreen and print. */
  title: string
}

/** Escapes a string for interpolation into HTML text or a double-quoted
 *  attribute. The ampersand replacement must run first or it would re-escape
 *  the entities introduced by the later replacements. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function stylesheet(theme: PreviewTheme): string {
  const c = THEME_COLORS[theme]
  return `
:root { color-scheme: ${theme}; }
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 24px 28px 40px;
  background: ${c.bg};
  color: ${c.fg};
  font: 14px/1.65 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  overflow-wrap: anywhere;
}
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.4em 0 0.5em; }
h1 { font-size: 1.7em; } h2 { font-size: 1.4em; } h3 { font-size: 1.18em; }
p { margin: 0 0 0.85em; }
a { color: ${c.accent}; }
img { max-width: 100%; height: auto; }
ul, ol { padding-left: 1.5em; margin: 0 0 0.85em; }
blockquote {
  margin: 0 0 0.85em; padding: 0.2em 0 0.2em 1em;
  border-left: 3px solid ${c.border}; color: ${c.muted};
}
pre, code { font-family: ui-monospace, "Geist Mono", SFMono-Regular, monospace; font-size: 0.92em; }
pre { overflow-x: auto; padding: 12px; background: ${c.headerBg}; border-radius: 6px; }
/* JSON tokens. Colour is the only signal, so each stays legible against the
   pre background in both themes rather than relying on weight or background. */
.json-key { color: ${c.jsonKey}; }
.json-string { color: ${c.jsonString}; }
.json-number { color: ${c.jsonNumber}; }
.json-boolean, .json-null { color: ${c.jsonLiteral}; }
hr { border: 0; border-top: 1px solid ${c.border}; margin: 1.6em 0; }

/* Tables: shared by docx tables and the sheet renderer. Wrapped in a scroll
   container so a wide sheet scrolls inside the frame instead of forcing the
   whole document sideways. */
.doc-scroll { overflow-x: auto; margin: 0 0 1.4em; }
table { border-collapse: collapse; font-size: 0.93em; }
th, td {
  border: 1px solid ${c.border};
  padding: 5px 9px;
  text-align: left;
  vertical-align: top;
  white-space: pre-wrap;
}
th { background: ${c.headerBg}; font-weight: 600; position: sticky; top: 0; }
tbody tr:nth-child(even) { background: ${c.stripe}; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }

/* Sheet chrome */
.sheet-title {
  margin: 1.8em 0 0.6em;
  font-size: 0.78em;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${c.muted};
}
.sheet-title:first-child { margin-top: 0; }
.doc-note { color: ${c.muted}; font-style: italic; margin: 0 0 1.4em; }
.doc-notice {
  margin: 0 0 1.4em;
  padding: 8px 12px;
  border: 1px solid ${c.border};
  border-radius: 6px;
  background: ${c.headerBg};
  color: ${c.muted};
  font-size: 0.88em;
}
`.trim()
}

/**
 * Wraps a body fragment in a complete, self-contained, CSP-protected document
 * ready to hand to an iframe's srcdoc.
 *
 * The returned string is a full document (doctype through </html>) because
 * srcdoc replaces the frame's entire content — there is no outer page to
 * inherit from.
 */
export function buildPreviewDocument({
  bodyHtml,
  theme,
  title,
  notice,
}: PreviewDocumentOptions): string {
  const noticeHtml =
    notice === undefined ? "" : `<div class="doc-notice">${escapeHtml(notice)}</div>`

  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${stylesheet(theme)}</style>
</head>
<body>${noticeHtml}${bodyHtml}</body>
</html>`

  return withPreviewCsp(doc)
}
