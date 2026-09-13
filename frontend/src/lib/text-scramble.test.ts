import { describe, expect, it } from "vitest"
import { scrambleAt } from "./text-scramble"

const zero = () => 0

describe("scrambleAt", () => {
  it("returns the target when finished", () => {
    expect(scrambleAt("Vibe C2", 1)).toBe("Vibe C2")
    expect(scrambleAt("Vibe C2", 1.5)).toBe("Vibe C2")
  })

  it("is fully scrambled at the start but keeps spaces and length", () => {
    const out = scrambleAt("Vibe C2", 0, zero)
    expect(out).toHaveLength(7)
    expect(out[4]).toBe(" ")
    expect(out).not.toBe("Vibe C2")
  })

  it("resolves characters from the left as progress grows", () => {
    const mid = scrambleAt("ABCDEFGH", 0.65, zero)
    expect(mid.startsWith("ABCD")).toBe(true)
    expect(mid.slice(4)).toBe("!!!!")
  })

  it("stays scrambled through the settle delay", () => {
    expect(scrambleAt("ABCD", 0.1, zero)).toBe("!!!!")
  })
})
