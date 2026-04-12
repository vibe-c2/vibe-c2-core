import { create } from "zustand"
import { useAuthStore } from "@/stores/auth"

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
    activeUserId = null
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

// Auto-reset scope when the user logs out (localStorage preserved for re-login restore).
useAuthStore.subscribe((state, prevState) => {
  if (prevState.isAuthenticated && !state.isAuthenticated) {
    useScopedOperationStore.getState().reset()
  }
})

// --- Cross-tab sync via storage event ---
// When another tab writes/removes the scoped_operation key, mirror the change
// into this tab's Zustand state. The storage event fires only in *other* tabs,
// never in the tab that performed the write — exactly the semantic we need.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e: StorageEvent) => {
    if (!activeUserId || e.key !== storageKey(activeUserId)) return

    const store = useScopedOperationStore.getState()

    if (e.newValue) {
      try {
        const op: ScopedOperation = JSON.parse(e.newValue)
        store.scopeOperation(op)
        // Mark as validating so the guard re-checks access for this operation.
        useScopedOperationStore.setState({ isValidating: true })
      } catch {
        // Corrupt value from another tab — ignore.
      }
    } else {
      store.unscopeOperation()
    }
  })
}
