// Plain-text extraction from Office attachments, for the MCP agent surface.
//
// An operator can already read a .docx or .xlsx attachment in the wiki: the
// SPA fetches the bytes and renders them client-side. An agent working on the
// same page could not read any of it, which is a lopsided gap — it can edit
// the page but not the evidence attached to it.
//
// This lives in the sidecar rather than being reimplemented in Go because the
// converters already exist here in the ecosystem that has them, and the
// frontend has already made the careful choices. In particular
// read-excel-file, not SheetJS: npm's `xlsx` is pinned at 0.18.5 with two
// unfixed high-severity advisories, and the frontend's xlsx renderer
// documents at length why it is avoided. Feeding hostile spreadsheets from an
// engagement into that parser server-side would be worse than doing it in a
// browser tab.
//
// Text, CSV and Markdown are deliberately NOT handled here. Those are already
// text; sending them through an HTTP round trip to have their own bytes handed
// back would be pure overhead. Go reads them directly.

import type { Express, Request, Response } from "express";
import mammoth from "mammoth";
import readXlsxFile from "read-excel-file/node";
import { readRawBody, requireSignature } from "./internal-auth.js";

// Bounds the upload. Well past anything worth handing to a model, and small
// enough that a hostile attachment cannot make the sidecar buffer without
// limit.
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

// Bounds the OUTPUT. A large spreadsheet flattens to far more text than an
// agent can use, and the caller has its own response budget — cutting here
// keeps a 5 MB workbook from becoming a 5 MB string first.
const MAX_TEXT_CHARS = 200_000;

const DOCX_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type ExtractKind = "docx" | "xlsx";

/** A worksheet reduced to what the flattener needs. */
interface Sheet {
  name: string;
  data: unknown[][];
}

interface ExtractRequestBody {
  filename?: string;
  contentType?: string;
  /** The file, base64-encoded. */
  data?: string;
}

/**
 * Decide what a file is.
 *
 * Content type first, extension second. The backend prefers the
 * client-declared type and only sniffs when it is empty, so plenty of real
 * attachments arrive as application/octet-stream — the extension is the more
 * reliable signal for exactly those.
 */
function kindOf(filename: string, contentType: string): ExtractKind | null {
  if (contentType === DOCX_TYPE) return "docx";
  if (contentType === XLSX_TYPE) return "xlsx";

  const ext = filename.toLowerCase().split(".").pop() ?? "";
  if (ext === "docx") return "docx";
  if (ext === "xlsx") return "xlsx";
  return null;
}

/** One cell as text. Empty cells become empty strings, not "null". */
function cellToText(cell: unknown): string {
  return cell === null || cell === undefined ? "" : String(cell);
}

/**
 * Collapse a workbook into text a model can read: one row per line, cells
 * tab-separated, each sheet under its own heading.
 *
 * Every sheet is included, not just the first. A workbook's later sheets are
 * routinely where the interesting data lives, and silently dropping them would
 * be worse than a long response — the caller already truncates.
 */
function workbookToText(sheets: readonly Sheet[]): string {
  return sheets
    .map((sheet) => {
      const body = sheet.data
        .map((row) => row.map(cellToText).join("\t"))
        .join("\n");
      return `# ${sheet.name}\n${body}`;
    })
    .join("\n\n");
}

async function extract(
  kind: ExtractKind,
  buffer: Buffer,
): Promise<string> {
  if (kind === "docx") {
    // extractRawText, not convertToHtml: the agent wants the words, and HTML
    // would spend its context on markup it cannot act on.
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // read-excel-file v9's default export returns every sheet, not the rows of
  // the first one — `[{ sheet, data }, ...]`. Reading it as rows is the shape
  // mistake this package's own migration notes warn about.
  const sheets = await readXlsxFile(buffer);
  return workbookToText(
    sheets.map((sheet) => ({
      name: sheet.sheet,
      data: sheet.data as unknown as unknown[][],
    })),
  );
}

export function setupExtractApi(app: Express): void {
  app.post(
    "/internal/extract-text",
    readRawBody(MAX_INPUT_BYTES),
    async (req: Request, res: Response) => {
      const rawBody = requireSignature(req, res);
      if (!rawBody) return;

      let parsed: ExtractRequestBody;
      try {
        parsed = JSON.parse(rawBody.toString("utf8")) as ExtractRequestBody;
      } catch {
        res.status(400).json({ error: "malformed JSON" });
        return;
      }

      const filename = parsed.filename ?? "";
      const contentType = parsed.contentType ?? "";
      if (typeof parsed.data !== "string" || parsed.data === "") {
        res.status(400).json({ error: "data field required" });
        return;
      }

      const kind = kindOf(filename, contentType);
      if (!kind) {
        res
          .status(415)
          .json({ error: `no text extractor for ${filename || contentType || "this file"}` });
        return;
      }

      try {
        const buffer = Buffer.from(parsed.data, "base64");
        const text = await extract(kind, buffer);
        const truncated = text.length > MAX_TEXT_CHARS;

        res.status(200).json({
          kind,
          truncated,
          text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text,
        });
      } catch (err) {
        // A corrupt or password-protected document is an ordinary outcome
        // here, not a fault worth a 500 — the caller turns this into
        // something the agent can read and move on from.
        const message = err instanceof Error ? err.message : "extraction failed";
        console.warn(`extract-text (${kind}) failed:`, message);
        res.status(422).json({ error: message });
      }
    },
  );
}
