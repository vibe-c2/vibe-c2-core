import { create } from "zustand"

export type DropPosition = "before" | "inside" | "after"

export interface DropTarget {
  id: string
  position: DropPosition
}

interface WikiDragState {
  activeId: string | null
  dropTarget: DropTarget | null
  setActiveId: (id: string | null) => void
  setDropTarget: (target: DropTarget | null) => void
  reset: () => void
}

// Lives in its own store so per-row drag highlights don't ride on the same
// state container that powers expansion, dialogs, etc. — keeps WikiTreeNode
// subscriptions narrow enough that only the two affected rows re-render
// when the hovered drop target changes during a drag.
export const useWikiDragStore = create<WikiDragState>((set) => ({
  activeId: null,
  dropTarget: null,
  setActiveId: (activeId) => set({ activeId }),
  setDropTarget: (dropTarget) => set({ dropTarget }),
  reset: () => set({ activeId: null, dropTarget: null }),
}))
