import { describe, expect, test } from "vitest"
import type { SocketId } from "@excalidraw/excalidraw/types"

import {
  toExcalidrawCollaborators,
  type DrawingAwarenessState,
} from "./drawing-collaborators"

const LOCAL = 1
const PEER = 2

function states(
  entries: Record<number, DrawingAwarenessState>,
): Map<number, DrawingAwarenessState> {
  return new Map(Object.entries(entries).map(([id, s]) => [Number(id), s]))
}

describe("toExcalidrawCollaborators", () => {
  test("maps a peer's identity and cursor", () => {
    const result = toExcalidrawCollaborators(
      states({
        [PEER]: {
          user: { name: "operator", color: "#2196F3" },
          pointer: { x: 10, y: 20, tool: "pointer" },
        },
      }),
      LOCAL,
    )

    const peer = result.get(String(PEER) as SocketId)
    expect(peer?.username).toBe("operator")
    expect(peer?.color).toEqual({ background: "#2196F3", stroke: "#2196F3" })
    expect(peer?.pointer).toEqual({ x: 10, y: 20, tool: "pointer" })
  })

  // A client that renders its own cursor sees a second pointer lagging its
  // real one by a round trip, which reads as broken rather than collaborative.
  test("excludes the local client", () => {
    const result = toExcalidrawCollaborators(
      states({
        [LOCAL]: { user: { name: "me" }, pointer: { x: 0, y: 0, tool: "pointer" } },
        [PEER]: { user: { name: "them" }, pointer: { x: 1, y: 1, tool: "pointer" } },
      }),
      LOCAL,
    )

    expect([...result.keys()]).toEqual([String(PEER)])
  })

  test("skips a peer that has not published who it is yet", () => {
    const result = toExcalidrawCollaborators(
      states({ [PEER]: { pointer: { x: 1, y: 1, tool: "pointer" } } }),
      LOCAL,
    )
    expect(result.size).toBe(0)
  })

  // The laser pointer needs the press state as well as the position:
  // Excalidraw starts a remote trail only while a collaborator has
  // pointer.tool === "laser" AND button === "down", and ends it on "up".
  // Dropping `button` in transit leaves the cursor moving with no trail, which
  // looks like the laser being unsupported rather than a field going missing.
  test("forwards the press state, which the laser trail depends on", () => {
    const down = toExcalidrawCollaborators(
      states({
        [PEER]: {
          user: { name: "operator" },
          pointer: { x: 5, y: 5, tool: "laser" },
          button: "down",
        },
      }),
      LOCAL,
    )
    expect(down.get(String(PEER) as SocketId)?.button).toBe("down")

    // The release matters just as much — without it the trail never ends.
    const up = toExcalidrawCollaborators(
      states({
        [PEER]: {
          user: { name: "operator" },
          pointer: { x: 5, y: 5, tool: "laser" },
          button: "up",
        },
      }),
      LOCAL,
    )
    expect(up.get(String(PEER) as SocketId)?.button).toBe("up")
  })

  // Excalidraw reads this with Object.keys to build its remote-selection map,
  // then outlines each peer's shapes in their own cursor colour. The object
  // shape matters: it is keyed by element id, not a list of them.
  test("forwards the selection, keyed by element id", () => {
    const result = toExcalidrawCollaborators(
      states({
        [PEER]: {
          user: { name: "operator" },
          selectedElementIds: { "shape-a": true, "shape-b": true },
        },
      }),
      LOCAL,
    )

    expect(result.get(String(PEER) as SocketId)?.selectedElementIds).toEqual({
      "shape-a": true,
      "shape-b": true,
    })
  })

  test("an empty selection clears rather than lingering", () => {
    const result = toExcalidrawCollaborators(
      states({ [PEER]: { user: { name: "operator" }, selectedElementIds: {} } }),
      LOCAL,
    )

    expect(result.get(String(PEER) as SocketId)?.selectedElementIds).toEqual({})
  })
})
