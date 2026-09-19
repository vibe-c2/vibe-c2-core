// Translate Hocuspocus awareness into the shape Excalidraw draws other
// people's cursors from.
//
// Awareness is the same channel the prose editor's carets ride on
// (wiki-editor.tsx), and the "user" field is written in the same shape by both,
// so one person editing a page and another drawing on a diagram are coloured
// identically across the two surfaces. That consistency is the point of
// reusing getCursorColor rather than letting Excalidraw assign its own palette.

import type { Collaborator, SocketId } from "@excalidraw/excalidraw/types"

/** What each client publishes about itself. `user` matches the prose editor's
 * field exactly; `pointer` is ours. */
export interface DrawingAwarenessState {
  user?: { name?: string; color?: string }
  pointer?: { x: number; y: number; tool: "pointer" | "laser" }
  /**
   * Whether the peer is pressing. Needed for the laser pointer, not for the
   * cursor: Excalidraw draws a remote laser trail only while a collaborator
   * has `pointer.tool === "laser"` AND `button === "down"`, and ends the trail
   * on `"up"`. Without it their cursor moves and no trail is ever drawn —
   * which looks like the laser being unsupported rather than a field being
   * dropped in transit.
   */
  button?: "up" | "down"
  /**
   * Which shapes the peer has selected, keyed by element id — the shape
   * Excalidraw's own appState uses, because it reads this with Object.keys to
   * build its remote-selection map. Each peer's selection is then outlined in
   * their cursor colour, dashed to tell it apart from your own.
   */
  selectedElementIds?: Record<string, true>
}

/**
 * Build Excalidraw's collaborator map from the awareness states of everyone
 * else in the room.
 *
 * `localClientID` is excluded rather than filtered by Excalidraw later: a
 * client that renders its own cursor sees a second pointer lagging its real
 * one by a round trip, which reads as broken rather than as collaborative.
 *
 * States arrive keyed by Yjs client id, which is a number; Excalidraw keys by
 * its own opaque SocketId. The two never need to correspond — the key only has
 * to be stable for as long as the peer is connected, which the client id is.
 */
export function toExcalidrawCollaborators(
  states: Map<number, DrawingAwarenessState>,
  localClientID: number,
): Map<SocketId, Collaborator> {
  const collaborators = new Map<SocketId, Collaborator>()

  for (const [clientID, state] of states) {
    if (clientID === localClientID) continue

    // A peer that has connected but not yet published anything about itself
    // would render as an unnamed, uncoloured ghost. Wait for it instead.
    if (!state?.user) continue

    const color = state.user.color ?? "#607D8B"
    collaborators.set(String(clientID) as SocketId, {
      id: String(clientID),
      username: state.user.name ?? "Anonymous",
      // Excalidraw wants a fill and a stroke; one colour for both keeps the
      // cursor reading as a single mark rather than an outlined shape.
      color: { background: color, stroke: color },
      pointer: state.pointer,
      button: state.button,
      selectedElementIds: state.selectedElementIds,
    })
  }

  return collaborators
}
