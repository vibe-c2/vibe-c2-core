import { describe, expect, it } from "vitest"
import { recallLoginMethod, rememberLoginMethod } from "./login-method"

function memoryStore() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  }
}

describe("login method memory", () => {
  it("returns null when nothing was remembered", () => {
    expect(recallLoginMethod(memoryStore())).toBeNull()
    expect(recallLoginMethod(null)).toBeNull()
  })

  it("round-trips the last used method", () => {
    const store = memoryStore()
    rememberLoginMethod("password", store)
    expect(recallLoginMethod(store)).toBe("password")
    rememberLoginMethod("sso", store)
    expect(recallLoginMethod(store)).toBe("sso")
  })

  it("ignores garbage values", () => {
    const store = memoryStore()
    store.setItem("vibec2.login-method", "magic-link")
    expect(recallLoginMethod(store)).toBeNull()
  })

  it("survives a throwing storage", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    }
    expect(() => rememberLoginMethod("sso", broken)).not.toThrow()
    expect(recallLoginMethod(broken)).toBeNull()
  })
})
