import { beforeEach, describe, expect, test, vi } from "vitest"
import {
  loadFrequentIconNames,
  recordFrequentIconUsage,
} from "@/components/wiki/frequent-icons"
import { ADAPTIVE_ICON_NAME } from "@/components/wiki/icon-catalog"
import { toSimpleIconName } from "@/components/wiki/simple-icon-catalog"

const DOCKER = toSimpleIconName("docker")
const UBUNTU = toSimpleIconName("ubuntu")

// The suite runs in node, not jsdom (see vitest.config.ts) — the module under
// test is the one piece of wiki-icon logic that touches storage, and a
// six-line map is cheaper than pulling a DOM in for it.
const store = new Map<string, string>()
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
})

beforeEach(() => {
  localStorage.clear()
})

describe("frequent icons", () => {
  test("records and returns a lucide icon", () => {
    recordFrequentIconUsage("Server")
    expect(loadFrequentIconNames()).toEqual(["Server"])
  })

  // The reported bug: brand icons were written to storage on every pick but
  // the read path validated names against the lucide catalog only, so the
  // "Frequently used" row never showed one however often it was chosen.
  test("records and returns a brand icon", () => {
    recordFrequentIconUsage(DOCKER)
    expect(loadFrequentIconNames()).toEqual([DOCKER])
  })

  test("ranks brand and lucide icons together by count", () => {
    recordFrequentIconUsage("Server")
    recordFrequentIconUsage(DOCKER)
    recordFrequentIconUsage(DOCKER)
    recordFrequentIconUsage(UBUNTU)
    recordFrequentIconUsage(UBUNTU)
    recordFrequentIconUsage(UBUNTU)
    expect(loadFrequentIconNames()).toEqual([UBUNTU, DOCKER, "Server"])
  })

  test("skips names that no longer resolve in either bundle", () => {
    recordFrequentIconUsage("Server")
    recordFrequentIconUsage("NotARealLucideIcon")
    recordFrequentIconUsage(toSimpleIconName("not-a-real-brand"))
    expect(loadFrequentIconNames()).toEqual(["Server"])
  })

  test("never tracks the adaptive default", () => {
    recordFrequentIconUsage(ADAPTIVE_ICON_NAME)
    expect(loadFrequentIconNames()).toEqual([])
  })

  test("honours the display limit", () => {
    recordFrequentIconUsage("Server")
    recordFrequentIconUsage(DOCKER)
    expect(loadFrequentIconNames(1)).toHaveLength(1)
  })
})
