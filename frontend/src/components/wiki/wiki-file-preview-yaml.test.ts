import { describe, expect, it } from "vitest"

import {
  highlightYaml,
  matchKey,
  renderYamlPreview,
  splitComment,
} from "./wiki-file-preview-yaml"

describe("renderYamlPreview", () => {
  it("shows the file as stored, keeping comments and blank lines", () => {
    // The reason this does not parse and re-serialise: everything below the
    // keys is what makes a YAML file worth reading, and no round-trip keeps it.
    const source = "# why this is off\nfeature: false\n\nother: 1"
    const { bodyHtml, notice } = renderYamlPreview(source)
    expect(notice).toBeUndefined()
    expect(bodyHtml).toContain("why this is off")
    expect(bodyHtml).toContain("\n\n")
  })

  it("calls an empty file empty", () => {
    expect(renderYamlPreview("  \n ").bodyHtml).toContain("empty")
  })

  it("renders a half-written file rather than failing", () => {
    // There is no parse step, so invalid YAML is not a special case.
    const { bodyHtml } = renderYamlPreview("key: [unclosed\n  - broken:")
    expect(bodyHtml).toContain("unclosed")
  })

  it("warns when clipped", () => {
    const { notice } = renderYamlPreview("a: 1\n".repeat(600_000))
    expect(notice).toContain("2 MB")
  })
})

describe("highlightYaml", () => {
  it("marks a key and its value differently", () => {
    const html = highlightYaml("host: dc01.corp.local")
    expect(html).toContain('class="yaml-key"')
    expect(html).toContain('class="yaml-string"')
  })

  it("labels numbers, booleans and nulls", () => {
    const html = highlightYaml("port: 445\nenabled: true\nnote: ~")
    expect(html).toContain('class="yaml-number"')
    expect(html).toContain('class="yaml-boolean"')
    expect(html).toContain('class="yaml-null"')
  })

  it("treats YAML's other boolean spellings as booleans", () => {
    // yes/no/on/off are booleans in YAML 1.1 and plenty of tooling writes them.
    for (const value of ["yes", "no", "on", "off", "Yes", "OFF"]) {
      expect(highlightYaml(`flag: ${value}`)).toContain('class="yaml-boolean"')
    }
  })

  it("colours comments, including trailing ones", () => {
    const html = highlightYaml("port: 445 # the SMB port")
    expect(html).toContain('class="yaml-comment"')
    expect(html).toContain("the SMB port")
  })

  it("does not mistake a hash inside a value for a comment", () => {
    const html = highlightYaml("url: http://example.com/#frag")
    expect(html).not.toContain('class="yaml-comment"')
  })

  it("does not mistake a hash inside quotes for a comment", () => {
    const html = highlightYaml('note: "count # of hosts"')
    expect(html).not.toContain('class="yaml-comment"')
  })

  it("marks sequence dashes as structure, not content", () => {
    const html = highlightYaml("hosts:\n  - dc01\n  - fs01")
    expect(html).toContain('class="yaml-marker"')
  })

  it("marks document separators", () => {
    expect(highlightYaml("---\na: 1")).toContain('class="yaml-marker"')
  })

  it("labels anchors, aliases and tags", () => {
    const html = highlightYaml("base: &defaults\nuse: *defaults")
    expect(html).toContain('class="yaml-anchor"')
  })

  it("escapes markup in values and in keys", () => {
    // The file's own characters must never become part of the document.
    const html = highlightYaml('payload: "<script>alert(1)</script>"\n"<img>": 1')
    expect(html).not.toContain("<script>")
    expect(html).not.toContain("<img>")
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("&lt;img&gt;")
  })

  it("escapes markup inside a comment", () => {
    const html = highlightYaml("a: 1 # <b>note</b>")
    expect(html).not.toContain("<b>")
    expect(html).toContain("&lt;b&gt;")
  })

  it("preserves indentation exactly", () => {
    const html = highlightYaml("root:\n    nested: 1")
    expect(html).toContain("    ")
  })
})

describe("splitComment", () => {
  it("splits a trailing comment", () => {
    expect(splitComment("a: 1 # note")).toEqual({ code: "a: 1 ", comment: "# note" })
  })

  it("treats a whole-line comment as a comment", () => {
    expect(splitComment("# note").code).toBe("")
  })

  it("leaves a hash that is part of a token alone", () => {
    expect(splitComment("url: a#b").comment).toBe("")
  })

  it("ignores a hash inside quotes", () => {
    expect(splitComment(`a: "x # y"`).comment).toBe("")
  })
})

describe("matchKey", () => {
  it("recognises a mapping key", () => {
    expect(matchKey("host: dc01")?.name).toBe("host")
  })

  it("recognises a key with no value", () => {
    expect(matchKey("hosts:")?.value).toBe("")
  })

  it("does not treat a bare URL as a key", () => {
    // The colon must be followed by whitespace or end the line.
    expect(matchKey("http://example.com")).toBeNull()
  })

  it("does not treat a timestamp as a key", () => {
    expect(matchKey("12:30:00")).toBeNull()
  })

  it("recognises a quoted key", () => {
    expect(matchKey('"my key": 1')?.name).toBe('"my key"')
  })
})
