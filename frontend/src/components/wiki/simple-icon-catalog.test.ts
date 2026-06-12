import { describe, expect, test } from "vitest"
import {
  ALL_SIMPLE_ICON_SLUGS,
  SIMPLE_ICON_CATALOG,
  SIMPLE_ICON_PREFIX,
  isSimpleIconName,
  resolveSimpleIcon,
  simpleIconSlug,
  toSimpleIconName,
} from "@/components/wiki/simple-icon-catalog"

describe("simple-icon encoding", () => {
  test("isSimpleIconName only matches the si: prefix", () => {
    expect(isSimpleIconName("si:ubuntu")).toBe(true)
    // Bare lucide names and the adaptive sentinel are NOT simple icons —
    // this is the backward-compat contract that keeps old stored values lucide.
    expect(isSimpleIconName("Server")).toBe(false)
    expect(isSimpleIconName("Adaptive")).toBe(false)
    expect(isSimpleIconName("")).toBe(false)
    expect(isSimpleIconName(null)).toBe(false)
  })

  test("toSimpleIconName / simpleIconSlug round-trip", () => {
    expect(toSimpleIconName("ubuntu")).toBe(`${SIMPLE_ICON_PREFIX}ubuntu`)
    expect(simpleIconSlug(toSimpleIconName("ubuntu"))).toBe("ubuntu")
  })

  test("simpleIconSlug returns empty for non-prefixed values", () => {
    expect(simpleIconSlug("Server")).toBe("")
    expect(simpleIconSlug(null)).toBe("")
  })
})

describe("simple-icon registry", () => {
  test("the full slug set is populated from the package", () => {
    // Guards the import.meta.glob wiring: if the package layout changes and the
    // glob stops matching, this drops to 0 and the whole brand library silently
    // disappears from the pickers.
    expect(ALL_SIMPLE_ICON_SLUGS.length).toBeGreaterThan(1000)
    expect(ALL_SIMPLE_ICON_SLUGS).toContain("ubuntu")
    expect(ALL_SIMPLE_ICON_SLUGS).toContain("linux")
  })

  test("every curated slug exists in the package (no blank tiles)", () => {
    const available = new Set(ALL_SIMPLE_ICON_SLUGS)
    const missing = SIMPLE_ICON_CATALOG.flatMap((g) => g.icons)
      .map((i) => i.slug)
      .filter((slug) => !available.has(slug))
    expect(missing).toEqual([])
  })

  test("resolveSimpleIcon returns a component for a known slug, null otherwise", () => {
    expect(resolveSimpleIcon("ubuntu")).not.toBeNull()
    expect(resolveSimpleIcon("definitely-not-a-real-brand-slug")).toBeNull()
    expect(resolveSimpleIcon("")).toBeNull()
  })
})
