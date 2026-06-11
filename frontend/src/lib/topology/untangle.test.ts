import { describe, expect, it } from "vitest"
import {
  countCrossings,
  reduceCrossings,
  type Pair,
  type XYNode,
} from "@/lib/topology/untangle"

// Square corners; an "X" of two diagonals crosses, the two sides don't.
const node = (id: string, x: number, y: number): XYNode => ({ id, x, y, r: 10 })

describe("countCrossings", () => {
  it("counts a proper crossing", () => {
    const nodes = [
      node("a", 0, 0),
      node("b", 10, 10),
      node("c", 0, 10),
      node("d", 10, 0),
    ]
    const edges: Pair[] = [
      { a: "a", b: "b" },
      { a: "c", b: "d" },
    ]
    expect(countCrossings(nodes, edges)).toBe(1)
  })

  it("ignores edges that only share an endpoint", () => {
    // Two edges meeting at a common node touch, they don't cross.
    const nodes = [node("a", 0, 0), node("b", 10, 0), node("c", 5, 10)]
    const edges: Pair[] = [
      { a: "a", b: "b" },
      { a: "b", b: "c" },
    ]
    expect(countCrossings(nodes, edges)).toBe(0)
  })

  it("reports zero for a planar layout", () => {
    const nodes = [node("a", 0, 0), node("b", 100, 0), node("c", 200, 0)]
    const edges: Pair[] = [
      { a: "a", b: "b" },
      { a: "b", b: "c" },
    ]
    expect(countCrossings(nodes, edges)).toBe(0)
  })
})

describe("reduceCrossings", () => {
  it("uncrosses two crossing edges", () => {
    const nodes = [
      node("a", 0, 0),
      node("b", 10, 10),
      node("c", 0, 10),
      node("d", 10, 0),
    ]
    const edges: Pair[] = [
      { a: "a", b: "b" },
      { a: "c", b: "d" },
    ]
    expect(countCrossings(nodes, edges)).toBe(1)
    reduceCrossings(nodes, edges)
    expect(countCrossings(nodes, edges)).toBe(0)
  })

  it("never raises the crossing count and is a no-op when already planar", () => {
    const nodes = [
      node("a", 0, 0),
      node("b", 100, 0),
      node("c", 200, 0),
      node("d", 100, 80),
    ]
    const edges: Pair[] = [
      { a: "a", b: "b" },
      { a: "b", b: "c" },
      { a: "b", b: "d" },
    ]
    const before = countCrossings(nodes, edges)
    reduceCrossings(nodes, edges)
    expect(countCrossings(nodes, edges)).toBeLessThanOrEqual(before)
    expect(countCrossings(nodes, edges)).toBe(0)
  })

  it("is deterministic across runs of identical input", () => {
    const build = (): { nodes: XYNode[]; edges: Pair[] } => ({
      nodes: [
        node("a", 0, 0),
        node("b", 10, 10),
        node("c", 0, 10),
        node("d", 10, 0),
        node("e", 5, -8),
      ],
      edges: [
        { a: "a", b: "b" },
        { a: "c", b: "d" },
        { a: "e", b: "b" },
      ],
    })
    const first = build()
    const second = build()
    reduceCrossings(first.nodes, first.edges)
    reduceCrossings(second.nodes, second.edges)
    expect(first.nodes.map((n) => [n.x, n.y])).toEqual(
      second.nodes.map((n) => [n.x, n.y]),
    )
  })

  it("leaves positions untouched on a trivially small graph", () => {
    const nodes = [node("a", 0, 0), node("b", 10, 0)]
    const edges: Pair[] = [{ a: "a", b: "b" }]
    reduceCrossings(nodes, edges)
    expect(nodes.map((n) => [n.x, n.y])).toEqual([
      [0, 0],
      [10, 0],
    ])
  })
})
