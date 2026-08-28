// XLSX → HTML conversion for the attachment preview panel.
//
// Unlike the docx path, nothing here renders markup that came out of the
// document. read-excel-file hands back plain cell *values*; we build the table
// ourselves and escape every value on the way in. That makes this the safest
// renderer in the panel — there is no attacker-authored markup at any point,
// only text placed into a structure we control.
//
// It also sidesteps the SheetJS trap. npm's `xlsx` is pinned at 0.18.5
// (published 2022-03-24) and carries two unfixed high-severity advisories —
// GHSA-4r6h-8v6p-xvw6 (prototype pollution) and GHSA-5pgg-2g8v-p4x9 (ReDoS) —
// because the maintainers publish fixes only to their own CDN. Feeding hostile
// spreadsheets to a known-vulnerable parser is not a trade worth making on this
// platform. read-excel-file is MIT, actively published, audits clean, and is
// ~13 kB gzipped against SheetJS's ~308 kB.
//
// What is lost versus a full spreadsheet component: cell formatting, colours,
// merged-cell geometry, charts, and formulas (cached results are shown, not the
// formula text). For a preview that is an acceptable trade; anyone needing the
// real thing downloads the file.

import {
  escapeHtml,
  noteBody,
  type PreviewBody,
} from "./wiki-file-preview-document"

/** Caps that keep a hostile or merely enormous workbook from locking up the
 *  operator's tab. A spreadsheet claiming a million rows is a denial-of-service
 *  vector against the person opening it, and this panel lives inside a
 *  collaboratively-edited wiki page — a frozen tab costs unsaved work, not just
 *  a reload. Exceeding any cap is reported in the document, never silently. */
const MAX_SHEETS = 25
const MAX_ROWS_PER_SHEET = 500
const MAX_COLUMNS = 60

/** Mirrors read-excel-file's Row type without importing it, so this module's
 *  pure half stays testable without pulling the library in. Values arrive from
 *  an untrusted file, so they are narrowed rather than asserted. */
type CellInput = unknown
type RowInput = readonly CellInput[]

export interface SheetInput {
  /** Sheet name, shown as a heading above the table. Pass "" to omit the
   *  heading — used by the CSV renderer, where there is only ever one table and
   *  a title would just repeat the filename already shown on the card. */
  sheet: string
  data: readonly RowInput[]
}

export interface SheetsHtmlResult {
  bodyHtml: string
  /** Human-readable summary of what was dropped, or undefined when nothing was. */
  notice?: string
}

/** Spreadsheet column label for a zero-based index: 0 → A, 25 → Z, 26 → AA. */
export function columnLabel(index: number): string {
  let label = ""
  let n = index
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  }
  return label
}

/** Renders one cell value as display text. Returns the text plus whether it
 *  should be right-aligned, which is how a spreadsheet signals "this is a
 *  number" without us having to restyle per cell. */
function formatCell(value: CellInput): { text: string; numeric: boolean } {
  if (value === null || value === undefined) return { text: "", numeric: false }
  if (typeof value === "number") {
    return { text: Number.isFinite(value) ? String(value) : "", numeric: true }
  }
  if (typeof value === "boolean") return { text: value ? "TRUE" : "FALSE", numeric: false }
  if (value instanceof Date) {
    // Trim the time component when it carries no information — date-only cells
    // are the common case and "2024-03-01" reads better than a full timestamp.
    const iso = value.toISOString()
    const text = iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.replace(".000Z", "Z")
    return { text, numeric: false }
  }
  return { text: String(value), numeric: false }
}

/** True when a row carries no content at all — trailing empties are extremely
 *  common in exported sheets and rendering them wastes the whole panel. */
function isBlankRow(row: RowInput): boolean {
  return row.every((cell) => formatCell(cell).text === "")
}

/** Drops trailing blank rows, then trailing blank columns, so the rendered
 *  table matches the sheet's actual used range rather than its declared one. */
function trimSheet(data: readonly RowInput[]): RowInput[] {
  const rows = [...data]
  while (rows.length > 0 && isBlankRow(rows[rows.length - 1])) rows.pop()

  let width = 0
  for (const row of rows) {
    for (let i = row.length - 1; i >= 0; i--) {
      if (formatCell(row[i]).text !== "") {
        width = Math.max(width, i + 1)
        break
      }
    }
  }
  return rows.map((row) => row.slice(0, width))
}

/**
 * Builds the body markup for a whole workbook. Pure — no library, no DOM — so
 * the truncation and escaping rules are unit-testable on their own.
 */
export function buildSheetsHtml(sheets: readonly SheetInput[]): SheetsHtmlResult {
  const dropped: string[] = []

  const visible = sheets.slice(0, MAX_SHEETS)
  if (sheets.length > visible.length) {
    dropped.push(`${sheets.length - visible.length} of ${sheets.length} sheets not shown`)
  }

  const parts: string[] = []
  let rowsTruncated = 0
  let colsTruncated = 0

  for (const sheet of visible) {
    if (sheet.sheet !== "") {
      parts.push(`<div class="sheet-title">${escapeHtml(sheet.sheet)}</div>`)
    }

    const trimmed = trimSheet(sheet.data)
    if (trimmed.length === 0) {
      parts.push('<p class="doc-note">Empty sheet.</p>')
      continue
    }

    const rows = trimmed.slice(0, MAX_ROWS_PER_SHEET)
    if (trimmed.length > rows.length) rowsTruncated += trimmed.length - rows.length

    const fullWidth = rows.reduce((max, row) => Math.max(max, row.length), 0)
    const width = Math.min(fullWidth, MAX_COLUMNS)
    if (fullWidth > width) colsTruncated = Math.max(colsTruncated, fullWidth - width)

    const header = Array.from(
      { length: width },
      (_, i) => `<th>${columnLabel(i)}</th>`,
    ).join("")

    const body = rows
      .map((row, rowIndex) => {
        const cells = Array.from({ length: width }, (_, colIndex) => {
          const { text, numeric } = formatCell(row[colIndex])
          return `<td${numeric ? ' class="num"' : ""}>${escapeHtml(text)}</td>`
        }).join("")
        return `<tr><th>${rowIndex + 1}</th>${cells}</tr>`
      })
      .join("")

    parts.push(
      `<div class="doc-scroll"><table><thead><tr><th></th>${header}</tr></thead>` +
        `<tbody>${body}</tbody></table></div>`,
    )
  }

  if (rowsTruncated > 0) dropped.push(`${rowsTruncated} rows beyond the first ${MAX_ROWS_PER_SHEET} per sheet`)
  if (colsTruncated > 0) dropped.push(`columns beyond the first ${MAX_COLUMNS}`)

  return {
    bodyHtml: parts.join(""),
    notice:
      dropped.length === 0
        ? undefined
        : `Preview truncated — ${dropped.join("; ")}. Download the file to see everything.`,
  }
}

/**
 * Parses xlsx bytes into preview content.
 *
 * Throws on a payload read-excel-file cannot parse; the caller renders that as
 * the panel's error state.
 */
export async function renderXlsxPreview(bytes: ArrayBuffer): Promise<PreviewBody> {
  // Subpath import is mandatory: the package declares an `exports` map with no
  // "." entry, so the bare specifier does not resolve under bundler resolution.
  const { default: readXlsxFile } = await import("read-excel-file/browser")

  const sheets = await readXlsxFile(bytes)
  const { bodyHtml, notice } = buildSheetsHtml(sheets)

  return bodyHtml === ""
    ? noteBody("This workbook has no sheets.")
    : { bodyHtml, notice }
}
