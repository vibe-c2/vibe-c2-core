import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

// The list of tabs on the Findings page. New finding kinds (hashes, files,
// hosts, ...) are added here and to the page's tab switcher.
export type FindingsPageTab = "credentials" | "hashes"

interface FindingsStoreState {
  activeTab: FindingsPageTab
  setActiveTab: (tab: FindingsPageTab) => void
}

const TABS: readonly FindingsPageTab[] = ["credentials", "hashes"] as const

export const useFindingsStore = create<FindingsStoreState>()(
  persist(
    (set) => ({
      activeTab: "credentials",
      setActiveTab: (tab) => set({ activeTab: tab }),
    }),
    {
      name: "findings-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ activeTab: s.activeTab }),
      merge: (persisted, current) => {
        const p = persisted as Partial<FindingsStoreState> | undefined
        const tab = p?.activeTab
        return {
          ...current,
          activeTab: tab && TABS.includes(tab) ? tab : current.activeTab,
        }
      },
    },
  ),
)
