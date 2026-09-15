import { create } from "zustand"
import { useAuthStore } from "@/stores/auth"

export interface ScopedOperation {
  id: string
  name: string
  description: string
}

/** How many recently scoped operations the picker keeps. */
export const RECENT_OPERATIONS_LIMIT = 8

interface ScopedOperationState {
  scopedOperation: ScopedOperation | null
  /**
   * Operations this user scoped most recently, newest first, capped at
   * RECENT_OPERATIONS_LIMIT. Feeds the picker's "Recent" section. Persisted
   * per user like the scope itself.
   */
  recentOperations: ScopedOperation[]
  isValidating: boolean
  /** True once `hydrate` has been called for the current user (regardless of
   *  whether anything was found in localStorage). Lets the route guard avoid
   *  flash redirects on scoped pages while initial hydration is pending. */
  hydrated: boolean

  /** Select an operation as the active scope. Persists to localStorage. */
  scopeOperation: (op: ScopedOperation) => void
  /**
   * The wiki document the route guard must keep open across the next scope
   * change. Set by `scopeOperationForWikiDocument`, consumed once by the
   * guard. Null otherwise.
   */
  retainedWikiDocumentId: string | null
  /**
   * Switch scope to the operation a wiki document belongs to, keeping that
   * document open. A plain `scopeOperation` drops any open document because
   * the guard cannot know whether it still belongs to the new scope; here
   * it does, by construction.
   */
  scopeOperationForWikiDocument: (
    op: ScopedOperation,
    documentId: string,
  ) => void
  /** Clear the retained document once the guard has honoured it. */
  clearRetainedWikiDocument: () => void
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

function recentsKey(userId: string) {
  return `recent_operations_${userId}`
}

function loadRecents(userId: string): ScopedOperation[] {
  try {
    const raw = localStorage.getItem(recentsKey(userId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (op): op is ScopedOperation =>
        !!op &&
        typeof op === "object" &&
        typeof (op as ScopedOperation).id === "string",
    )
  } catch {
    return []
  }
}

function saveRecents(recents: ScopedOperation[]) {
  if (!activeUserId) return
  try {
    localStorage.setItem(recentsKey(activeUserId), JSON.stringify(recents))
  } catch {
    // best-effort; the in-memory list still serves this session
  }
}

/** The list with `op` moved to the front, deduplicated, capped. */
export function withRecent(
  recents: ScopedOperation[],
  op: ScopedOperation,
): ScopedOperation[] {
  return [op, ...recents.filter((r) => r.id !== op.id)].slice(
    0,
    RECENT_OPERATIONS_LIMIT,
  )
}

export const useScopedOperationStore = create<ScopedOperationState>(
  (set, get) => ({
    scopedOperation: null,
    recentOperations: [],
    isValidating: false,
    hydrated: false,
    retainedWikiDocumentId: null,

    scopeOperation: (op) => {
      saveToStorage(op)
      const recentOperations = withRecent(get().recentOperations, op)
      saveRecents(recentOperations)
      set({ scopedOperation: op, recentOperations, isValidating: false })
    },

    scopeOperationForWikiDocument: (op, documentId) => {
      saveToStorage(op)
      const recentOperations = withRecent(get().recentOperations, op)
      saveRecents(recentOperations)
      set({
        scopedOperation: op,
        recentOperations,
        isValidating: false,
        retainedWikiDocumentId: documentId,
      })
    },

    clearRetainedWikiDocument: () => set({ retainedWikiDocumentId: null }),

    unscopeOperation: () => {
      removeFromStorage()
      set({ scopedOperation: null, isValidating: false })
    },

    reset: () => {
      activeUserId = null
      set({
        scopedOperation: null,
        recentOperations: [],
        isValidating: false,
        hydrated: false,
        retainedWikiDocumentId: null,
      })
    },

    hydrate: (userId) => {
      activeUserId = userId
      const stored = loadFromStorage(userId)
      const recentOperations = loadRecents(userId)
      set(
        stored
          ? {
              scopedOperation: stored,
              recentOperations,
              isValidating: true,
              hydrated: true,
            }
          : { recentOperations, hydrated: true },
      )
    },

    setValidating: (v) => set({ isValidating: v }),
  }),
)

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
