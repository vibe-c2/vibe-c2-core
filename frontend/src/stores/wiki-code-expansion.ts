import { create } from "zustand"

// Per-viewer, ephemeral "which large code blocks are expanded" state.
//
// Large code blocks (> COLLAPSE_LINES) render collapsed to a fixed-height
// preview by default; this store records the ones the *current viewer* chose
// to expand. It is deliberately:
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
  /**
   * Absolute set rather than a toggle: expansion is driven both by the
   * collapse button and by the caret entering a block, and the latter fires
   * from an effect — an idempotent setter keeps that safe to call on every
   * entry. Returning the identical state when nothing changes means such a
   * call subscribes no re-render.
   */
  setExpanded: (blockId: string, expanded: boolean) => void
}

export const useWikiCodeExpansionStore = create<WikiCodeExpansionState>((set) => ({
  expanded: new Set<string>(),

  setExpanded: (blockId, expanded) =>
    set((state) => {
      if (state.expanded.has(blockId) === expanded) return state
      const next = new Set(state.expanded)
      if (expanded) {
        next.add(blockId)
      } else {
        next.delete(blockId)
      }
      return { expanded: next }
    }),
}))
