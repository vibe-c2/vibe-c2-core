import { describe, expect, it } from "vitest"
import {
  connectedComponents,
  packComponentAnchors,
} from "@/lib/topology/components"

type Edge = { source: string; target: string }
type Size = { width: number; height: number }

const sizes = (ids: string[]): Map<string, Size> =>
  new Map(ids.map((id) => [id, { width: 100, height: 60 }]))

describe("connectedComponents", () => {
  it("splits two disjoint groups into two components", () => {
    const nodes = ["a", "b", "c", "d"]
    const edges: Edge[] = [
      { source: "a", target: "b" },
      { source: "c", target: "d" },
    ]
    const comps = connectedComponents(nodes, edges)
    expect(comps).toHaveLength(2)
    expect(comps.map((c) => c.sort())).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
  })

  it("joins nodes linked through an intermediary into one component", () => {
    // host -> subnet -> host: a chain collapses to a single island.
    const comps = connectedComponents(
      ["h1", "subnet:x", "h2"],
      [
        { source: "h1", target: "subnet:x" },
        { source: "h2", target: "subnet:x" },
      ],
    )
    expect(comps).toHaveLength(1)
    expect(comps[0].sort()).toEqual(["h1", "h2", "subnet:x"])
  })

  it("treats an unconnected node as its own singleton component", () => {
    const comps = connectedComponents(
      ["a", "b", "lonely"],
      [{ source: "a", target: "b" }],
    )
    expect(comps).toHaveLength(2)
    expect(comps.some((c) => c.length === 1 && c[0] === "lonely")).toBe(true)
  })

  it("ignores self-loops", () => {
    const comps = connectedComponents(
      ["a", "b"],
      [{ source: "a", target: "a" }],
    )
    expect(comps).toHaveLength(2)
  })

  it("orders components deterministically regardless of input order", () => {
    const edges: Edge[] = [
      { source: "a", target: "b" },
      { source: "a", target: "c" }, // {a,b,c} is the larger island
      { source: "x", target: "y" },
    ]
    const one = connectedComponents(["a", "b", "c", "x", "y"], edges)
    const two = connectedComponents(["y", "c", "x", "b", "a"], [...edges].reverse())
    expect(one).toEqual(two)
    // Largest island first, then by smallest member id.
    expect(one[0].sort()).toEqual(["a", "b", "c"])
    expect(one[1].sort()).toEqual(["x", "y"])
  })
})

describe("packComponentAnchors", () => {
  const opts = { interIslandGap: 500, collidePadding: 16 }

  it("returns an anchor for every node", () => {
    const ids = ["a", "b", "c", "d"]
    const comps = connectedComponents(ids, [
      { source: "a", target: "b" },
      { source: "c", target: "d" },
    ])
    const anchors = packComponentAnchors(comps, sizes(ids), opts)
    expect(new Set(anchors.keys())).toEqual(new Set(ids))
  })

  it("places members of the same component at the same anchor", () => {
    const ids = ["a", "b", "c", "d"]
    const comps = connectedComponents(ids, [
      { source: "a", target: "b" },
      { source: "c", target: "d" },
    ])
    const anchors = packComponentAnchors(comps, sizes(ids), opts)
    expect(anchors.get("a")).toEqual(anchors.get("b"))
    expect(anchors.get("c")).toEqual(anchors.get("d"))
    expect(anchors.get("a")).not.toEqual(anchors.get("c"))
  })

  it("spaces neighboring island slots by at least the inter-island gap", () => {
    const ids = ["a", "b", "c", "d"]
    const comps = connectedComponents(ids, [
      { source: "a", target: "b" },
      { source: "c", target: "d" },
    ])
    const anchors = packComponentAnchors(comps, sizes(ids), opts)
    const dx = Math.abs(anchors.get("a")!.x - anchors.get("c")!.x)
    const dy = Math.abs(anchors.get("a")!.y - anchors.get("c")!.y)
    expect(Math.max(dx, dy)).toBeGreaterThanOrEqual(opts.interIslandGap)
  })

  it("is stable for the same input", () => {
    const ids = ["a", "b", "c", "d"]
    const comps = connectedComponents(ids, [
      { source: "a", target: "b" },
      { source: "c", target: "d" },
    ])
    const first = packComponentAnchors(comps, sizes(ids), opts)
    const second = packComponentAnchors(comps, sizes(ids), opts)
    expect([...first.entries()]).toEqual([...second.entries()])
  })

  it("centers a single component on the origin", () => {
    const anchors = packComponentAnchors(
      [["a"]],
      sizes(["a"]),
      opts,
    )
    expect(anchors.get("a")).toEqual({ x: 0, y: 0 })
  })

  it("returns an empty map for no components", () => {
    expect(packComponentAnchors([], new Map(), opts).size).toBe(0)
  })
})
