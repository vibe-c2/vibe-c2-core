// JSON rendering for the attachment preview panel.
//
// A JSON attachment is usually tool output: a scan result, an API response, a
// config dump. Most of it arrives minified, which is unreadable in a <pre> and
// is the whole reason this exists rather than letting JSON fall through to the
// plain-text renderer.
//
// Two things matter beyond pretty-printing. Invalid JSON still gets shown,
// because a truncated capture is exactly the file somebody needs to look at and
// refusing to render it would be the least useful possible response. And every
// value is escaped on the way out, so a string containing markup stays eight
// characters of text rather than becoming part of the document.

import {
  escapeHtml,
  noteBody,
  type PreviewBody,
} from "./wiki-file-preview-document"

const EMPTY_FILE = "This file is empty."

/** Indentation for the re-serialised document. Two spaces keeps deeply nested
 *  API responses from marching off the right edge. */
const INDENT = 2

/** Ceiling on the *formatted* text, which is what the DOM has to carry.
 *  Pretty-printing inflates minified input several times over, so the byte
 *  limit applied before fetching is not a bound on what lands here. Past this
 *  the reader gets the beginning plus a notice, which beats a frozen tab. */
const MAX_FORMATTED_CHARS = 2 * 1024 * 1024

/** Tokens the highlighter colours. Anything unmatched stays default-coloured,
 *  so a gap in the pattern degrades to plain text rather than to broken markup. */
type JsonTokenKind = "key" | "string" | "number" | "boolean" | "null"

/**
 * Renders a JSON file: parsed, re-indented and lightly coloured.
 *
 * Falls back to showing the raw text when it does not parse. That is a
 * deliberate choice rather than an error path — half a JSON file is still
 * evidence, and the notice tells the reader why it looks the way it does.
 */
export function renderJsonPreview(text: string): PreviewBody {
  if (text.trim() === "") return noteBody(EMPTY_FILE)

  const formatted = formatJson(text)
  const { content, truncated } = clamp(formatted.text)

  return {
    bodyHtml: `<pre>${highlightJson(content)}</pre>`,
    notice: combineNotices(formatted.notice, truncationNotice(truncated)),
  }
}

interface FormatResult {
  text: string
  notice?: string
}

/** Re-serialises with indentation, or hands back the original when it will not
 *  parse. JSON.parse is the only validator worth using here: a hand-rolled one
 *  would disagree with the browser about some edge and mislead the reader. */
function formatJson(text: string): FormatResult {
  try {
    return { text: JSON.stringify(JSON.parse(text), null, INDENT) }
  } catch {
    return {
      text,
      notice:
        "This is not valid JSON, so it is shown exactly as stored. " +
        "A truncated or concatenated capture will look like this.",
    }
  }
}

function clamp(text: string): { content: string; truncated: boolean } {
  if (text.length <= MAX_FORMATTED_CHARS) return { content: text, truncated: false }
  return { content: text.slice(0, MAX_FORMATTED_CHARS), truncated: true }
}

function truncationNotice(truncated: boolean): string | undefined {
  return truncated
    ? "Shown to the first 2 MB of formatted output. Download the file for the rest."
    : undefined
}

function combineNotices(...notices: (string | undefined)[]): string | undefined {
  const present = notices.filter((n): n is string => Boolean(n))
  return present.length === 0 ? undefined : present.join(" ")
}

/**
 * Wraps JSON tokens in coloured spans.
 *
 * Escaping happens per token rather than over the whole string, because the
 * spans have to survive it — escaping afterwards would turn our own markup into
 * visible angle brackets. Every branch escapes what it emits, so no path exists
 * where file content reaches the document unescaped.
 */
export function highlightJson(text: string): string {
  // One pass, alternation ordered so strings are consumed before the literals
  // that could otherwise match inside them. A key is a string followed by a
  // colon, which is why the lookahead is part of the string branch rather than
  // a separate rule.
  const pattern = /"(?:\\.|[^"\\])*"(\s*:)?|\b(?:true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g

  let out = ""
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const start = match.index
    out += escapeHtml(text.slice(last, start))
    out += span(kindOf(match[0], match[1] !== undefined), match[0])
    last = start + match[0].length
  }
  return out + escapeHtml(text.slice(last))
}

function kindOf(token: string, isKey: boolean): JsonTokenKind {
  if (token.startsWith('"')) return isKey ? "key" : "string"
  if (token === "null") return "null"
  if (token === "true" || token === "false") return "boolean"
  return "number"
}

function span(kind: JsonTokenKind, token: string): string {
  return `<span class="json-${kind}">${escapeHtml(token)}</span>`
}
