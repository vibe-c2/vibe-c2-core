import { describe, expect, it } from "vitest"
import { createRain, resizeRain, stepRain } from "./matrix-rain"

// Deterministic generator so the simulation is reproducible.
function seeded(seed = 1) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

describe("matrix rain", () => {
  it("creates one column per grid column with a glyph per row", () => {
    const rain = createRain(40, 30, seeded())
    expect(rain.columns).toHaveLength(40)
    rain.columns.forEach((c) => {
      expect(c.glyphs).toHaveLength(30)
      expect(c.trailRows).toBeGreaterThan(0)
      expect(c.speedRowsPerSec).toBeGreaterThan(0)
    })
  })

  it("moves heads downward over time", () => {
    const rain = createRain(10, 20, seeded())
    const next = stepRain(rain, 500, seeded(2))
    next.columns.forEach((c, i) => {
      const before = rain.columns[i]
      // Either advanced, or respawned above the top after leaving the bottom.
      expect(c.head > before.head || c.head <= 0).toBe(true)
    })
  })

  it("respawns a column above the top once its trail has left the bottom", () => {
    let rain = createRain(5, 10, seeded())
    for (let i = 0; i < 400; i++) rain = stepRain(rain, 100, seeded(i + 1))
    rain.columns.forEach((c) => {
      expect(c.head - c.trailRows).toBeLessThanOrEqual(10)
    })
  })

  it("does not mutate the previous state when stepping", () => {
    const rain = createRain(8, 12, seeded())
    const before = JSON.stringify(rain)
    stepRain(rain, 50, seeded(3))
    expect(JSON.stringify(rain)).toBe(before)
  })

  it("returns the same state on a no-op resize and a fresh grid otherwise", () => {
    const rain = createRain(8, 12, seeded())
    expect(resizeRain(rain, 8, 12)).toBe(rain)
    const bigger = resizeRain(rain, 16, 12, seeded())
    expect(bigger.columns).toHaveLength(16)
  })
})
