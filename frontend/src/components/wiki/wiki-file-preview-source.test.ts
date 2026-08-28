import { describe, expect, it } from "vitest"

import { detectInlinePreviewKind } from "./wiki-file-preview-source"

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

const SMALL = 1024
const MB = 1024 * 1024

describe("detectInlinePreviewKind", () => {
  it("recognises office types by content type", () => {
    expect(detectInlinePreviewKind(DOCX, "report.docx", SMALL)).toBe("docx")
    expect(detectInlinePreviewKind(XLSX, "hosts.xlsx", SMALL)).toBe("xlsx")
  })

  it("recognises html and xhtml", () => {
    expect(detectInlinePreviewKind("text/html", "r.html", SMALL)).toBe("html")
    expect(detectInlinePreviewKind("application/xhtml+xml", "r.xhtml", SMALL)).toBe("html")
  })

  it("falls back to the extension when sniffing lands on a generic type", () => {
    // docx and xlsx are ZIP containers, so a sniffer can legitimately report
    // application/zip. Losing the preview for that reason would be a poor trade.
    expect(detectInlinePreviewKind("application/zip", "report.docx", SMALL)).toBe("docx")
    expect(
      detectInlinePreviewKind("application/octet-stream", "hosts.xlsx", SMALL),
    ).toBe("xlsx")
  })

  it("matches extensions case-insensitively", () => {
    expect(detectInlinePreviewKind("application/zip", "REPORT.DOCX", SMALL)).toBe("docx")
  })

  it("returns null for formats with no inline renderer", () => {
    expect(detectInlinePreviewKind("application/pdf", "a.pdf", SMALL)).toBeNull()
    expect(detectInlinePreviewKind("application/zip", "archive.zip", SMALL)).toBeNull()
    expect(detectInlinePreviewKind("application/zip", "noextension", SMALL)).toBeNull()
  })

  it("recognises text, markdown and delimited types", () => {
    expect(detectInlinePreviewKind("text/plain", "notes.txt", SMALL)).toBe("text")
    expect(detectInlinePreviewKind("text/markdown", "readme.md", SMALL)).toBe("markdown")
    expect(detectInlinePreviewKind("text/csv", "hosts.csv", SMALL)).toBe("csv")
    expect(
      detectInlinePreviewKind("text/tab-separated-values", "hosts.tsv", SMALL),
    ).toBe("csv")
  })

  it("prefers the richer renderer when a sniffer flattens md/csv to text/plain", () => {
    // The common real-world case: the backend sees plain text and says so, but
    // the extension carries the real intent.
    expect(detectInlinePreviewKind("text/plain", "readme.md", SMALL)).toBe("markdown")
    expect(detectInlinePreviewKind("text/plain", "hosts.csv", SMALL)).toBe("csv")
    expect(detectInlinePreviewKind("text/plain", "scan.tsv", SMALL)).toBe("csv")
  })

  it("falls back to verbatim text for plain text with no useful extension", () => {
    expect(detectInlinePreviewKind("text/plain", "noextension", SMALL)).toBe("text")
    expect(detectInlinePreviewKind("text/plain", "nmap.out", SMALL)).toBe("text")
  })

  it("treats .log as text even when sniffed as something generic", () => {
    expect(detectInlinePreviewKind("application/octet-stream", "beacon.log", SMALL)).toBe(
      "text",
    )
  })

  it("now covers .xhtml by extension as well as by type", () => {
    expect(detectInlinePreviewKind("application/octet-stream", "r.xhtml", SMALL)).toBe(
      "html",
    )
  })

  it("holds text-ish formats to a tighter size ceiling than office or html", () => {
    expect(detectInlinePreviewKind("text/plain", "a.txt", 5 * MB)).toBe("text")
    expect(detectInlinePreviewKind("text/plain", "a.txt", 5 * MB + 1)).toBeNull()
    expect(detectInlinePreviewKind("text/csv", "a.csv", 5 * MB + 1)).toBeNull()
    expect(detectInlinePreviewKind("text/markdown", "a.md", 5 * MB + 1)).toBeNull()
  })

  it("does not let a misleading extension override a positively identified type", () => {
    // The content type says spreadsheet; the name says otherwise. Trust the type.
    expect(detectInlinePreviewKind(XLSX, "actually.docx", SMALL)).toBe("xlsx")
  })

  it("refuses office documents above the parse ceiling", () => {
    expect(detectInlinePreviewKind(DOCX, "big.docx", 15 * MB)).toBe("docx")
    expect(detectInlinePreviewKind(DOCX, "big.docx", 15 * MB + 1)).toBeNull()
  })

  it("allows html up to a larger ceiling, since it is framed rather than parsed", () => {
    expect(detectInlinePreviewKind("text/html", "r.html", 25 * MB)).toBe("html")
    expect(detectInlinePreviewKind("text/html", "r.html", 25 * MB + 1)).toBeNull()
    // An office file that size is well past its own, lower limit.
    expect(detectInlinePreviewKind(DOCX, "r.docx", 25 * MB)).toBeNull()
  })
})
