import { describe, expect, test } from "vitest"

import { pastePlan } from "./wiki-paste-plan"

describe("pastePlan", () => {
  // The regression. ProseMirror's own paste would scroll to the caret at the end
  // of the pasted text; the block then collapses to a ~16-line preview, the
  // document shrinks by everything that scroll was aimed at, and the clamped
  // offset dumps the reader at the bottom of the page.
  test("a code-block paste never asks to scroll", () => {
    const plan = pastePlan({
      inCodeBlock: true,
      plainText: "a\n".repeat(400),
      hasMarkdown: false,
    })
    expect(plan.kind).toBe("code-literal")
    expect(plan.scrollIntoView).toBe(false)
  })

  // Short pastes take the same path: the caret was already visible, so not
  // scrolling costs nothing, and branching on length would mean the behaviour
  // changed at an arbitrary boundary.
  test("a short code-block paste takes the same path", () => {
    expect(pastePlan({ inCodeBlock: true, plainText: "x", hasMarkdown: false })).toEqual({
      kind: "code-literal",
      scrollIntoView: false,
    })
  })

  // Markers are part of the source someone is copying into a code block, so
  // they must not be converted even when they look like Markdown.
  test("markdown-shaped text pasted into a code block stays literal", () => {
    expect(
      pastePlan({ inCodeBlock: true, plainText: "# heading", hasMarkdown: true }).kind,
    ).toBe("code-literal")
  })

  test("prose keeps follow-the-caret scrolling for a markdown paste", () => {
    expect(pastePlan({ inCodeBlock: false, plainText: "# hi", hasMarkdown: true })).toEqual({
      kind: "markdown",
      scrollIntoView: true,
    })
  })

  test("prose without markdown is left to ProseMirror", () => {
    expect(pastePlan({ inCodeBlock: false, plainText: "hi", hasMarkdown: false }).kind).toBe(
      "passthrough",
    )
  })

  test("an empty code-block paste is left to ProseMirror", () => {
    for (const plainText of [null, undefined, ""]) {
      expect(pastePlan({ inCodeBlock: true, plainText, hasMarkdown: false }).kind).toBe(
        "passthrough",
      )
    }
  })
})
