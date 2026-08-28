import { describe, expect, it } from "vitest"

import { buildSheetsHtml, columnLabel, type SheetInput } from "./wiki-file-preview-xlsx"

/** Builds a sheet of `rows` × `cols` filled with predictable values, used to
 *  push past the truncation caps without hand-writing huge fixtures. */
function bigSheet(name: string, rows: number, cols: number): SheetInput {
  return {
    sheet: name,
    data: Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => `r${r}c${c}`),
    ),
  }
}

describe("columnLabel", () => {
  it("maps the single-letter range", () => {
    expect(columnLabel(0)).toBe("A")
    expect(columnLabel(25)).toBe("Z")
  })

  it("rolls over into two letters the way a spreadsheet does", () => {
    expect(columnLabel(26)).toBe("AA")
    expect(columnLabel(27)).toBe("AB")
    expect(columnLabel(51)).toBe("AZ")
    expect(columnLabel(52)).toBe("BA")
    expect(columnLabel(701)).toBe("ZZ")
    expect(columnLabel(702)).toBe("AAA")
  })
})

describe("buildSheetsHtml", () => {
  it("renders one titled table per sheet", () => {
    const { bodyHtml, notice } = buildSheetsHtml([
      { sheet: "Hosts", data: [["ip", "os"]] },
      { sheet: "Creds", data: [["user"]] },
    ])

    expect(bodyHtml).toContain('<div class="sheet-title">Hosts</div>')
    expect(bodyHtml).toContain('<div class="sheet-title">Creds</div>')
    expect(notice).toBeUndefined()
  })

  it("escapes cell values so document content can never become markup", () => {
    const { bodyHtml } = buildSheetsHtml([
      { sheet: "x", data: [['<img src=x onerror="alert(1)">']] },
    ])

    expect(bodyHtml).not.toContain("<img")
    expect(bodyHtml).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;")
  })

  it("escapes sheet names too", () => {
    const { bodyHtml } = buildSheetsHtml([{ sheet: "<script>", data: [["a"]] }])

    expect(bodyHtml).not.toContain("<script>")
    expect(bodyHtml).toContain("&lt;script&gt;")
  })

  it("right-aligns numbers and leaves text alone", () => {
    const { bodyHtml } = buildSheetsHtml([{ sheet: "s", data: [[42, "42"]] }])

    expect(bodyHtml).toContain('<td class="num">42</td>')
    expect(bodyHtml).toContain("<td>42</td>")
  })

  it("renders booleans and dates legibly", () => {
    const { bodyHtml } = buildSheetsHtml([
      { sheet: "s", data: [[true, false, new Date("2024-03-01T00:00:00.000Z")]] },
    ])

    expect(bodyHtml).toContain("<td>TRUE</td>")
    expect(bodyHtml).toContain("<td>FALSE</td>")
    // Midnight UTC is a date-only cell — the time carries no information.
    expect(bodyHtml).toContain("<td>2024-03-01</td>")
  })

  it("preserves interior blanks so columns stay aligned", () => {
    // Only *trailing* blanks are trimmed. A gap in the middle is real data —
    // collapsing it would shift every later cell into the wrong column.
    const { bodyHtml } = buildSheetsHtml([
      { sheet: "s", data: [["a", null, "c"]] },
    ])

    expect(bodyHtml).toContain("<td>a</td><td></td><td>c</td>")
    expect(bodyHtml).toContain("<th>C</th>")
  })

  it("pads short rows so every row spans the full width", () => {
    const { bodyHtml } = buildSheetsHtml([
      { sheet: "s", data: [["a", "b", "c"], ["only"]] },
    ])

    expect(bodyHtml).toContain("<tr><th>2</th><td>only</td><td></td><td></td></tr>")
  })

  it("keeps a timestamp when the date carries a time component", () => {
    const { bodyHtml } = buildSheetsHtml([
      { sheet: "s", data: [[new Date("2024-03-01T13:45:00.000Z")]] },
    ])

    expect(bodyHtml).toContain("2024-03-01T13:45:00Z")
  })

  it("numbers the rows and letters the columns", () => {
    const { bodyHtml } = buildSheetsHtml([{ sheet: "s", data: [["a", "b"]] }])

    expect(bodyHtml).toContain("<th>A</th><th>B</th>")
    expect(bodyHtml).toContain("<tr><th>1</th>")
  })

  it("drops trailing blank rows and columns rather than rendering the declared range", () => {
    const { bodyHtml } = buildSheetsHtml([
      {
        sheet: "s",
        data: [
          ["a", null, null],
          [null, null, null],
          [null, null, null],
        ],
      },
    ])

    // One surviving row, one surviving column.
    expect(bodyHtml).toContain("<th>A</th>")
    expect(bodyHtml).not.toContain("<th>B</th>")
    expect(bodyHtml).toContain("<tr><th>1</th>")
    expect(bodyHtml).not.toContain("<tr><th>2</th>")
  })

  it("labels a sheet with no content as empty instead of rendering a bare table", () => {
    const { bodyHtml } = buildSheetsHtml([{ sheet: "s", data: [[null, null]] }])

    expect(bodyHtml).toContain('<p class="doc-note">Empty sheet.</p>')
    expect(bodyHtml).not.toContain("<table>")
  })

  it("caps rows per sheet and says so rather than truncating silently", () => {
    const { bodyHtml, notice } = buildSheetsHtml([bigSheet("big", 900, 2)])

    expect(bodyHtml).toContain("<tr><th>500</th>")
    expect(bodyHtml).not.toContain("<tr><th>501</th>")
    expect(notice).toContain("400 rows")
    expect(notice).toContain("Download the file")
  })

  it("caps columns and reports it", () => {
    const { notice } = buildSheetsHtml([bigSheet("wide", 2, 90)])

    expect(notice).toContain("columns beyond the first 60")
  })

  it("caps the number of sheets and reports it", () => {
    const sheets = Array.from({ length: 30 }, (_, i) => bigSheet(`s${i}`, 1, 1))
    const { bodyHtml, notice } = buildSheetsHtml(sheets)

    expect(bodyHtml).toContain('<div class="sheet-title">s24</div>')
    expect(bodyHtml).not.toContain('<div class="sheet-title">s25</div>')
    expect(notice).toContain("5 of 30 sheets not shown")
  })

  it("returns empty markup for a workbook with no sheets", () => {
    expect(buildSheetsHtml([]).bodyHtml).toBe("")
  })
})

describe("buildSheetsHtml with an unnamed sheet", () => {
  it("omits the heading, so the CSV renderer doesn't repeat the filename", () => {
    const { bodyHtml } = buildSheetsHtml([{ sheet: "", data: [["a"]] }])

    expect(bodyHtml).not.toContain("sheet-title")
    expect(bodyHtml).toContain("<table>")
  })

  it("still emits the heading for a sheet that has a name", () => {
    const { bodyHtml } = buildSheetsHtml([{ sheet: "Sheet1", data: [["a"]] }])

    expect(bodyHtml).toContain('<div class="sheet-title">Sheet1</div>')
  })
})
