import { create } from "zustand"

export interface ScopedOperation {
  id: string
  name: string
  description: string
}

interface ScopedOperationState {
  scopedOperation: ScopedOperation | null
  isValidating: boolean

  /** Select an operation as the active scope. Persists to localStorage. */
  scopeOperation: (op: ScopedOperation) => void
  /** Clear the active scope. Removes from localStorage. */
  unscopeOperation: () => void
  /** Clear in-memory state only (used on logout — localStorage survives for re-login restore). */
  reset: () => void
  /** Read scope from localStorage for the given user. Sets isValidating if found. */
  hydrate: (userId: string) => void
  setValidating: (v: boolean) => void
}

/** localStorage key scoped to a specific user to prevent cross-user leakage. */
function storageKey(userId: string) {
  return `scoped_operation_${userId}`
}

/** The userId that was last used to hydrate, so scope/unscope can target the right key. */
let activeUserId: string | null = null

function loadFromStorage(userId: string): ScopedOperation | null {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore corrupt data
  }
  return null
}

function saveToStorage(op: ScopedOperation) {
  if (!activeUserId) return
  localStorage.setItem(storageKey(activeUserId), JSON.stringify(op))
}

function removeFromStorage() {
  if (!activeUserId) return
  localStorage.removeItem(storageKey(activeUserId))
}

export const useScopedOperationStore = create<ScopedOperationState>((set) => ({
  scopedOperation: null,
  isValidating: false,

  scopeOperation: (op) => {
    saveToStorage(op)
    set({ scopedOperation: op, isValidating: false })
  },

  unscopeOperation: () => {
    removeFromStorage()
    set({ scopedOperation: null, isValidating: false })
  },

  reset: () => {
    set({ scopedOperation: null, isValidating: false })
  },

  hydrate: (userId) => {
    activeUserId = userId
    const stored = loadFromStorage(userId)
    if (stored) {
      set({ scopedOperation: stored, isValidating: true })
    }
  },

  setValidating: (v) => set({ isValidating: v }),
}))
