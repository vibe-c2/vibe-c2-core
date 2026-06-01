import { create } from "zustand"

// The list of tabs on the Findings page. New finding kinds (hashes, files,
// hosts, ...) are added here and to the page's tab switcher.
export type FindingsPageTab = "credentials" | "hashes"

interface FindingsStoreState {
  activeTab: FindingsPageTab
  setActiveTab: (tab: FindingsPageTab) => void
}

export const useFindingsStore = create<FindingsStoreState>((set) => ({
  activeTab: "credentials",
  setActiveTab: (tab) => set({ activeTab: tab }),
}))
