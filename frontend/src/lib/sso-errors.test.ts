import { describe, expect, it } from "vitest"
import { ssoErrorMessage } from "./sso-errors"

describe("ssoErrorMessage", () => {
  it("returns null without a code", () => {
    expect(ssoErrorMessage(null)).toBeNull()
    expect(ssoErrorMessage("")).toBeNull()
  })

  it("maps known codes", () => {
    expect(ssoErrorMessage("sso_no_roles")).toMatch(/no role/)
    expect(ssoErrorMessage("sso_username_taken")).toMatch(/already exists/)
  })

  it("falls back for unknown codes", () => {
    expect(ssoErrorMessage("what")).toMatch(/failed/)
  })
})
