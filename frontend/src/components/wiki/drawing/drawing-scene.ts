// The shared representation of a drawing page's scene, and the rules for
// merging one canvas into another.
//
// Deliberately free of React, of the Hocuspocus provider, and of Excalidraw
// itself (its types are imported, which erases at build time — importing the
// library here would drag its chunk into every page that touches a Y.Doc).
// What is left is a pure function of a Y.Doc, which is what makes it testable
// without a browser and reusable by a future inline-diagram node that has no
// page of its own.
//
// Why a Y.Map keyed by element id, rather than a Y.Array of elements or a
// Y.Map per field: Excalidraw already versions its elements individually with
// `version`/`versionNonce` and reconciles at exactly that granularity. Matching
// it means concurrent edits to two different shapes never contend, and two
// edits to the *same* shape resolve the way Excalidraw itself would resolve
// them. A Y.Array would make every insertion a positional conflict for no gain,
// since scene order is carried by the elements themselves.
//
// Why the elements sit at a *root* key rather than nested inside a scene map:
// a nested Y.Map has to be installed by whichever client touches the scene
// first, and two clients opening a blank drawing at the same moment each
// install their own. Yjs resolves that like any other conflicting value — one
// map wins outright — and every element written into the loser is gone, with
// both canvases agreeing on the survivor so nothing ever looks wrong. Root
// keys have no such race: `ydoc.getMap(name)` resolves to the same type for
// every client by construction. The shared appState lives at its own root key
// for the same reason.

import { Map as YMap } from "yjs"
import type { Doc as YDoc } from "yjs"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"

/** The Y.Doc root key holding the scene. Tiptap owns "default"; this is ours. */
export const DRAWING_ROOT_KEY = "excalidraw"

/**
 * Transaction origin stamped on every write this client makes.
 *
 * Without it the observer would hear its own writes back and push them into
 * the canvas as if they were remote, which at best wastes a render and at
 * worst fights the user's pointer mid-drag.
 */
export const LOCAL_ORIGIN = "drawing-local"

/** Root key holding the shared, page-level slice of Excalidraw's appState.
 * Separate root rather than a field inside the element map: they change at
 * completely different rates and nothing should have to diff one to find the
 * other. */
export const DRAWING_APP_STATE_KEY = "excalidraw:appState"

const BACKGROUND_FIELD = "viewBackgroundColor"
const GRID_FIELD = "gridSize"

/** The subset of Excalidraw's appState that belongs to the page rather than
 * to the person looking at it. Scroll, zoom, selection and the active tool are
 * deliberately absent: sharing those would drag every collaborator's viewport
 * around and make two people unable to look at different parts of one diagram. */
export interface SharedAppState {
  viewBackgroundColor?: string
  gridSize?: number | null
}

/**
 * The element store: element id to element.
 *
 * Idempotent and race-free — every client that asks for this root key gets the
 * same map, with no "who created it" question to resolve.
 */
export function getElementsMap(ydoc: YDoc): YMap<ExcalidrawElement> {
  return ydoc.getMap<ExcalidrawElement>(DRAWING_ROOT_KEY)
}

/** The shared appState store. */
export function getAppStateMap(ydoc: YDoc): YMap<unknown> {
  return ydoc.getMap(DRAWING_APP_STATE_KEY)
}

/**
 * Whether this room already holds a drawing.
 *
 * Reads the shared state rather than the document's `kind`, because the
 * callers that need it most are the ones guarding against the kind having been
 * routed wrongly in the first place. Cheap: root types are resolved by name,
 * and asking for an absent one registers an empty map without emitting an
 * update.
 */
export function isDrawingRoom(ydoc: YDoc): boolean {
  return getElementsMap(ydoc).size > 0
}

/** Every element in the shared scene, including deleted tombstones — Excalidraw
 * expects to receive those and filters them itself. */
export function readElements(ydoc: YDoc): ExcalidrawElement[] {
  return [...getElementsMap(ydoc).values()]
}

export function readSharedAppState(ydoc: YDoc): SharedAppState {
  const stored = getAppStateMap(ydoc)
  const state: SharedAppState = {}
  const background = stored.get(BACKGROUND_FIELD)
  if (typeof background === "string") state.viewBackgroundColor = background
  if (stored.has(GRID_FIELD)) state.gridSize = stored.get(GRID_FIELD) as number | null
  return state
}

/**
 * Excalidraw's own conflict rule, applied to one element.
 *
 * Returns true when the local copy should be kept and the remote one dropped:
 * a higher version wins, and an equal version is broken by the lower nonce.
 * The nonce tiebreak is arbitrary but it must be *consistent* — every client
 * has to reach the same answer independently, or two canvases settle into
 * different states and neither ever learns it.
 */
export function shouldKeepLocal(
  local: ExcalidrawElement | undefined,
  remote: ExcalidrawElement,
): boolean {
  if (!local) return false
  if (local.version > remote.version) return true
  return local.version === remote.version && local.versionNonce < remote.versionNonce
}

/**
 * Merge the shared scene into the canvas's current elements.
 *
 * Order follows the shared scene, with any purely-local element (one this
 * client has drawn but not yet flushed) appended. Excalidraw renders in array
 * order, so a stable ordering matters: reordering on every remote update would
 * make z-order flicker while someone else draws.
 */
export function mergeRemoteElements(
  local: readonly ExcalidrawElement[],
  remote: readonly ExcalidrawElement[],
): ExcalidrawElement[] {
  const localByID = new Map(local.map((el) => [el.id, el]))
  const merged: ExcalidrawElement[] = []
  const taken = new Set<string>()

  for (const remoteEl of remote) {
    const localEl = localByID.get(remoteEl.id)
    merged.push(shouldKeepLocal(localEl, remoteEl) ? (localEl as ExcalidrawElement) : remoteEl)
    taken.add(remoteEl.id)
  }
  for (const localEl of local) {
    if (!taken.has(localEl.id)) merged.push(localEl)
  }
  return merged
}

/**
 * Push locally-changed elements into the shared scene.
 *
 * `lastSeen` maps element id to the version this client last wrote, and is
 * mutated in place. Diffing against it is what keeps a drag from writing every
 * element in the scene on every animation frame: Excalidraw hands us the whole
 * element array on each change, and only the ones whose version moved are ours
 * to publish.
 *
 * Returns the number of elements written, which the caller uses to decide
 * whether anything happened at all.
 */
export function writeLocalElements(
  ydoc: YDoc,
  elements: readonly ExcalidrawElement[],
  lastSeen: Map<string, number>,
): number {
  const shared = getElementsMap(ydoc)
  const changed = elements.filter((el) => lastSeen.get(el.id) !== el.version)
  if (changed.length === 0) return 0

  ydoc.transact(() => {
    for (const el of changed) {
      // Stored as a plain object: Yjs treats it as one opaque value, so an
      // element update is a single map entry replacement rather than a
      // field-by-field diff nobody asked for.
      shared.set(el.id, { ...el })
      lastSeen.set(el.id, el.version)
    }
  }, LOCAL_ORIGIN)

  return changed.length
}

/** Seed `lastSeen` from the shared scene, so the first local change after a
 * sync does not re-publish everything that arrived from it. */
export function seedLastSeen(elements: readonly ExcalidrawElement[]): Map<string, number> {
  return new Map(elements.map((el) => [el.id, el.version]))
}

/**
 * Publish the shared appState, field by field.
 *
 * Per-field rather than one object: two people changing the background and the
 * grid at the same moment would otherwise each write a whole appState and one
 * would silently revert the other's unrelated change.
 */
export function writeSharedAppState(ydoc: YDoc, next: SharedAppState): void {
  const stored = getAppStateMap(ydoc)
  const current = readSharedAppState(ydoc)

  const backgroundChanged =
    next.viewBackgroundColor !== undefined &&
    next.viewBackgroundColor !== current.viewBackgroundColor
  const gridChanged = next.gridSize !== undefined && next.gridSize !== current.gridSize
  if (!backgroundChanged && !gridChanged) return

  ydoc.transact(() => {
    if (backgroundChanged) stored.set(BACKGROUND_FIELD, next.viewBackgroundColor)
    if (gridChanged) stored.set(GRID_FIELD, next.gridSize)
  }, LOCAL_ORIGIN)
}
