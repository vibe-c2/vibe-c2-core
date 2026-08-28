// CSV / TSV rendering for the attachment preview panel.
//
// Delimited text is the most common tabular artefact in an engagement — tool
// output, host lists, credential dumps, exported findings — and it shares the
// whole back half of the spreadsheet path: the same escaped-table builder, the
// same row/column caps, the same truncation notice. Only the parsing differs.
//
// Papa Parse rather than a hand-rolled split(","): quoted fields containing
// commas, embedded newlines inside quotes, doubled quote-escapes, BOMs and
// mixed line endings are all easy to get subtly wrong, and getting them wrong
// means silently misaligning a client's data. It is MIT, ~7 kB gzipped, audits
// clean, and is dynamically imported so it only loads when a delimited file is
// actually opened.

import { noteBody, type PreviewBody } from "./wiki-file-preview-document"
import { buildSheetsHtml } from "./wiki-file-preview-xlsx"

/**
 * Parses delimited text into preview content.
 *
 * The delimiter is auto-detected, so .tsv and semicolon-separated exports work
 * without a separate code path.
 */
export async function renderCsvPreview(text: string): Promise<PreviewBody> {
  if (text.trim() === "") return noteBody("This file is empty.")

  const { parse } = await import("papaparse")

  const result = parse<string[]>(text, {
    // Rows as arrays, not objects: the first line is data until proven
    // otherwise, and guessing at a header would misrepresent files that lack one.
    header: false,
    // Auto-detect , vs \t vs ; — one path covers csv, tsv and European exports.
    delimiter: "",
    // Values stay strings. Coercion would turn "007" into 7 and mangle IDs,
    // hashes, version strings and zero-padded fields — actively wrong for a
    // preview whose whole job is showing what the file really contains.
    dynamicTyping: false,
    // Blank lines are kept; trailing ones are trimmed downstream by the table
    // builder, and interior ones are real structure worth showing.
    skipEmptyLines: false,
  })

  // A single unnamed sheet: the filename is already on the card above, so a
  // heading here would only repeat it.
  const { bodyHtml, notice } = buildSheetsHtml([{ sheet: "", data: result.data }])

  return {
    bodyHtml,
    notice: combineNotices(notice, parseNotice(result.errors.length)),
  }
}

/** Papa Parse reports malformed rows (wrong field count, unterminated quote)
 *  without failing the whole parse. Those rows still render — usually the file
 *  is simply ragged — but the reader deserves to know the parse was imperfect
 *  rather than silently trusting a misaligned table. */
function parseNotice(errorCount: number): string | undefined {
  if (errorCount === 0) return undefined
  const rows = errorCount === 1 ? "1 row" : `${errorCount} rows`
  return `${rows} could not be parsed cleanly and may be misaligned.`
}

function combineNotices(...notices: (string | undefined)[]): string | undefined {
  const present = notices.filter((n): n is string => n !== undefined)
  return present.length === 0 ? undefined : present.join(" ")
}
