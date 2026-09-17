// Decides which inline renderer an attachment gets, and fetches + converts the
// bytes for it.
//
// Split out of wiki-file-card.tsx so the card stays about the card. Everything
// here concerns one question: given a content type and a filename, what does the
// preview panel put in its srcdoc, and how does it get there?
//
// PDFs are deliberately absent. They take the other path entirely — an iframe
// pointed at the backend's ?preview=1 URL — because the browser renders them
// natively and there is nothing for us to convert.

import { useEffect, useMemo, useState } from "react"

import {
  buildPreviewDocument,
  type PreviewBody,
  type PreviewTheme,
} from "./wiki-file-preview-document"

/** Formats we render ourselves into the sandboxed frame. */
export type InlinePreviewKind =
  | "html"
  | "docx"
  | "xlsx"
  | "text"
  | "markdown"
  | "csv"
  | "json"
  | "yaml"

/** HTML types we preview by fetching the bytes and rendering them in a
 *  sandboxed <iframe srcdoc>. These stay in the backend's dangerous-types list —
 *  it never serves them inline — but Content-Disposition does not affect a
 *  fetch() body read, so the frontend can still show them safely. */
const HTML_CONTENT_TYPES = new Set<string>(["text/html", "application/xhtml+xml"])

const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

/** Delimited text. text/tab-separated-values is the registered type for .tsv;
 *  application/csv is non-standard but still emitted by some exporters. */
const CSV_CONTENT_TYPES = new Set<string>([
  "text/csv",
  "application/csv",
  "text/tab-separated-values",
])

/** JSON. application/json is the registered type; the others turn up from
 *  older tooling and from JSON-LD documents, which are still JSON. */
const JSON_CONTENT_TYPES = new Set<string>([
  "application/json",
  "text/json",
  "application/ld+json",
])

/** YAML. application/yaml is the registered type as of 2024; the x- spellings
 *  predate it and are still what most tooling emits. */
const YAML_CONTENT_TYPES = new Set<string>([
  "application/yaml",
  "text/yaml",
  "application/x-yaml",
  "text/x-yaml",
])

/** Markdown has a registered type, but plenty of tools still label .md files
 *  text/plain — the extension fallback covers that. */
const MARKDOWN_CONTENT_TYPES = new Set<string>(["text/markdown", "text/x-markdown"])

/** Largest HTML attachment pulled fully into memory for a srcdoc. Self-contained
 *  reports (inlined CSS + data-URI assets) get large quickly, so this sits well
 *  above the typical single-file report; only genuinely huge files fall back to
 *  download so a giant srcdoc can't freeze the tab. */
const MAX_INLINE_HTML_BYTES = 25 * 1024 * 1024

/** Office documents are parsed, not just streamed into a frame, so the ceiling
 *  is lower: a 25 MB workbook expands to far more than 25 MB of live objects
 *  and DOM. Above this the card offers download only. */
const MAX_INLINE_OFFICE_BYTES = 15 * 1024 * 1024

/** Text, Markdown and CSV are rendered into the DOM in full rather than framed
 *  as-is, so the ceiling is lower again: a multi-megabyte <pre> or table is
 *  already an unpleasant amount of layout work. CSV additionally has the table
 *  builder's row cap behind this, but parsing still costs before that applies. */
const MAX_INLINE_TEXT_BYTES = 5 * 1024 * 1024

/** Extension fallback for when MIME sniffing lands on something generic.
 *  The backend identifies types with gabriel-vasile/mimetype, and docx/xlsx are
 *  both ZIP containers — a file that sniffs as application/zip or
 *  application/octet-stream would otherwise lose its preview for no good
 *  reason. */
const EXTENSION_KINDS: Record<string, InlinePreviewKind> = {
  docx: "docx",
  xlsx: "xlsx",
  htm: "html",
  html: "html",
  xhtml: "html",
  txt: "text",
  log: "text",
  md: "markdown",
  markdown: "markdown",
  csv: "csv",
  tsv: "csv",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".")
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase()
}

function limitFor(kind: InlinePreviewKind): number {
  if (kind === "html") return MAX_INLINE_HTML_BYTES
  if (kind === "docx" || kind === "xlsx") return MAX_INLINE_OFFICE_BYTES
  return MAX_INLINE_TEXT_BYTES
}

/**
 * Returns the renderer for this attachment, or null when it has no inline
 * preview (unknown format, or too large to hold in memory).
 *
 * Content type wins; the extension is consulted only when the type is
 * unrecognised, never to override a type the backend positively identified.
 */
export function detectInlinePreviewKind(
  contentType: string,
  filename: string,
  size: number,
): InlinePreviewKind | null {
  const kind =
    kindFromContentType(contentType) ??
    EXTENSION_KINDS[extensionOf(filename)] ??
    // text/plain resolves last so a .md or .csv mislabelled as plain text still
    // reaches its richer renderer via the extension table above. Anything left
    // that the backend called plain text — including a file with no extension —
    // is shown verbatim rather than offered as a download.
    (contentType === "text/plain" ? "text" : undefined)
  if (kind === undefined) return null
  return size <= limitFor(kind) ? kind : null
}

function kindFromContentType(contentType: string): InlinePreviewKind | undefined {
  if (HTML_CONTENT_TYPES.has(contentType)) return "html"
  if (contentType === DOCX_CONTENT_TYPE) return "docx"
  if (contentType === XLSX_CONTENT_TYPE) return "xlsx"
  if (CSV_CONTENT_TYPES.has(contentType)) return "csv"
  if (JSON_CONTENT_TYPES.has(contentType)) return "json"
  if (YAML_CONTENT_TYPES.has(contentType)) return "yaml"
  if (MARKDOWN_CONTENT_TYPES.has(contentType)) return "markdown"
  // text/plain is checked last and deliberately does not short-circuit the
  // extension fallback: sniffers routinely label .md and .csv as text/plain,
  // and those deserve their richer renderer rather than a raw <pre>.
  return undefined
}

export interface RenderedPreviewState {
  /** Complete, CSP-carrying document ready for srcdoc; null until loaded. */
  content: string | null
  /** User-facing failure message; null while pending or on success. */
  error: string | null
}

/**
 * Fetches an attachment and converts it to a preview document.
 *
 * No-ops until `active` (the panel is open and the file has a renderer), then
 * runs once and caches the result for the card's lifetime. Cookie auth rides
 * the same-origin request automatically, exactly as the PDF and download paths
 * do.
 *
 * Converters are imported dynamically, so mammoth (~133 kB gz),
 * read-excel-file (~16 kB gz), markdown-it and Papa Parse stay out of the main
 * chunk and are only fetched when someone actually expands a document of that
 * type.
 */
export function useRenderedPreview(
  url: string,
  kind: InlinePreviewKind | null,
  active: boolean,
  theme: PreviewTheme,
  filename: string,
): RenderedPreviewState {
  const [body, setBody] = useState<PreviewBody | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Conversion depends on the bytes, not on how they are painted — note the
  // absence of `theme` here. Re-parsing a 15 MB workbook to change six colours
  // would be absurd; the memo below re-frames the cached body instead.
  useEffect(() => {
    if (!active || !url || kind === null) return
    if (body !== null || error !== null) return

    let cancelled = false

    void (async () => {
      try {
        const res = await fetch(url, { credentials: "same-origin" })
        if (!res.ok) throw new Error(`Couldn't load preview (HTTP ${res.status}).`)

        const rendered = await renderByKind(res, kind)
        if (!cancelled) setBody(rendered)
      } catch (err: unknown) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Couldn't load preview.")
      }
    })()

    return () => {
      cancelled = true
    }
  }, [active, url, kind, body, error])

  // Framing is a string concat, so following a light/dark toggle costs nothing
  // and needs no refetch.
  const content = useMemo(() => {
    if (body === null) return null
    // A raw HTML attachment styles itself, so theme has no bearing on it.
    if (body.verbatim === true) return body.bodyHtml
    return buildPreviewDocument({ ...body, theme, title: filename })
  }, [body, theme, filename])

  return { content, error }
}

async function renderByKind(
  res: Response,
  kind: InlinePreviewKind,
): Promise<PreviewBody> {
  if (kind === "html") {
    // Raw HTML is the one format we do not re-frame: it arrives as a complete
    // document with its own styling, so it goes into the iframe as-is. Only the
    // CSP is forced in, so it governs its own egress whatever it contains.
    const { withPreviewCsp } = await import("./wiki-file-preview-csp")
    return { bodyHtml: withPreviewCsp(await res.text()), verbatim: true }
  }

  if (
    kind === "text" ||
    kind === "markdown" ||
    kind === "csv" ||
    kind === "json" ||
    kind === "yaml"
  ) {
    return renderTextual(await res.text(), kind)
  }

  const bytes = await res.arrayBuffer()

  if (kind === "docx") {
    const { renderDocxPreview } = await import("./wiki-file-preview-docx")
    return wrapConversionError(
      () => renderDocxPreview(bytes),
      "This file couldn't be read as a Word document.",
    )
  }

  const { renderXlsxPreview } = await import("./wiki-file-preview-xlsx")
  return wrapConversionError(
    () => renderXlsxPreview(bytes),
    "This file couldn't be read as a spreadsheet.",
  )
}

async function renderTextual(
  text: string,
  kind: "text" | "markdown" | "csv" | "json" | "yaml",
): Promise<PreviewBody> {
  if (kind === "yaml") {
    // Nothing to fail: the file is highlighted where it stands rather than
    // parsed, so there is no conversion error to wrap.
    const { renderYamlPreview } = await import("./wiki-file-preview-yaml")
    return renderYamlPreview(text)
  }

  if (kind === "json") {
    // No wrapConversionError: invalid JSON is not a conversion failure here.
    // The renderer shows it verbatim with a notice, because a truncated
    // capture is precisely the file someone needs to look at.
    const { renderJsonPreview } = await import("./wiki-file-preview-json")
    return renderJsonPreview(text)
  }

  if (kind === "csv") {
    const { renderCsvPreview } = await import("./wiki-file-preview-csv")
    return wrapConversionError(
      () => renderCsvPreview(text),
      "This file couldn't be read as delimited text.",
    )
  }

  const { renderMarkdownPreview, renderTextPreview } = await import(
    "./wiki-file-preview-text"
  )
  return kind === "markdown"
    ? renderMarkdownPreview(text)
    : renderTextPreview(text)
}

/** Converter failures are almost always "the bytes aren't really this format"
 *  — a renamed file, a truncated upload, an encrypted document. The library's
 *  own message is rarely meaningful to an operator, so it is replaced with one
 *  that says what to do about it. */
async function wrapConversionError(
  render: () => Promise<PreviewBody>,
  message: string,
): Promise<PreviewBody> {
  try {
    return await render()
  } catch {
    throw new Error(`${message} You can still download it.`)
  }
}
