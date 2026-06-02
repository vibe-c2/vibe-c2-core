// Shared client-side file-export primitives for the Findings export actions
// (credentials, hashes). The browser-download mechanics, the format union, and
// the format-agnostic CSV / filename encoders live here. Per-entity column
// selection and JSON shape live in the entity modules (credential-export.ts,
// hash-export.ts), which delegate the mechanical bits back to this file.

export type ExportFormat = "json" | "csv"

export function downloadBlob(
  content: string,
  filename: string,
  mime: string,
): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// RFC 4180-ish CSV from a header row plus pre-projected data rows. A field is
// quoted when it contains a comma, quote, CR, or LF; embedded quotes are
// doubled. null/undefined render as empty. Rows are CRLF-separated. Callers
// own the column selection (which fields, in which order); this only owns the
// escaping so both entity exporters quote identically.
export function encodeCsv(
  header: readonly string[],
  rows: readonly (readonly (string | null | undefined)[])[],
): string {
  return [header, ...rows].map(encodeRow).join("\r\n")
}

function encodeRow(row: readonly (string | null | undefined)[]): string {
  return row.map(encodeCell).join(",")
}

function encodeCell(value: string | null | undefined): string {
  if (value == null) return ""
  const needsQuoting = /[",\r\n]/.test(value)
  if (!needsQuoting) return value
  return `"${value.replace(/"/g, '""')}"`
}

// Date-stamped, slugified download name: `<prefix>-<slug>-<YYYY-MM-DD>.<ext>`.
// `label` is reduced to filename-safe characters; an empty slug falls back to
// "export". The entity modules supply their own `prefix` ("credentials",
// "hashes").
export function buildExportFilename(
  prefix: string,
  label: string,
  ext: ExportFormat,
): string {
  const date = new Date().toISOString().slice(0, 10)
  const safe = label.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  const slug = safe || "export"
  return `${prefix}-${slug}-${date}.${ext}`
}
