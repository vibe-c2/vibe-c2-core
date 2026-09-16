import { describe, expect, it } from "vitest"
import { formatBytes } from "./skill-upload"

describe("formatBytes", () => {
  it("leaves small sizes in bytes", () => {
    expect(formatBytes(0)).toBe("0 B")
    expect(formatBytes(512)).toBe("512 B")
  })

  it("scales up through the units", () => {
    expect(formatBytes(2048)).toBe("2.0 KB")
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB")
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3.0 GB")
  })

  it("drops the decimal once the number is big enough to carry itself", () => {
    expect(formatBytes(20 * 1024)).toBe("20 KB")
  })
})
