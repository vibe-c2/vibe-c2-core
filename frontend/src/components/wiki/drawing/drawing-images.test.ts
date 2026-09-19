import { describe, expect, test } from "vitest"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import type { BinaryFiles } from "@excalidraw/excalidraw/types"

import {
  applyImageIDs,
  isWikiImageID,
  pendingImages,
  wikiImageFiles,
  wikiImageIDs,
  wikiImageURL,
} from "./drawing-images"

const WIKI_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"
const OTHER_WIKI_ID = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
/** Excalidraw mints its own ids as long hex digests, not uuids. */
const LOCAL_ID = "8f14e45fceea167a5a36dedd4bea2543a1b2c3d4"

function imageElement(
  id: string,
  fileId: string | undefined,
  extra: Partial<ExcalidrawElement> = {},
): ExcalidrawElement {
  return { id, type: "image", fileId, version: 1, versionNonce: 1, ...extra } as ExcalidrawElement
}

function rectangle(id: string): ExcalidrawElement {
  return { id, type: "rectangle", version: 1, versionNonce: 1 } as ExcalidrawElement
}

function files(entries: Record<string, string>): BinaryFiles {
  return Object.fromEntries(
    Object.entries(entries).map(([id, dataURL]) => [
      id,
      { id, dataURL, mimeType: "image/png", created: 0 },
    ]),
  ) as unknown as BinaryFiles
}

describe("isWikiImageID", () => {
  test("tells an uploaded image from one the canvas just minted", () => {
    expect(isWikiImageID(WIKI_ID)).toBe(true)
    expect(isWikiImageID(LOCAL_ID)).toBe(false)
    expect(isWikiImageID(undefined)).toBe(false)
    expect(isWikiImageID("")).toBe(false)
  })
})

describe("wikiImageIDs", () => {
  test("collects stored image ids and ignores everything else", () => {
    const elements = [
      imageElement("a", WIKI_ID),
      imageElement("b", LOCAL_ID),
      imageElement("c", WIKI_ID),
      rectangle("d"),
    ]
    expect(wikiImageIDs(elements)).toEqual([WIKI_ID])
  })

  // A deleted image still sits in the scene as a tombstone. Counting it would
  // keep a blob alive forever, since the sweeper only reclaims what nothing
  // references.
  test("skips deleted images", () => {
    const elements = [imageElement("a", WIKI_ID, { isDeleted: true })]
    expect(wikiImageIDs(elements)).toEqual([])
  })
})

describe("wikiImageFiles", () => {
  test("points each file at its wiki URL rather than re-encoding bytes", () => {
    const built = wikiImageFiles([imageElement("a", WIKI_ID)])
    const entry = built[WIKI_ID as keyof BinaryFiles]

    expect(entry).toBeDefined()
    expect(entry.dataURL).toBe(wikiImageURL(WIKI_ID))
    expect(entry.dataURL.startsWith("data:")).toBe(false)
  })
})

describe("pendingImages", () => {
  test("finds a freshly pasted image that has not been stored", () => {
    const pending = pendingImages(
      [imageElement("a", LOCAL_ID)],
      files({ [LOCAL_ID]: "data:image/png;base64,AAAA" }),
    )
    expect(pending).toEqual([{ fileId: LOCAL_ID, dataURL: "data:image/png;base64,AAAA" }])
  })

  test("ignores images that are already stored", () => {
    const pending = pendingImages(
      [imageElement("a", WIKI_ID)],
      files({ [WIKI_ID]: wikiImageURL(WIKI_ID) }),
    )
    expect(pending).toEqual([])
  })

  // Excalidraw registers the bytes slightly before the element that uses them.
  // Uploading in that window stores a blob nothing references, which the
  // sweeper then reclaims while the user is still placing the image.
  test("ignores a file with no element using it yet", () => {
    const pending = pendingImages([], files({ [LOCAL_ID]: "data:image/png;base64,AAAA" }))
    expect(pending).toEqual([])
  })

  test("reports one entry when several elements share a file", () => {
    const pending = pendingImages(
      [imageElement("a", LOCAL_ID), imageElement("b", LOCAL_ID)],
      files({ [LOCAL_ID]: "data:image/png;base64,AAAA" }),
    )
    expect(pending).toHaveLength(1)
  })
})

describe("applyImageIDs", () => {
  test("repoints elements at the stored image", () => {
    const [rewritten] = applyImageIDs(
      [imageElement("a", LOCAL_ID)],
      new Map([[LOCAL_ID, WIKI_ID]]),
    )
    expect((rewritten as { fileId?: string }).fileId).toBe(WIKI_ID)
  })

  // The rewrite has to reach every other client, or a peer is left holding an
  // element that references a fileId which only ever existed in this browser.
  // The sync layer publishes on version change, so the bump is what carries it.
  test("bumps the version so the rewrite is published", () => {
    const original = imageElement("a", LOCAL_ID)
    const [rewritten] = applyImageIDs([original], new Map([[LOCAL_ID, WIKI_ID]]))

    expect(rewritten.version).toBe(original.version + 1)
  })

  test("leaves unrelated elements exactly as they were", () => {
    const rect = rectangle("shape")
    const other = imageElement("b", OTHER_WIKI_ID)

    const result = applyImageIDs([rect, other], new Map([[LOCAL_ID, WIKI_ID]]))

    expect(result[0]).toBe(rect)
    expect(result[1]).toBe(other)
  })
})
