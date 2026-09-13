import { describe, expect, it } from "vitest"
import { consumeSsoLoginPending, markSsoLoginPending } from "./post-login-check"

function fakeStore() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

describe("sso login pending marker", () => {
  it("is false by default", () => {
    expect(consumeSsoLoginPending(fakeStore())).toBe(false)
  })

  it("is consumed exactly once", () => {
    const store = fakeStore()
    markSsoLoginPending(store)
    expect(consumeSsoLoginPending(store)).toBe(true)
    expect(consumeSsoLoginPending(store)).toBe(false)
  })

  it("tolerates a missing store", () => {
    expect(() => markSsoLoginPending(null)).not.toThrow()
    expect(consumeSsoLoginPending(null)).toBe(false)
  })
})
