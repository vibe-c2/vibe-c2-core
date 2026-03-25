import { create } from "zustand"

interface AppState {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
}

const STORAGE_KEY = "app_state"

function loadState(): Partial<Pick<AppState, "sidebarOpen">> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore corrupt data
  }
  return {}
}

function saveState(state: Pick<AppState, "sidebarOpen">) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: loadState().sidebarOpen ?? true,

  setSidebarOpen: (open) => {
    saveState({ sidebarOpen: open })
    set({ sidebarOpen: open })
  },
}))
