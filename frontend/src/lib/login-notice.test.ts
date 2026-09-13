import { describe, expect, it } from "vitest"
import { loginNotice } from "./login-notice"

describe("loginNotice", () => {
  it("returns null for a plain visit to the dashboard", () => {
    expect(loginNotice(null, null)).toBeNull()
    expect(loginNotice(null, "/")).toBeNull()
    expect(loginNotice(null, "")).toBeNull()
  })

  it("mentions the destination path without its query string", () => {
    expect(loginNotice(null, "/tasks?page=2")).toBe("Sign in to continue to /tasks.")
  })

  it("explains an expired session and keeps the destination", () => {
    expect(loginNotice("expired", "/wiki/abc")).toBe(
      "Your session expired. Sign in again to continue to /wiki/abc.",
    )
    expect(loginNotice("expired", "/")).toBe("Your session expired. Sign in again.")
  })

  it("explains a revoked session", () => {
    expect(loginNotice("revoked", null)).toBe(
      "Your session was ended from another device. Sign in again.",
    )
  })
})
