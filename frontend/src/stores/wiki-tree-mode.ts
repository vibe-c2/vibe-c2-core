import { create } from "zustand"
import { useAuthStore } from "@/stores/auth"

export type WikiTreeMode = "operation" | "public"

const DEFAULT_MODE: WikiTreeMode = "operation"

interface WikiTreeModeState {
  mode: WikiTreeMode
  setMode: (mode: WikiTreeMode) => void
  /** Read mode from localStorage for the given user. */
  hydrate: (userId: string) => void
  /** Clear in-memory state (used on logout — localStorage survives for re-login restore). */
  reset: () => void
}

// localStorage key is per-user so a shared browser doesn't bleed one user's
// preference into another's session. Mirrors the scoped-operation store.
function storageKey(userId: string) {
  return `wiki_tree_mode_${userId}`
}

let activeUserId: string | null = null

function loadFromStorage(userId: string): WikiTreeMode {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (raw === "operation" || raw === "public") return raw
  } catch {
    // ignore corrupt data
  }
  return DEFAULT_MODE
}

function saveToStorage(mode: WikiTreeMode) {
  if (!activeUserId) return
  localStorage.setItem(storageKey(activeUserId), mode)
}

export const useWikiTreeModeStore = create<WikiTreeModeState>((set) => ({
  mode: DEFAULT_MODE,

  setMode: (mode) => {
    saveToStorage(mode)
    set({ mode })
  },

  hydrate: (userId) => {
    activeUserId = userId
    set({ mode: loadFromStorage(userId) })
  },

  reset: () => {
    activeUserId = null
    set({ mode: DEFAULT_MODE })
  },
}))

// Auto-reset on logout — keeps the same lifecycle as scoped-operation.
useAuthStore.subscribe((state, prevState) => {
  if (prevState.isAuthenticated && !state.isAuthenticated) {
    useWikiTreeModeStore.getState().reset()
  }
})

// Cross-tab sync via storage event so a toggle in one tab updates the others.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e: StorageEvent) => {
    if (!activeUserId || e.key !== storageKey(activeUserId)) return

    if (e.newValue === "operation" || e.newValue === "public") {
      useWikiTreeModeStore.setState({ mode: e.newValue })
    } else if (e.newValue === null) {
      useWikiTreeModeStore.setState({ mode: DEFAULT_MODE })
    }
  })
}
