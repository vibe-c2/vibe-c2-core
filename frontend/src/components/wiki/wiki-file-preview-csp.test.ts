import { describe, expect, it } from "vitest"

import { PREVIEW_CSP_POLICY, withPreviewCsp } from "./wiki-file-preview-csp"

/** Index of the injected policy tag, or -1 when it is absent. */
function cspIndex(html: string): number {
  return html.indexOf('<meta http-equiv="Content-Security-Policy"')
}

describe("withPreviewCsp", () => {
  it("prepends the policy when the document has no doctype", () => {
    const out = withPreviewCsp("<html><head></head><body>hi</body></html>")

    expect(cspIndex(out)).toBe(0)
    expect(out).toContain("<body>hi</body>")
  })

  it("inserts the policy after a leading doctype, not before it", () => {
    const out = withPreviewCsp("<!DOCTYPE html><html><body>hi</body></html>")

    expect(out.startsWith("<!DOCTYPE html>")).toBe(true)
    expect(cspIndex(out)).toBe("<!DOCTYPE html>".length)
  })

  it("matches a doctype case-insensitively and with leading whitespace", () => {
    const out = withPreviewCsp("\n  <!doctype html>\n<html></html>")

    expect(out.startsWith("\n  <!doctype html>")).toBe(true)
    expect(cspIndex(out)).toBe("\n  <!doctype html>".length)
  })

  it("handles a legacy doctype carrying a public identifier", () => {
    const legacy =
      '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" ' +
      '"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">'
    const out = withPreviewCsp(`${legacy}<html></html>`)

    expect(out.startsWith(legacy)).toBe(true)
    expect(cspIndex(out)).toBe(legacy.length)
  })

  it("places the policy ahead of the document's own head content", () => {
    // Being first is the whole point — a CSP only governs subresources the
    // parser discovers after it.
    const out = withPreviewCsp(
      '<!doctype html><html><head><meta charset="utf-8">' +
        '<img src="https://attacker.example/beacon.png"></head></html>',
    )

    expect(cspIndex(out)).toBeLessThan(out.indexOf('<meta charset="utf-8"'))
    expect(cspIndex(out)).toBeLessThan(out.indexOf("beacon.png"))
  })

  it("does not treat a doctype mentioned in body text as a leading doctype", () => {
    const out = withPreviewCsp("<p>write <!doctype html> to start a page</p>")

    expect(cspIndex(out)).toBe(0)
    expect(out).toContain("<p>write <!doctype html> to start a page</p>")
  })

  it("injects into a bare fragment with no html element at all", () => {
    const out = withPreviewCsp("<p>just a fragment</p>")

    expect(cspIndex(out)).toBe(0)
    expect(out.endsWith("<p>just a fragment</p>")).toBe(true)
  })

  it("preserves the original document byte-for-byte after the insertion point", () => {
    const original = "<!doctype html><html><body><b>x</b>&amp; </body></html>"
    const out = withPreviewCsp(original)

    expect(out.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "")).toBe(
      original,
    )
  })

  it("blocks every network-capable directive in the policy", () => {
    expect(PREVIEW_CSP_POLICY).toContain("default-src 'none'")
    // Remote and same-origin subresources are both refused — only data: passes.
    expect(PREVIEW_CSP_POLICY).toContain("img-src data:")
    expect(PREVIEW_CSP_POLICY).not.toContain("'self'")
    expect(PREVIEW_CSP_POLICY).not.toContain("http:")
    expect(PREVIEW_CSP_POLICY).not.toContain("https:")
    expect(PREVIEW_CSP_POLICY).toContain("form-action 'none'")
  })

  it("allows inline styles, which self-contained exports depend on", () => {
    expect(PREVIEW_CSP_POLICY).toContain("style-src 'unsafe-inline' data:")
  })

  it("omits directives that a meta-delivered policy cannot enforce", () => {
    expect(PREVIEW_CSP_POLICY).not.toContain("frame-ancestors")
    expect(PREVIEW_CSP_POLICY).not.toContain("sandbox")
  })
})
