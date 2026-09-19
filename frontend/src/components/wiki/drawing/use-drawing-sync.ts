// Bind a drawing page's canvas to its Y.js room.
//
// The pure half of this lives in drawing-scene.ts; what is here is the part
// that has to know about React, the Hocuspocus provider and Excalidraw's
// imperative API. Keeping the split means the merge rules can be tested
// without a browser, and this file stays small enough to read in one go.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Doc as YDoc } from "yjs"
import type { HocuspocusProvider } from "@hocuspocus/provider"
import type {
  ExcalidrawImperativeAPI,
  AppState,
  BinaryFileData,
  BinaryFiles,
} from "@excalidraw/excalidraw/types"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import { toast } from "sonner"

import { getCursorColor } from "@/lib/cursor-colors"
import {
  LOCAL_ORIGIN,
  getElementsMap,
  mergeRemoteElements,
  readElements,
  readSharedAppState,
  seedLastSeen,
  writeLocalElements,
  writeSharedAppState,
} from "./drawing-scene"
import {
  toExcalidrawCollaborators,
  type DrawingAwarenessState,
} from "./drawing-collaborators"
import {
  applyImageIDs,
  pendingImages,
  uploadPendingImages,
  wikiImageFiles,
  wikiImageIDs,
  wikiImageURL,
} from "./drawing-images"

interface UseDrawingSyncArgs {
  /** The page this canvas belongs to. Images are uploaded against it, which is
   * also what scopes them for the attachment sweeper. */
  documentId: string
  ydoc: YDoc
  provider: HocuspocusProvider | null
  /** Whether this client may write. Viewers still receive live updates; the
   * server rejects any Y.js update they emit regardless, so this is about not
   * lying to the user rather than about enforcement. */
  isEditor: boolean
  user: { userId: string; username: string } | null
}

interface UseDrawingSyncReturn {
  onExcalidrawAPI: (api: ExcalidrawImperativeAPI) => void
  onChange: (
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => void
  onPointerUpdate: (payload: {
    pointer: { x: number; y: number; tool: "pointer" | "laser" }
    button: "up" | "down"
  }) => void
  /** The scene as it stood when the canvas mounted. Read once — Excalidraw
   * takes initialData at mount and everything after that arrives by
   * updateScene. */
  initialElements: ExcalidrawElement[]
  initialBackgroundColor: string | undefined
  /** Image files for the scene as it arrived, pointing at their wiki URLs. */
  initialFiles: BinaryFiles
}

export function useDrawingSync({
  documentId,
  ydoc,
  provider,
  isEditor,
  user,
}: UseDrawingSyncArgs): UseDrawingSyncReturn {
  // Held in state rather than a ref so effects can depend on it: the canvas
  // hands its API over during mount, after the first render, and a ref would
  // leave those effects to run once against null and never re-run.
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null)

  // Presence channel. Carries the cursor, the laser's press state and the
  // selection — everything about a person rather than about the drawing. The
  // "user" field is written in the same shape the prose editor uses
  // (wiki-editor.tsx), so one person is coloured identically whether they are
  // typing on a page or drawing on a diagram.
  const awareness = provider?.awareness ?? null

  // Read once, at mount. The pane only renders the canvas after the room has
  // synced, so by the time this runs the scene is whatever the server had.
  const [initial] = useState(() => ({
    elements: readElements(ydoc),
    appState: readSharedAppState(ydoc),
  }))

  // Element id to the version this client last published. Diffing against it
  // is what stops a drag republishing the whole scene on every frame.
  //
  // Seeded from the scene that arrived with the initial sync, so the first
  // local change does not re-send all of it straight back to everyone. Seeded
  // lazily rather than in the useState initialiser above because writing a ref
  // during render is what it looks like: a second piece of state being
  // initialised where React cannot see it.
  const lastSeenRef = useRef<Map<string, number> | null>(null)
  const lastSeen = useCallback(() => {
    lastSeenRef.current ??= seedLastSeen(initial.elements)
    return lastSeenRef.current
  }, [initial])

  const onExcalidrawAPI = useCallback((next: ExcalidrawImperativeAPI) => {
    setApi(next)
  }, [])

  // Shared scene to canvas.
  useEffect(() => {
    if (!api) return
    const elements = getElementsMap(ydoc)

    const handler = (_event: unknown, transaction: { origin: unknown }) => {
      // Our own writes come back through here too. Applying them would at best
      // waste a render and at worst fight the user's pointer mid-drag.
      if (transaction.origin === LOCAL_ORIGIN) return

      // Including deleted: tombstones are how Excalidraw learns that somebody
      // else erased a shape. Merging against the non-deleted view would keep
      // resurrecting it.
      const merged = mergeRemoteElements(
        api.getSceneElementsIncludingDeleted(),
        readElements(ydoc),
      )
      // These versions are now what this client holds, so record them —
      // otherwise the next local change republishes everything that just
      // arrived, and two clients bounce the same elements back and forth.
      const seen = lastSeen()
      for (const el of merged) seen.set(el.id, el.version)

      // A peer's image arrives as an element carrying a wiki image id, with no
      // file entry on this client — the canvas would render an empty frame.
      // Register the ones we do not have; the bytes come from the URL.
      registerWikiImages(api, merged)

      api.updateScene({ elements: merged })
    }

    elements.observe(handler)
    return () => elements.unobserve(handler)
  }, [ydoc, api, lastSeen])

  // Images the canvas has taken on but not yet stored. Tracked so a slow
  // upload is not started again by every subsequent change event — onChange
  // fires continuously while the user keeps drawing.
  const uploadingRef = useRef<Set<string>>(new Set())

  const adoptImages = useCallback(
    async (elements: readonly ExcalidrawElement[], files: BinaryFiles) => {
      if (!api || !isEditor) return

      const pending = pendingImages(elements, files).filter(
        (image) => !uploadingRef.current.has(image.fileId),
      )
      if (pending.length === 0) return
      for (const image of pending) uploadingRef.current.add(image.fileId)

      const mapping = await uploadPendingImages(documentId, pending, (fileId, error) => {
        // Released so the next change retries. The image keeps rendering
        // locally in the meantime, which is why this is a warning rather than
        // something that removes it from under the person who added it.
        uploadingRef.current.delete(fileId)
        toast.error("Could not store an image on this drawing.", {
          description: error instanceof Error ? error.message : undefined,
        })
      })
      if (mapping.size === 0) return

      // Register the stored copies before rewriting the elements, so there is
      // no frame in which an element points at a file the canvas cannot find.
      api.addFiles(
        [...mapping.values()].map(
          (id) =>
            ({
              id,
              dataURL: wikiImageURL(id),
              mimeType: "image/png",
              created: Date.now(),
            }) as unknown as BinaryFileData,
        ),
      )
      api.updateScene({
        elements: applyImageIDs(api.getSceneElementsIncludingDeleted(), mapping),
      })
    },
    [api, documentId, isEditor],
  )

  // What this client has selected, as last published. Selection changes far
  // less often than the scene does, and onChange fires on every mutation —
  // including every frame of a drag — so without this the canvas would
  // broadcast an awareness update per frame to say nothing had changed.
  const lastSelectionRef = useRef("")

  const publishSelection = useCallback(
    (appState: AppState) => {
      if (!awareness) return
      const selected = appState.selectedElementIds ?? {}
      // Sorted so the key describes the selection rather than the order
      // Excalidraw happened to record it in.
      const key = Object.keys(selected).sort().join(",")
      if (key === lastSelectionRef.current) return
      lastSelectionRef.current = key

      awareness.setLocalState({
        ...(awareness.getLocalState() ?? {}),
        selectedElementIds: selected,
      })
    },
    [awareness],
  )

  // Canvas to shared scene.
  const onChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      // Ungated: a selection is presence, not content, and a viewer pointing at
      // a shape is exactly as worth seeing as a viewer's cursor — which is
      // already published for them.
      publishSelection(appState)

      if (!isEditor) return
      writeLocalElements(ydoc, elements, lastSeen())
      writeSharedAppState(ydoc, {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize,
      })
      // Deliberately after the write: the element referencing the not-yet-
      // uploaded image is still published, so a peer sees the shape appear
      // immediately and the picture fills in a moment later when the rewrite
      // lands. Withholding it until the upload finished would make a large
      // paste look like nothing had happened.
      void adoptImages(elements, files)
    },
    [ydoc, isEditor, lastSeen, adoptImages, publishSelection],
  )

  useEffect(() => {
    if (!awareness) return
    awareness.setLocalStateField("user", {
      name: user?.username ?? "Anonymous",
      color: getCursorColor(user?.userId ?? "anon"),
    })
  }, [awareness, user?.userId, user?.username])

  // Other people's cursors. Excalidraw takes collaborators through
  // updateScene rather than as a prop, so this is an effect rather than a
  // value handed back to the component.
  useEffect(() => {
    if (!awareness || !api) return

    const update = () => {
      api.updateScene({
        collaborators: toExcalidrawCollaborators(
          awareness.getStates() as Map<number, DrawingAwarenessState>,
          awareness.clientID,
        ),
      })
    }

    update()
    awareness.on("change", update)
    return () => awareness.off("change", update)
  }, [awareness, api])

  const onPointerUpdate = useCallback(
    (payload: {
      pointer: { x: number; y: number; tool: "pointer" | "laser" }
      button: "up" | "down"
    }) => {
      if (!awareness) return
      // Pointer position is presence, not content: it rides on awareness and
      // is never persisted. Someone's cursor should not survive their session.
      //
      // The press state travels with it, because a remote laser trail is drawn
      // only while the peer is pressing — see DrawingAwarenessState.button.
      //
      // Both go in a single setLocalState rather than two setLocalStateField
      // calls: each field write broadcasts an awareness update of its own, and
      // this fires on every pointermove. Merging over the current state keeps
      // the `user` field, which setLocalState would otherwise replace.
      awareness.setLocalState({
        ...(awareness.getLocalState() ?? {}),
        pointer: payload.pointer,
        button: payload.button,
      })
    },
    [awareness],
  )

  return useMemo(
    () => ({
      onExcalidrawAPI,
      onChange,
      onPointerUpdate,
      initialElements: initial.elements,
      initialBackgroundColor: initial.appState.viewBackgroundColor,
      initialFiles: wikiImageFiles(initial.elements),
    }),
    [onExcalidrawAPI, onChange, onPointerUpdate, initial],
  )
}

/**
 * Make sure every wiki image the scene references has a file entry.
 *
 * Excalidraw renders an image element by looking its fileId up in the files
 * map; an element whose file is missing draws as an empty placeholder with no
 * error. That is the normal state for anything that arrived from a peer, so
 * this runs on every remote merge rather than only at load.
 */
function registerWikiImages(
  api: ExcalidrawImperativeAPI,
  elements: readonly ExcalidrawElement[],
): void {
  const known = api.getFiles()
  const missing = wikiImageIDs(elements).filter((id) => !known[id as keyof BinaryFiles])
  if (missing.length === 0) return

  api.addFiles(
    missing.map(
      (id) =>
        ({
          id,
          dataURL: wikiImageURL(id),
          mimeType: "image/png",
          created: Date.now(),
        }) as unknown as BinaryFileData,
    ),
  )
}
