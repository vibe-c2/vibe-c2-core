import { describe, expect, test } from "vitest"
import { Doc as YDoc, applyUpdate, encodeStateAsUpdate } from "yjs"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"

import {
  DRAWING_ROOT_KEY,
  LOCAL_ORIGIN,
  getElementsMap,
  locallyEditingIDs,
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
  return { id, version, versionNonce, ...extra } as unknown as ExcalidrawElement
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

  // The bug behind "the pencil only works when I am alone on the drawing".
  // A stroke in flight is published on every pointermove, so the shared map
  // holds this client's own copy at the same version AND the same nonce. Under
  // a strict `<` tiebreak that copy won, and the canvas swapped the element
  // object Excalidraw was mutating for an identical clone — the stroke froze
  // where it was and committed truncated.
  test("keeps local when the remote copy is this client's own write echoed back", () => {
    const mine = element("a", 3, 10)
    const echo = element("a", 3, 10)
    expect(shouldKeepLocal(mine, echo)).toBe(true)
  })

  test("an element under an active local gesture outranks a newer remote one", () => {
    const stroke = element("a", 2)
    const newer = element("a", 99)
    expect(shouldKeepLocal(stroke, newer)).toBe(false)
    expect(shouldKeepLocal(stroke, newer, new Set(["a"]))).toBe(true)
    // The guard is per element: everything else still merges normally.
    expect(shouldKeepLocal(stroke, newer, new Set(["other"]))).toBe(false)
  })
})

describe("locallyEditingIDs", () => {
  test("collects every appState slot that holds an element mid-gesture", () => {
    expect(
      locallyEditingIDs({
        newElement: { id: "stroke" },
        resizingElement: { id: "box" },
        multiElement: { id: "line" },
        editingTextElement: { id: "label" },
        editingLinearElement: { elementId: "arrow" },
      }),
    ).toEqual(new Set(["stroke", "box", "line", "label", "arrow"]))
  })

  test("is empty when nothing is under the pointer", () => {
    expect(locallyEditingIDs({})).toEqual(new Set())
    expect(locallyEditingIDs({ newElement: null, editingLinearElement: null })).toEqual(
      new Set(),
    )
  })
})

describe("mergeRemoteElements", () => {
  test("takes newer remote elements and keeps newer local ones", () => {
    const local = [element("a", 5), element("b", 1)]
    const remote = [element("a", 2), element("b", 9)]

    const { elements } = mergeRemoteElements(local, remote)

    expect(elements.map((el) => [el.id, el.version])).toEqual([
      ["a", 5],
      ["b", 9],
    ])
  })

  test("appends an element that exists only locally", () => {
    const { elements } = mergeRemoteElements([element("local-only", 1)], [element("a", 1)])
    expect(elements.map((el) => el.id)).toEqual(["a", "local-only"])
  })

  // Excalidraw renders in array order, so reordering on every remote update
  // would make z-order flicker while somebody else is drawing.
  test("follows the shared scene's order", () => {
    const { elements } = mergeRemoteElements(
      [element("c", 1), element("a", 1)],
      [element("a", 1), element("b", 1), element("c", 1)],
    )
    expect(elements.map((el) => el.id)).toEqual(["a", "b", "c"])
  })

  test("keeps deleted tombstones, which Excalidraw filters itself", () => {
    const { elements } = mergeRemoteElements([], [element("gone", 2, 1, { isDeleted: true })])
    expect(elements).toHaveLength(1)
    expect(elements[0].isDeleted).toBe(true)
  })

  // Excalidraw drives a gesture by mutating one element object in place, so
  // the merge has to hand back that same object — an equal-valued clone is a
  // different element as far as the canvas is concerned.
  test("preserves object identity for elements the local copy wins", () => {
    const mine = element("a", 5)
    const { elements } = mergeRemoteElements([mine], [element("a", 2)])
    expect(elements[0]).toBe(mine)
  })

  test("does not swap the element under an active gesture", () => {
    const stroke = element("stroke", 2)
    const { elements } = mergeRemoteElements(
      [stroke],
      [element("stroke", 40)],
      new Set(["stroke"]),
    )
    expect(elements[0]).toBe(stroke)
  })

  // `accepted` feeds lastSeen, which means "version this client has published".
  // Recording a locally-won element there would convince writeLocalElements
  // that an unpublished version was already out in the room.
  test("reports only the versions actually taken from the shared scene", () => {
    const { accepted } = mergeRemoteElements(
      [element("mine", 5), element("local-only", 3)],
      [element("mine", 2), element("theirs", 9)],
    )
    expect(accepted).toEqual(new Map([["theirs", 9]]))
  })

  test("a local change that coincides with a remote update still publishes", () => {
    const doc = new YDoc()
    const seen = seedLastSeen([])

    // This client draws, and publishes what it has so far.
    writeLocalElements(doc, [element("stroke", 4)], seen)

    // Somebody else's update lands. The merge reads the whole shared map back,
    // which includes this client's own stroke.
    const { accepted } = mergeRemoteElements(
      [element("stroke", 5)],
      [element("stroke", 4), element("theirs", 1)],
    )
    for (const [id, version] of accepted) seen.set(id, version)

    // The final state of the stroke is still this client's to publish.
    expect(writeLocalElements(doc, [element("stroke", 5)], seen)).toBe(1)
    expect(readElements(doc).find((el) => el.id === "stroke")?.version).toBe(5)
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

describe("paint order", () => {
  // The bug this exists to prevent: elements live in a Y.Map keyed by id,
  // which has no order, and Yjs iterates it by CRDT structure — so two peers
  // saw different arrays for identical state. Excalidraw paints the array back
  // to front, so an arrow was over the box for one person and under it for the
  // other, with nothing looking wrong to either.
  test("is computed from the elements, not from map iteration", () => {
    const doc = new YDoc()
    // Deliberately inserted in an order that is not the paint order.
    writeLocalElements(
      doc,
      [
        { ...element("front", 1), z: 2 } as unknown as ExcalidrawElement,
        { ...element("back", 1), z: 0 } as unknown as ExcalidrawElement,
        { ...element("middle", 1), z: 1 } as unknown as ExcalidrawElement,
      ],
      new Map(),
    )

    expect(readElements(doc).map((el) => el.id)).toEqual(["back", "middle", "front"])
  })

  // What the operator asked for: arrows under the boxes.
  test("a negative layer puts a shape behind everything a person drew", () => {
    const doc = new YDoc()
    writeLocalElements(
      doc,
      [
        { ...element("box", 1), index: "a1" } as unknown as ExcalidrawElement,
        { ...element("arrow", 1), z: -1 } as unknown as ExcalidrawElement,
      ],
      new Map(),
    )

    expect(readElements(doc).map((el) => el.id)).toEqual(["arrow", "box"])
  })

  // Shapes a person drew carry Excalidraw's fractional index and no z. Their
  // arrangement has to survive, which means ordering by that index rather than
  // ignoring it — which is what we used to do.
  test("hand-drawn shapes keep the order the app gave them", () => {
    const doc = new YDoc()
    writeLocalElements(
      doc,
      [
        { ...element("third", 1), index: "a3" } as unknown as ExcalidrawElement,
        { ...element("first", 1), index: "a1" } as unknown as ExcalidrawElement,
        { ...element("second", 1), index: "a2" } as unknown as ExcalidrawElement,
      ],
      new Map(),
    )

    expect(readElements(doc).map((el) => el.id)).toEqual(["first", "second", "third"])
  })

  // Two peers must agree, whatever order their maps happen to iterate in.
  test("two clients paint the same scene in the same order", () => {
    const a = new YDoc()
    const b = new YDoc()
    writeLocalElements(a, [{ ...element("one", 1), z: 5 } as unknown as ExcalidrawElement], new Map())
    writeLocalElements(b, [{ ...element("two", 1), z: 1 } as unknown as ExcalidrawElement], new Map())

    const updateA = encodeStateAsUpdate(a)
    applyUpdate(a, encodeStateAsUpdate(b))
    applyUpdate(b, updateA)

    expect(readElements(a).map((el) => el.id)).toEqual(readElements(b).map((el) => el.id))
    expect(readElements(a).map((el) => el.id)).toEqual(["two", "one"])
  })

  test("the sort is total, so ties never reorder between reads", () => {
    const doc = new YDoc()
    writeLocalElements(
      doc,
      [element("bbb", 1), element("aaa", 1), element("ccc", 1)],
      new Map(),
    )
    expect(readElements(doc).map((el) => el.id)).toEqual(["aaa", "bbb", "ccc"])
  })
})
