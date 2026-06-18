import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { copyToClipboard } from "./copy-to-clipboard"

const toast = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock("sonner", () => ({ toast }))

describe("copyToClipboard", () => {
  const writeText = vi.fn<(text: string) => Promise<void>>()

  beforeEach(() => {
    vi.stubGlobal("navigator", { clipboard: { writeText } })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  test("copies the text and reports success", async () => {
    // Arrange
    writeText.mockResolvedValue()

    // Act
    await copyToClipboard("10.0.0.1", "IP")

    // Assert
    expect(writeText).toHaveBeenCalledWith("10.0.0.1")
    expect(toast.success).toHaveBeenCalledWith("Copied IP")
  })

  test("skips the clipboard and informs when there is nothing to copy", async () => {
    await copyToClipboard("", "IP")

    expect(writeText).not.toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalledWith("No IP to copy")
  })

  test("reports an error when the clipboard write is rejected", async () => {
    writeText.mockRejectedValue(new Error("denied"))

    await copyToClipboard("10.0.0.1", "IP")

    expect(toast.error).toHaveBeenCalledWith("Failed to copy IP")
  })
})
