import { describe, expect, test } from "vitest"
import {
  ALL_LUCIDE_NAMES,
  ICON_CATALOG,
  ICON_LOOKUP,
} from "@/components/wiki/icon-catalog"

describe("lucide icon registry", () => {
  test("the full lucide name set is populated from the package", () => {
    // Guards the import.meta.glob wiring. lucide changed its emitted extension
    // from `.js` to `.mjs` in 1.7, which silently emptied this map and stripped
    // the picker down to the curated catalog. If the package layout moves again,
    // this drops to 0 and fails here instead of in the UI.
    expect(ALL_LUCIDE_NAMES.size).toBeGreaterThan(1000)
  })

  test("well-known lucide icons resolve to an importable path", () => {
    for (const name of ["Server", "AArrowDown", "Wifi", "ZoomIn"]) {
      expect(ALL_LUCIDE_NAMES.get(name)).toBeTypeOf("string")
    }
  })

  test("names are PascalCase with no file extension left over", () => {
    for (const name of ALL_LUCIDE_NAMES.keys()) {
      expect(name).toMatch(/^[A-Z][A-Za-z0-9]*$/)
    }
  })

  test("every curated catalog entry is also in the full set", () => {
    // A curated entry missing from the glob means the two sources disagree
    // about what lucide ships — a rename we have not followed.
    const curated = ICON_CATALOG.flatMap((g) => g.icons.map((i) => i.name))
    expect(curated.length).toBeGreaterThan(0)
    for (const name of curated) {
      expect(ICON_LOOKUP[name]).toBeDefined()
      expect(ALL_LUCIDE_NAMES.has(name)).toBe(true)
    }
  })
})
