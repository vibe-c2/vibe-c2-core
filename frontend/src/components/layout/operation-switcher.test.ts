import { describe, expect, it } from "vitest"
import { buildPickerRows } from "./operation-picker-rows"

const a = { id: "a", name: "Alpha", description: "" }
const b = { id: "b", name: "Bravo", description: "" }
const c = { id: "c", name: "Charlie", description: "" }

describe("buildPickerRows", () => {
  it("puts recents first with section labels and the rest after", () => {
    const rows = buildPickerRows([c, a], [a, b, c], false)
    expect(rows.map((r) => r.op.id)).toEqual(["c", "a", "b"])
    expect(rows.map((r) => r.section)).toEqual([
      "Recent",
      null,
      "All operations",
    ])
  })

  it("takes the server's name for a recent that is also loaded", () => {
    const stale = { id: "a", name: "Old name", description: "" }
    const rows = buildPickerRows(
      [stale],
      [{ ...a, name: "Alpha (renamed)" }],
      false,
    )
    expect(rows[0].op.name).toBe("Alpha (renamed)")
  })

  it("keeps a recent the server page has not loaded yet", () => {
    const rows = buildPickerRows([c], [a, b], false)
    expect(rows.map((r) => r.op.id)).toEqual(["c", "a", "b"])
  })

  it("ignores recents while searching and when there are none", () => {
    expect(buildPickerRows([c], [a, b], true).map((r) => r.op.id)).toEqual([
      "a",
      "b",
    ])
    expect(buildPickerRows([], [a], false)[0].section).toBeNull()
  })
})
