// YAML rendering for the attachment preview panel.
//
// Unlike JSON, this deliberately does not parse and re-serialise. YAML is
// written to be read: the comments explaining why a setting is what it is, the
// blank lines grouping related keys, the choice of block or flow style. A
// round-trip through any parser discards all of it, so a "prettier" YAML
// preview would show strictly less than the file does. The file is shown as
// stored and the highlighting is laid over the top.
//
// That also means there is nothing to fail. A half-written or invalid document
// still renders, which is the behaviour the JSON renderer has to work for.
//
// Highlighting is line-based rather than one pass over the whole document.
// YAML's structure is per line — a comment runs to the end of its line, a key
// is a key only before its colon — and a global pattern would need to track
// that anyway.

import {
  escapeHtml,
  noteBody,
  type PreviewBody,
} from "./wiki-file-preview-document"

const EMPTY_FILE = "This file is empty."

/** Ceiling on the text the DOM carries. No reformatting happens here, so this
 *  bounds the input directly rather than some inflation of it. */
const MAX_RENDERED_CHARS = 2 * 1024 * 1024

/** Scalars YAML reads as booleans. Broader than JSON's pair because YAML 1.1
 *  accepts these spellings and plenty of tooling still writes them. */
const BOOLEANS = new Set([
  "true",
  "false",
  "yes",
  "no",
  "on",
  "off",
  "True",
  "False",
  "Yes",
  "No",
  "On",
  "Off",
  "TRUE",
  "FALSE",
  "YES",
  "NO",
  "ON",
  "OFF",
])

/** Scalars YAML reads as null, including the bare tilde and an empty value. */
const NULLS = new Set(["null", "Null", "NULL", "~"])

const NUMBER = /^-?(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/

export function renderYamlPreview(text: string): PreviewBody {
  if (text.trim() === "") return noteBody(EMPTY_FILE)

  const truncated = text.length > MAX_RENDERED_CHARS
  const shown = truncated ? text.slice(0, MAX_RENDERED_CHARS) : text

  return {
    bodyHtml: `<pre>${highlightYaml(shown)}</pre>`,
    notice: truncated
      ? "Shown to the first 2 MB. Download the file for the rest."
      : undefined,
  }
}

/** Colours a YAML document. Every branch escapes what it emits, so no path
 *  exists where file content reaches the document as markup. */
export function highlightYaml(text: string): string {
  return text.split("\n").map(highlightLine).join("\n")
}

function highlightLine(line: string): string {
  if (line.trim() === "") return escapeHtml(line)

  const { code, comment } = splitComment(line)
  const rendered = highlightCode(code) + (comment === "" ? "" : span("comment", comment))
  return rendered
}

/**
 * Splits a trailing comment off a line.
 *
 * A `#` only starts a comment outside quotes and at the start of a token — in
 * `url: http://x/#frag` the hash is part of the value, which is why the
 * preceding character matters rather than just the quote state.
 */
export function splitComment(line: string): { code: string; comment: string } {
  let quote: string | null = null

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]

    if (quote !== null) {
      // A doubled quote inside a single-quoted scalar is an escaped quote.
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === "#" && (i === 0 || line[i - 1] === " " || line[i - 1] === "\t")) {
      return { code: line.slice(0, i), comment: line.slice(i) }
    }
  }
  return { code: line, comment: "" }
}

function highlightCode(code: string): string {
  if (code.trim() === "") return escapeHtml(code)

  // Indentation and any sequence dashes lead the line and are structure, not
  // content: "- - name: x" is two nested sequence entries.
  const lead = /^(\s*(?:-\s+)*-?\s*)/.exec(code)?.[1] ?? ""
  const rest = code.slice(lead.length)
  const prefix = lead === "" ? "" : renderLead(lead)

  if (rest === "") return prefix

  // Document markers stand alone.
  if (rest === "---" || rest === "...") return prefix + span("marker", rest)

  const key = matchKey(rest)
  if (key === null) return prefix + highlightScalar(rest)

  return (
    prefix +
    span("key", key.name) +
    escapeHtml(key.separator) +
    (key.value === "" ? "" : highlightScalar(key.value))
  )
}

/** Renders leading indent and sequence dashes, colouring only the dashes. */
function renderLead(lead: string): string {
  return lead
    .split("")
    .map((ch) => (ch === "-" ? span("marker", ch) : escapeHtml(ch)))
    .join("")
}

interface KeyMatch {
  name: string
  /** The colon plus whatever whitespace followed it. */
  separator: string
  value: string
}

/**
 * Recognises `key:` at the start of the remainder.
 *
 * The colon must be followed by whitespace or end the line, which is what
 * separates a mapping key from a plain scalar that happens to contain a colon,
 * such as a bare URL or a timestamp.
 */
export function matchKey(rest: string): KeyMatch | null {
  const match = /^((?:"(?:\\.|[^"])*"|'(?:''|[^'])*'|[^:\s][^:]*?))(:(?:\s+|$))([\s\S]*)$/.exec(
    rest,
  )
  if (match === null) return null
  return { name: match[1], separator: match[2], value: match[3] }
}

function highlightScalar(value: string): string {
  const trimmed = value.trim()
  if (trimmed === "") return escapeHtml(value)

  // Preserve the exact spacing around the scalar.
  const lead = value.slice(0, value.indexOf(trimmed))
  const tail = value.slice(lead.length + trimmed.length)
  return escapeHtml(lead) + span(kindOf(trimmed), trimmed) + escapeHtml(tail)
}

type YamlTokenKind =
  | "key"
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "comment"
  | "anchor"
  | "marker"

function kindOf(token: string): YamlTokenKind {
  if (token.startsWith('"') || token.startsWith("'")) return "string"
  if (token.startsWith("&") || token.startsWith("*") || token.startsWith("!")) {
    return "anchor"
  }
  if (BOOLEANS.has(token)) return "boolean"
  if (NULLS.has(token)) return "null"
  if (NUMBER.test(token)) return "number"
  // An unquoted scalar is still a string as far as the reader is concerned.
  return "string"
}

function span(kind: YamlTokenKind, token: string): string {
  return `<span class="yaml-${kind}">${escapeHtml(token)}</span>`
}
