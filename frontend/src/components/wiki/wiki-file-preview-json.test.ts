import { describe, expect, it } from "vitest"

import { highlightJson, renderJsonPreview } from "./wiki-file-preview-json"

describe("renderJsonPreview", () => {
  it("pretty-prints minified JSON, which is the reason this exists", () => {
    const { bodyHtml, notice } = renderJsonPreview('{"host":"dc01","open":[445,3389]}')
    expect(notice).toBeUndefined()
    // Indented output means newlines; a minified one-liner has none.
    expect(bodyHtml).toContain("\n")
    expect(bodyHtml).toContain("dc01")
  })

  it("shows invalid JSON verbatim instead of refusing", () => {
    // A truncated capture is exactly the file somebody needs to look at.
    const truncated = '{"host":"dc01","open":[445,'
    const { bodyHtml, notice } = renderJsonPreview(truncated)
    expect(notice).toContain("not valid JSON")
    expect(bodyHtml).toContain("dc01")
  })

  it("calls an empty file empty", () => {
    expect(renderJsonPreview("   ").bodyHtml).toContain("empty")
  })

  it("warns when the formatted output is clipped", () => {
    // Deeply padded so the re-indented form comfortably exceeds the ceiling.
    const big = JSON.stringify({ blob: "x".repeat(3 * 1024 * 1024) })
    const { notice } = renderJsonPreview(big)
    expect(notice).toContain("2 MB")
  })
})

describe("highlightJson", () => {
  it("distinguishes a key from a string value", () => {
    const html = highlightJson('{"host": "dc01"}')
    expect(html).toContain('class="json-key"')
    expect(html).toContain('class="json-string"')
  })

  it("labels numbers, booleans and null", () => {
    const html = highlightJson('{"port": 445, "up": true, "note": null}')
    expect(html).toContain('class="json-number"')
    expect(html).toContain('class="json-boolean"')
    expect(html).toContain('class="json-null"')
  })

  it("escapes markup inside string values", () => {
    // The file's own characters must never become part of the document.
    const html = highlightJson('{"payload": "<script>alert(1)</script>"}')
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("escapes markup that appears in a key", () => {
    const html = highlightJson('{"<img>": 1}')
    expect(html).not.toContain("<img>")
    expect(html).toContain("&lt;img&gt;")
  })

  it("does not mistake a brace inside a string for structure", () => {
    const html = highlightJson('{"cmd": "if (x) { y }"}')
    expect(html).toContain("if (x) { y }")
  })

  it("leaves a colon inside a string from making it look like a key", () => {
    const html = highlightJson('{"url": "https://example.com:8443"}')
    // The value is a string, not a second key.
    expect(html).toContain('class="json-string"')
  })

  it("handles escaped quotes without losing the rest of the line", () => {
    const html = highlightJson('{"quote": "she said \\"hi\\"", "after": 1}')
    expect(html).toContain('class="json-number"')
  })

  it("passes plain text through unharmed", () => {
    expect(highlightJson("not json at all")).toBe("not json at all")
  })
})
