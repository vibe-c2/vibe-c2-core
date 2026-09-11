import { describe, expect, it } from "vitest"
import {
  clipboardFileShortfall,
  countClipboardFileHints,
} from "@/components/wiki/wiki-clipboard-files"

// Only the three surfaces the counter reads are needed, so a literal stands
// in for DataTransfer rather than dragging a DOM environment into a suite
// that has none.
function clipboard(opts: {
  items?: Array<{ kind: string }>
  files?: number
  uriList?: string
}): DataTransfer {
  return {
    items: (opts.items ?? []) as unknown as DataTransferItemList,
    files: { length: opts.files ?? 0 } as unknown as FileList,
    getData: (type: string) => (type === "text/uri-list" ? (opts.uriList ?? "") : ""),
  } as unknown as DataTransfer
}

describe("countClipboardFileHints", () => {
  it("counts file entries in items", () => {
    const data = clipboard({
      items: [{ kind: "file" }, { kind: "file" }, { kind: "string" }],
    })
    expect(countClipboardFileHints(data)).toBe(2)
  })

  // The reported failure: one File materialises for a selection the uri-list
  // still describes in full. Taking the largest of the three surfaces is what
  // lets the shortfall be seen at all.
  it("trusts the uri-list when it describes more than the files list", () => {
    const data = clipboard({
      items: [{ kind: "file" }],
      files: 1,
      uriList: "file:///a.png\nfile:///b.png\nfile:///c.png",
    })
    expect(countClipboardFileHints(data)).toBe(3)
  })

  it("ignores uri-list comments and blank lines", () => {
    const data = clipboard({ uriList: "# a comment\nfile:///a.png\n\nfile:///b.png\n" })
    expect(countClipboardFileHints(data)).toBe(2)
  })

  it("returns 0 for an empty clipboard", () => {
    expect(countClipboardFileHints(null)).toBe(0)
    expect(countClipboardFileHints(clipboard({}))).toBe(0)
  })
})

describe("clipboardFileShortfall", () => {
  it("reports what the clipboard promised but did not deliver", () => {
    const data = clipboard({
      items: [{ kind: "file" }],
      files: 1,
      uriList: "file:///a.png\nfile:///b.png\nfile:///c.png\nfile:///d.png\nfile:///e.png",
    })
    expect(clipboardFileShortfall(data, 1)).toBe(4)
  })

  it("is silent when every file arrived", () => {
    const data = clipboard({
      items: [{ kind: "file" }, { kind: "file" }],
      files: 2,
      uriList: "file:///a.png\nfile:///b.png",
    })
    expect(clipboardFileShortfall(data, 2)).toBe(0)
  })

  // Pasting a link populates text/uri-list too. Warning about "missing files"
  // there would be a false alarm on one of the most common pastes there is,
  // which is why a shortfall needs at least one file to have come through.
  it("is silent when the paste carried no files at all", () => {
    const data = clipboard({ uriList: "https://example.com/page" })
    expect(clipboardFileShortfall(data, 0)).toBe(0)
  })

  it("is silent when more files arrived than were advertised", () => {
    const data = clipboard({ files: 3 })
    expect(clipboardFileShortfall(data, 3)).toBe(0)
  })
})
