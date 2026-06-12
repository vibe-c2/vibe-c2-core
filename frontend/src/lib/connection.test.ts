import { describe, expect, test } from "vitest"
import { flattenConnection } from "./connection"

interface Page {
  things: { edges: Array<{ node: { id: string } }> }
}

const page = (...ids: string[]): Page => ({
  things: { edges: ids.map((id) => ({ node: { id } })) },
})

describe("flattenConnection", () => {
  test("returns empty array when data is undefined", () => {
    expect(flattenConnection(undefined, (p: Page) => p.things)).toEqual([])
  })

  test("returns empty array when all pages are empty", () => {
    expect(
      flattenConnection({ pages: [page(), page()] }, (p) => p.things),
    ).toEqual([])
  })

  test("flattens nodes across pages in order", () => {
    const data = { pages: [page("a", "b"), page("c"), page("d", "e")] }
    expect(flattenConnection(data, (p) => p.things).map((n) => n.id)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
    ])
  })

  test("supports picking different connection fields per call", () => {
    interface MultiPage {
      users: { edges: Array<{ node: string }> }
      hosts: { edges: Array<{ node: number }> }
    }
    const data: { pages: MultiPage[] } = {
      pages: [
        {
          users: { edges: [{ node: "u1" }] },
          hosts: { edges: [{ node: 1 }, { node: 2 }] },
        },
      ],
    }
    expect(flattenConnection(data, (p) => p.users)).toEqual(["u1"])
    expect(flattenConnection(data, (p) => p.hosts)).toEqual([1, 2])
  })
})
