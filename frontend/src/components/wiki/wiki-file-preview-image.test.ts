import { describe, expect, test } from "vitest"
import { isPreviewableImage } from "@/components/wiki/wiki-file-preview-image"

describe("isPreviewableImage", () => {
  test("accepts the raster types the backend serves inline", () => {
    for (const ct of [
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/avif",
      "image/bmp",
    ]) {
      expect(isPreviewableImage(ct, "shot.bin")).toBe(true)
    }
  })

  test("rejects SVG however it is labelled", () => {
    // SVG is a scriptable document. It must not reach the thumbnail, the
    // lightbox or the new-tab preview — mirrors dangerousContentTypes in
    // wiki_file_controller.go.
    expect(isPreviewableImage("image/svg+xml", "logo.svg")).toBe(false)
    // A .png name must not rescue a positively-identified SVG.
    expect(isPreviewableImage("image/svg+xml", "logo.png")).toBe(false)
  })

  test("falls back to the extension only when the type says nothing", () => {
    expect(isPreviewableImage("application/octet-stream", "shot.PNG")).toBe(true)
    expect(isPreviewableImage("", "shot.jpeg")).toBe(true)
    expect(isPreviewableImage("application/octet-stream", "notes.txt")).toBe(false)
    expect(isPreviewableImage("application/octet-stream", "noext")).toBe(false)
  })

  test("a positively-identified type the browser can't decode is not rescued", () => {
    // The backend said TIFF. No mainstream browser renders it, and a .tif
    // extension must not talk us into a broken tile.
    expect(isPreviewableImage("image/tiff", "scan.tif")).toBe(false)
    expect(isPreviewableImage("text/html", "page.png")).toBe(false)
  })

  test("is case-sensitive on the type, matching the card's canonicalization", () => {
    // The card lowercases and strips parameters before calling in, so an
    // already-canonical type is the only input shape this needs to accept.
    expect(isPreviewableImage("image/png", "a.png")).toBe(true)
  })
})
