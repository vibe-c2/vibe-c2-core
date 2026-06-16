import { create } from "zustand"

// Per-viewer, ephemeral "which large code blocks are expanded" state.
//
// Large code blocks (> COLLAPSE_LINES) render collapsed to a fixed-height
// scroll viewport by default; this store records the ones the *current viewer*
// chose to expand. It is deliberately:
//   - Local, never synced to Yjs — expanding a block on my screen must not
//     expand it on a collaborator's. (Storing it in the document would make
//     collaborators fight over the flag.)
//   - Keyed by the code block's stable `blockId` attr, NOT by ProseMirror node
//     identity or position — y-prosemirror replaces node references on remote
//     sync, which would otherwise reset a viewer's expansion every time a
//     teammate edited the doc. The stable id lets expansion survive that.
//   - Not persisted across reloads. Expansion is a transient reading choice.
interface WikiCodeExpansionState {
  /** Set of blockIds the viewer has explicitly expanded. */
  expanded: ReadonlySet<string>
  toggle: (blockId: string) => void
}

export const useWikiCodeExpansionStore = create<WikiCodeExpansionState>((set) => ({
  expanded: new Set<string>(),

  toggle: (blockId) =>
    set((state) => {
      const next = new Set(state.expanded)
      if (next.has(blockId)) {
        next.delete(blockId)
      } else {
        next.add(blockId)
      }
      return { expanded: next }
    }),
}))
