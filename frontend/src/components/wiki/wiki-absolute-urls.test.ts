import { describe, expect, it } from "vitest"
import { absolutizeWikiMedia } from "@/components/wiki/wiki-absolute-urls"

const ORIGIN = "https://c2.example.com"
const ID = "18d944b2-19b4-41a4-92a9-62f357a5cd68"

describe("absolutizeWikiMedia", () => {
  // The reported case: an attachment link pasted into Obsidian resolves
  // against nothing and is dead.
  it("absolutises an attachment link", () => {
    const md = `[АИС РИО.docx 11819](/api/v1/wiki/files/${ID})`
    expect(absolutizeWikiMedia(md, ORIGIN)).toBe(
      `[АИС РИО.docx 11819](${ORIGIN}/api/v1/wiki/files/${ID})`,
    )
  })

  it("absolutises an inline image", () => {
    const md = `![](/api/v1/wiki/images/${ID})`
    expect(absolutizeWikiMedia(md, ORIGIN)).toBe(
      `![](${ORIGIN}/api/v1/wiki/images/${ID})`,
    )
  })

  it("rewrites every occurrence", () => {
    const md = `a](/api/v1/wiki/files/${ID}) b](/api/v1/wiki/images/${ID})`
    const out = absolutizeWikiMedia(md, ORIGIN)
    expect(out.match(new RegExp(ORIGIN, "g"))?.length).toBe(2)
  })

  it("leaves links that are already absolute alone", () => {
    const md = `[x](${ORIGIN}/api/v1/wiki/files/${ID})`
    expect(absolutizeWikiMedia(md, ORIGIN)).toBe(md)
  })

  // The replacement runs over the whole document, code fences included, so
  // the pattern has to be narrow enough not to rewrite text that merely
  // mentions a path.
  it("ignores paths that are not media links", () => {
    const cases = [
      "[x](/api/v1/wiki/export)",
      `[x](/api/v1/wiki/files/not-a-uuid)`,
      `[x](/api/v1/wiki/documents/${ID})`,
      `see /api/v1/wiki/files/${ID} in the docs`,
    ]
    for (const md of cases) {
      expect(absolutizeWikiMedia(md, ORIGIN)).toBe(md)
    }
  })

  it("leaves ordinary links alone", () => {
    const md = "[docs](https://example.com/x) and [rel](./other.md)"
    expect(absolutizeWikiMedia(md, ORIGIN)).toBe(md)
  })

  it("does not double the slash when the origin has a trailing one", () => {
    const md = `[x](/api/v1/wiki/files/${ID})`
    expect(absolutizeWikiMedia(md, `${ORIGIN}/`)).toBe(
      `[x](${ORIGIN}/api/v1/wiki/files/${ID})`,
    )
  })

  it("returns the input unchanged when there is no origin", () => {
    const md = `[x](/api/v1/wiki/files/${ID})`
    expect(absolutizeWikiMedia(md, "")).toBe(md)
  })
})
