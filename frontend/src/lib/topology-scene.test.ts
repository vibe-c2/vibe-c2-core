import { describe, expect, it } from "vitest"
import { createScene, resizeScene, stepScene } from "./topology-scene"

// Deterministic generator so node counts and pulses are reproducible.
function seeded(seed = 1) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

describe("topology scene", () => {
  it("creates hubs and implants scaled to the viewport, within bounds", () => {
    const small = createScene(320, 480, seeded())
    const large = createScene(3840, 2160, seeded())
    const implants = (s: typeof small) => s.nodes.filter((n) => !n.isHub).length
    expect(implants(small)).toBe(14)
    expect(implants(large)).toBe(48)
    expect(small.nodes.filter((n) => n.isHub).length).toBeGreaterThanOrEqual(2)
  })

  it("links every implant to exactly one hub, plus optional short peer links", () => {
    const scene = createScene(1200, 800, seeded())
    const implantCount = scene.nodes.filter((n) => !n.isHub).length
    const hubEdges = scene.edges.filter((e) => scene.nodes[e.to].isHub)
    const peerEdges = scene.edges.filter((e) => !scene.nodes[e.to].isHub)
    expect(hubEdges).toHaveLength(implantCount)
    scene.edges.forEach((e) => expect(scene.nodes[e.from].isHub).toBe(false))
    peerEdges.forEach((e) => {
      const a = scene.nodes[e.from]
      const b = scene.nodes[e.to]
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThanOrEqual(170)
    })
    // Peer links are undirected: no pair appears twice.
    const keys = peerEdges.map((e) => [e.from, e.to].sort().join(":"))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("keeps nodes inside the viewport while drifting", () => {
    let scene = createScene(400, 300, seeded())
    for (let i = 0; i < 2000; i++) scene = stepScene(scene, 100, seeded(i))
    scene.nodes.forEach((n) => {
      expect(n.x).toBeGreaterThanOrEqual(0)
      expect(n.x).toBeLessThanOrEqual(400)
      expect(n.y).toBeGreaterThanOrEqual(0)
      expect(n.y).toBeLessThanOrEqual(300)
    })
  })

  it("spawns pulses over time and retires them once they arrive", () => {
    let scene = createScene(800, 600, seeded())
    for (let i = 0; i < 20; i++) scene = stepScene(scene, 100, seeded(i + 5))
    expect(scene.pulses.length).toBeGreaterThan(0)
    scene.pulses.forEach((p) => {
      expect(p.progress).toBeGreaterThanOrEqual(0)
      expect(p.progress).toBeLessThanOrEqual(1)
      expect(p.edge).toBeLessThan(scene.edges.length)
    })
  })

  it("does not mutate the previous scene when stepping", () => {
    const scene = createScene(800, 600, seeded())
    const before = JSON.stringify(scene)
    stepScene(scene, 50, seeded())
    expect(JSON.stringify(scene)).toBe(before)
  })

  it("rescales positions on resize and returns the same scene when unchanged", () => {
    const scene = createScene(800, 600, seeded())
    expect(resizeScene(scene, 800, 600)).toBe(scene)
    const resized = resizeScene(scene, 1600, 600)
    resized.nodes.forEach((n, i) => {
      expect(n.x).toBeCloseTo(scene.nodes[i].x * 2)
      expect(n.y).toBeCloseTo(scene.nodes[i].y)
    })
  })
})
