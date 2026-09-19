import { describe, expect, test } from "vitest"
import { Doc as YDoc, applyUpdate, encodeStateAsUpdate } from "yjs"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"

import {
  DRAWING_ROOT_KEY,
  LOCAL_ORIGIN,
  getElementsMap,
  mergeRemoteElements,
  readElements,
  seedLastSeen,
  shouldKeepLocal,
  writeLocalElements,
  writeSharedAppState,
  readSharedAppState,
} from "./drawing-scene"

/** A minimally-populated element. Only the fields the merge rules read are
 * meaningful here; the rest of Excalidraw's shape is irrelevant to this module
 * and deliberately not asserted on. */
function element(
  id: string,
  version: number,
  versionNonce = 1,
  extra: Partial<ExcalidrawElement> = {},
): ExcalidrawElement {
  return { id, version, versionNonce, ...extra } as ExcalidrawElement
}

describe("shouldKeepLocal", () => {
  test("keeps the higher version", () => {
    expect(shouldKeepLocal(element("a", 5), element("a", 3))).toBe(true)
    expect(shouldKeepLocal(element("a", 3), element("a", 5))).toBe(false)
  })

  test("breaks an equal version on the lower nonce", () => {
    expect(shouldKeepLocal(element("a", 3, 10), element("a", 3, 20))).toBe(true)
    expect(shouldKeepLocal(element("a", 3, 20), element("a", 3, 10))).toBe(false)
  })

  // The tiebreak is arbitrary, but both sides must reach the same verdict
  // independently — otherwise two canvases settle differently and neither
  // client ever discovers it.
  test("is symmetric: exactly one side keeps its own copy", () => {
    const mine = element("a", 3, 10)
    const theirs = element("a", 3, 20)
    expect(shouldKeepLocal(mine, theirs)).toBe(true)
    expect(shouldKeepLocal(theirs, mine)).toBe(false)
  })

  test("an element this client has never seen is always taken", () => {
    expect(shouldKeepLocal(undefined, element("a", 1))).toBe(false)
  })
})

describe("mergeRemoteElements", () => {
  test("takes newer remote elements and keeps newer local ones", () => {
    const local = [element("a", 5), element("b", 1)]
    const remote = [element("a", 2), element("b", 9)]

    const merged = mergeRemoteElements(local, remote)

    expect(merged.map((el) => [el.id, el.version])).toEqual([
      ["a", 5],
      ["b", 9],
    ])
  })

  test("appends an element that exists only locally", () => {
    const merged = mergeRemoteElements([element("local-only", 1)], [element("a", 1)])
    expect(merged.map((el) => el.id)).toEqual(["a", "local-only"])
  })

  // Excalidraw renders in array order, so reordering on every remote update
  // would make z-order flicker while somebody else is drawing.
  test("follows the shared scene's order", () => {
    const merged = mergeRemoteElements(
      [element("c", 1), element("a", 1)],
      [element("a", 1), element("b", 1), element("c", 1)],
    )
    expect(merged.map((el) => el.id)).toEqual(["a", "b", "c"])
  })

  test("keeps deleted tombstones, which Excalidraw filters itself", () => {
    const merged = mergeRemoteElements([], [element("gone", 2, 1, { isDeleted: true })])
    expect(merged).toHaveLength(1)
    expect(merged[0].isDeleted).toBe(true)
  })
})

describe("writeLocalElements", () => {
  test("writes only elements whose version moved", () => {
    const doc = new YDoc()
    const lastSeen = new Map<string, number>()

    expect(writeLocalElements(doc, [element("a", 1), element("b", 1)], lastSeen)).toBe(2)
    // Excalidraw hands back the whole array on every change; without the
    // version diff a single drag would republish the entire scene per frame.
    expect(writeLocalElements(doc, [element("a", 1), element("b", 1)], lastSeen)).toBe(0)
    expect(writeLocalElements(doc, [element("a", 2), element("b", 1)], lastSeen)).toBe(1)

    expect(readElements(doc).find((el) => el.id === "a")?.version).toBe(2)
  })

  test("stamps its writes with the local origin so the observer can ignore them", () => {
    const doc = new YDoc()
    const origins: unknown[] = []
    doc.on("afterTransaction", (tr) => origins.push(tr.origin))

    writeLocalElements(doc, [element("a", 1)], new Map())

    expect(origins).toContain(LOCAL_ORIGIN)
    expect(origins.every((o) => o === LOCAL_ORIGIN)).toBe(true)
  })

  test("seedLastSeen stops a freshly synced scene being republished", () => {
    const doc = new YDoc()
    const synced = [element("a", 4), element("b", 7)]

    expect(writeLocalElements(doc, synced, seedLastSeen(synced))).toBe(0)
  })
})

describe("the scene as Y.js state", () => {
  // The whole storage design rests on this: the sidecar persists the entire
  // Y.Doc, so a scene under its own root key round-trips with no new column,
  // no new collection and no new transport.
  test("survives an encode/apply round trip under its own root key", () => {
    const source = new YDoc()
    writeLocalElements(source, [element("a", 1), element("b", 2)], new Map())
    writeSharedAppState(source, { viewBackgroundColor: "#121212" })

    const restored = new YDoc()
    applyUpdate(restored, encodeStateAsUpdate(source))

    expect(readElements(restored).map((el) => el.id).sort()).toEqual(["a", "b"])
    expect(readSharedAppState(restored).viewBackgroundColor).toBe("#121212")
  })

  test("leaves the prose fragment untouched, so the two bodies never collide", () => {
    const doc = new YDoc()
    writeLocalElements(doc, [element("a", 1)], new Map())

    expect(doc.getXmlFragment("default").length).toBe(0)
    expect(doc.share.has(DRAWING_ROOT_KEY)).toBe(true)
  })

  // Two people opening a blank drawing at the same moment must each keep their
  // work. This is why the elements live at a root key: nested inside a scene
  // map, both clients install their own map, Yjs picks one, and everything
  // written into the loser is gone.
  //
  // Note what this asserts. Convergence alone is not enough and is actively
  // misleading here — when one map wins outright both canvases agree perfectly
  // on the survivor, so a test that only compared the two clients would pass
  // while half the drawing was being discarded. Assert that both shapes are
  // still there.
  test("concurrent work on a blank scene is preserved, not just converged", () => {
    const a = new YDoc()
    const b = new YDoc()

    getElementsMap(a)
    getElementsMap(b)
    writeLocalElements(a, [element("from-a", 1)], new Map())
    writeLocalElements(b, [element("from-b", 1)], new Map())

    const updateA = encodeStateAsUpdate(a)
    const updateB = encodeStateAsUpdate(b)
    applyUpdate(a, updateB)
    applyUpdate(b, updateA)

    const idsOnA = readElements(a).map((el) => el.id).sort()
    const idsOnB = readElements(b).map((el) => el.id).sort()
    expect(idsOnA).toEqual(["from-a", "from-b"])
    expect(idsOnB).toEqual(["from-a", "from-b"])
  })

  // The same hazard for the other root key: two people changing different
  // appState fields at once must not revert each other.
  test("concurrent appState changes to different fields both survive", () => {
    const a = new YDoc()
    const b = new YDoc()

    writeSharedAppState(a, { viewBackgroundColor: "#121212" })
    writeSharedAppState(b, { gridSize: 20 })

    const updateA = encodeStateAsUpdate(a)
    applyUpdate(a, encodeStateAsUpdate(b))
    applyUpdate(b, updateA)

    expect(readSharedAppState(a)).toEqual({ viewBackgroundColor: "#121212", gridSize: 20 })
    expect(readSharedAppState(b)).toEqual({ viewBackgroundColor: "#121212", gridSize: 20 })
  })

  test("concurrent edits to the same element converge on both clients", () => {
    const a = new YDoc()
    const b = new YDoc()
    const shared = [element("box", 1)]
    applyUpdate(a, encodeStateAsUpdate((() => {
      const seed = new YDoc()
      writeLocalElements(seed, shared, new Map())
      return seed
    })()))
    applyUpdate(b, encodeStateAsUpdate(a))

    writeLocalElements(a, [element("box", 2, 10)], seedLastSeen(shared))
    writeLocalElements(b, [element("box", 2, 20)], seedLastSeen(shared))

    applyUpdate(a, encodeStateAsUpdate(b))
    applyUpdate(b, encodeStateAsUpdate(a))

    expect(readElements(a)).toEqual(readElements(b))
  })
})
