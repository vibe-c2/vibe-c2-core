import { create } from "zustand"
import { useAuthStore } from "@/stores/auth"

export type WikiTreeMode = "operation" | "public"

const DEFAULT_MODE: WikiTreeMode = "operation"

interface WikiTreeModeState {
  mode: WikiTreeMode
  setMode: (mode: WikiTreeMode) => void
  /** Read mode from storage for the given user. */
  hydrate: (userId: string) => void
  /**
   * Clear in-memory state (used on logout). Storage is left intact on
   * purpose: sessionStorage restores this tab's mode on same-tab re-login,
   * localStorage seeds new tabs. Keys are per-user, so nothing bleeds
   * between accounts.
   */
  reset: () => void
}

// Tree mode is per-tab view state ("what is this tab looking at"), not a
// shared preference — two tabs may browse different trees at once. So
// sessionStorage (per-tab) is the source of truth, and localStorage only
// seeds brand-new tabs with the last-used mode. There is deliberately no
// cross-tab sync.
//
// Keys are per-user so a shared browser doesn't bleed one user's preference
// into another's session. Mirrors the scoped-operation store.
function storageKey(userId: string) {
  return `wiki_tree_mode_${userId}`
}

let activeUserId: string | null = null

function parseMode(raw: string | null): WikiTreeMode | null {
  return raw === "operation" || raw === "public" ? raw : null
}

function loadFromStorage(userId: string): WikiTreeMode {
  const key = storageKey(userId)
  let mode = DEFAULT_MODE
  try {
    mode =
      parseMode(sessionStorage.getItem(key)) ??
      parseMode(localStorage.getItem(key)) ??
      DEFAULT_MODE
  } catch {
    // corrupt/unavailable storage — fall back to the default
  }
  // Pin the resolved mode to this tab immediately. Otherwise a tab that was
  // seeded from localStorage and never toggled would re-read the seed on
  // reload — and pick up whatever another tab wrote there in the meantime.
  try {
    sessionStorage.setItem(key, mode)
  } catch {
    // best-effort pin; the read above already succeeded
  }
  return mode
}

function saveToStorage(mode: WikiTreeMode) {
  if (!activeUserId) return
  try {
    const key = storageKey(activeUserId)
    sessionStorage.setItem(key, mode)
    // Last-used seed for future tabs; never read back in this tab.
    localStorage.setItem(key, mode)
  } catch {
    // storage unavailable (private mode quota etc.) — in-memory state still works
  }
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
