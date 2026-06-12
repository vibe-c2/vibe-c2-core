import { describe, expect, test } from "vitest"
import { toggleSort, type DataTableSort } from "./data-table-sort"

type Field = "NAME" | "USERNAME" | "CREATED_AT"

describe("toggleSort", () => {
  test("activates an inactive column ascending by default", () => {
    // Arrange
    const current: DataTableSort<Field> = {
      field: "CREATED_AT",
      direction: "DESC",
    }

    // Act
    const next = toggleSort(current, "NAME")

    // Assert
    expect(next).toEqual({ field: "NAME", direction: "ASC" })
  })

  test("activates an inactive column in its preferred initial direction", () => {
    const current: DataTableSort<Field> = { field: "NAME", direction: "ASC" }

    const next = toggleSort(current, "CREATED_AT", "DESC")

    expect(next).toEqual({ field: "CREATED_AT", direction: "DESC" })
  })

  test("flips direction when clicking the active column", () => {
    const current: DataTableSort<Field> = { field: "NAME", direction: "ASC" }

    const next = toggleSort(current, "NAME")

    expect(next).toEqual({ field: "NAME", direction: "DESC" })
  })

  test("flips back on the second click of the active column", () => {
    const current: DataTableSort<Field> = { field: "NAME", direction: "DESC" }

    const next = toggleSort(current, "NAME")

    expect(next).toEqual({ field: "NAME", direction: "ASC" })
  })

  test("ignores initialDirection when the column is already active", () => {
    const current: DataTableSort<Field> = {
      field: "CREATED_AT",
      direction: "DESC",
    }

    const next = toggleSort(current, "CREATED_AT", "DESC")

    expect(next).toEqual({ field: "CREATED_AT", direction: "ASC" })
  })

  test("returns a new object instead of mutating the current sort", () => {
    const current: DataTableSort<Field> = { field: "NAME", direction: "ASC" }

    const next = toggleSort(current, "NAME")

    expect(next).not.toBe(current)
    expect(current).toEqual({ field: "NAME", direction: "ASC" })
  })
})
