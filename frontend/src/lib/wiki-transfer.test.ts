import { describe, expect, it } from "vitest"

import {
  formatBytes,
  importQuery,
  isBundleFilename,
  isTerminal,
  jobDownloadUrl,
} from "./wiki-transfer"

describe("wiki-transfer helpers", () => {
  it("recognises the native bundle suffix case-insensitively", () => {
    expect(isBundleFilename("acme.vibewiki.zip")).toBe(true)
    expect(isBundleFilename("ACME.VibeWiki.ZIP")).toBe(true)
    expect(isBundleFilename("outline-export.zip")).toBe(false)
    expect(isBundleFilename("notes.md.zip")).toBe(false)
  })

  it("builds the import query for each destination", () => {
    const operationId = "op-1"
    expect(importQuery({ operationId, destination: { kind: "holdingPen" } })).toBe(
      "operationId=op-1&holdingPen=true",
    )
    expect(importQuery({ operationId, destination: { kind: "root" } })).toBe("operationId=op-1")
    expect(
      importQuery({ operationId, destination: { kind: "parent", parentId: "doc 9" } }),
    ).toBe("operationId=op-1&targetParentId=doc+9")
  })

  it("encodes the job id in the download URL", () => {
    expect(jobDownloadUrl("a/b")).toMatch(/\/wiki\/transfer\/jobs\/a%2Fb\/download$/)
  })

  it("treats done and failed as terminal", () => {
    expect(isTerminal({ status: "queued" })).toBe(false)
    expect(isTerminal({ status: "running" })).toBe(false)
    expect(isTerminal({ status: "done" })).toBe(true)
    expect(isTerminal({ status: "failed" })).toBe(true)
  })

  it("formats sizes for people", () => {
    expect(formatBytes(512)).toBe("512 B")
    expect(formatBytes(2048)).toBe("2 KB")
    expect(formatBytes(3.5 * 1024 * 1024)).toBe("3.5 MB")
  })
})
