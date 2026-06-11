import { describe, expect, it } from "vitest"
import { seedRadial, type SeedEdge, type SeedNode } from "@/lib/topology/seed"

const node = (id: string, r = 50): SeedNode => ({ id, r })
const edge = (source: string, target: string): SeedEdge => ({ source, target })

const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.hypot(a.x - b.x, a.y - b.y)

// A hub with five spokes — the canonical subnet-with-hosts shape.
const star = () => ({
  nodes: [node("hub", 80), ...["a", "b", "c", "d", "e"].map((id) => node(id))],
  edges: ["a", "b", "c", "d", "e"].map((id) => edge("hub", id)),
})

describe("seedRadial", () => {
  it("positions every node with finite coordinates", () => {
    const { nodes, edges } = star()
    const positions = seedRadial(nodes, edges)

    expect(positions.size).toBe(nodes.length)
    for (const p of positions.values()) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
  })

  it("is deterministic for the same input", () => {
    const { nodes, edges } = star()

    expect(seedRadial(nodes, edges)).toEqual(seedRadial(nodes, edges))
  })

  it("roots the component at its highest-degree node regardless of input order", () => {
    // The hub is listed last — degree, not input position, must pick the root.
    const nodes = [...["a", "b", "c"].map((id) => node(id)), node("hub", 80)]
    const edges = ["a", "b", "c"].map((id) => edge("hub", id))

    const positions = seedRadial(nodes, edges)

    // Single component → centered on the origin → root sits at (0,0).
    expect(positions.get("hub")).toEqual({ x: 0, y: 0 })
  })

  it("places deeper BFS layers on larger rings", () => {
    // hub — mid — leaf chain plus a sibling spoke: leaf is depth 2.
    const nodes = [node("hub", 80), node("mid"), node("sib"), node("leaf")]
    const edges = [edge("hub", "mid"), edge("hub", "sib"), edge("mid", "leaf")]

    const positions = seedRadial(nodes, edges)
    const hub = positions.get("hub")!

    expect(distance(positions.get("leaf")!, hub)).toBeGreaterThan(
      distance(positions.get("mid")!, hub),
    )
  })

  it("spreads ring members apart instead of stacking them", () => {
    const { nodes, edges } = star()
    const positions = seedRadial(nodes, edges)

    const spokes = ["a", "b", "c", "d", "e"].map((id) => positions.get(id)!)
    for (let i = 0; i < spokes.length; i++) {
      for (let j = i + 1; j < spokes.length; j++) {
        expect(distance(spokes[i], spokes[j])).toBeGreaterThan(0)
      }
    }
  })

  it("lays disconnected components side by side without overlap", () => {
    const nodes = [node("a1"), node("a2"), node("b1"), node("b2")]
    const edges = [edge("a1", "a2"), edge("b1", "b2")]

    const positions = seedRadial(nodes, edges)
    // Components are placed in input-discovery order, left to right, so the
    // separation check reduces to: component A's right edge (including node
    // radius) clears component B's left edge.
    const maxAX = Math.max(
      ...["a1", "a2"].map((id) => positions.get(id)!.x + 50),
    )
    const minBX = Math.min(
      ...["b1", "b2"].map((id) => positions.get(id)!.x - 50),
    )

    expect(minBX).toBeGreaterThan(maxAX)
  })

  it("handles a linear chain (no branching, single-child wedges)", () => {
    // Degenerate wedge case: every node inherits its parent's full wedge, so
    // the chain extends along one direction. All positions must stay finite
    // and distinct, with distance from the root growing along the chain.
    const ids = ["a", "b", "c", "d", "e"]
    const nodes = ids.map((id) => node(id))
    const edges = ids.slice(1).map((id, i) => edge(ids[i], id))

    const positions = seedRadial(nodes, edges)

    expect(positions.size).toBe(ids.length)
    const all = ids.map((id) => positions.get(id)!)
    for (const p of all) {
      expect(Number.isFinite(p.x)).toBe(true)
      expect(Number.isFinite(p.y)).toBe(true)
    }
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        expect(distance(all[i], all[j])).toBeGreaterThan(0)
      }
    }
  })

  it("handles isolated nodes and empty input", () => {
    expect(seedRadial([], []).size).toBe(0)

    const positions = seedRadial([node("lonely")], [])
    expect(positions.get("lonely")).toEqual({ x: 0, y: 0 })
  })

  it("keeps spokes on their parent hub's side of the next ring", () => {
    // Two hubs joined by a bridge, each with leaves. A leaf must land closer
    // to its own hub than to the other hub — that's the "no crossed arms at
    // the start" property the seeding exists for.
    const nodes = [
      node("bridge", 80),
      node("hubA", 80),
      node("hubB", 80),
      node("leafA1"),
      node("leafA2"),
      node("leafB1"),
      node("leafB2"),
    ]
    const edges = [
      edge("bridge", "hubA"),
      edge("bridge", "hubB"),
      edge("hubA", "leafA1"),
      edge("hubA", "leafA2"),
      edge("hubB", "leafB1"),
      edge("hubB", "leafB2"),
    ]

    const positions = seedRadial(nodes, edges)
    for (const [leaf, own, other] of [
      ["leafA1", "hubA", "hubB"],
      ["leafA2", "hubA", "hubB"],
      ["leafB1", "hubB", "hubA"],
      ["leafB2", "hubB", "hubA"],
    ] as const) {
      expect(
        distance(positions.get(leaf)!, positions.get(own)!),
      ).toBeLessThan(distance(positions.get(leaf)!, positions.get(other)!))
    }
  })
})
