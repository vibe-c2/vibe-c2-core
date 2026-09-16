import { create } from "zustand"
import type { DataTableSort } from "@/lib/data-table-sort"
import type { SkillOriginFilter, SkillSortField } from "@/lib/skill-rows"

// The skill an action was invoked on. Carried by name because that is what
// every mutation and download takes; the id only ever identifies a table row.
interface SelectedSkill {
  name: string
}

interface SkillStoreState {
  search: string
  originFilter: SkillOriginFilter
  sort: DataTableSort<SkillSortField>

  selectedSkill: SelectedSkill | null

  publishDialogOpen: boolean
  // Set when publishing a new version of an existing skill, null when
  // claiming a new name. The dialog locks the name field in the first case.
  publishTargetName: string | null
  versionsDialogOpen: boolean
  removeDialogOpen: boolean

  setSearch: (search: string) => void
  setOriginFilter: (origin: SkillOriginFilter) => void
  setSort: (sort: DataTableSort<SkillSortField>) => void
  openPublishDialog: (name?: string | null) => void
  setPublishDialogOpen: (open: boolean) => void
  openVersionsDialog: (skill: SelectedSkill) => void
  openRemoveDialog: (skill: SelectedSkill) => void
  closeDialogs: () => void
}

export const useSkillStore = create<SkillStoreState>((set) => ({
  search: "",
  originFilter: null,
  // Newest upload first: the reason to open this page is usually that
  // something changed, and the built-in skill anchors the other end.
  sort: { field: "UPDATED", direction: "DESC" },

  selectedSkill: null,

  publishDialogOpen: false,
  publishTargetName: null,
  versionsDialogOpen: false,
  removeDialogOpen: false,

  setSearch: (search) => set({ search }),
  setOriginFilter: (originFilter) => set({ originFilter }),
  setSort: (sort) => set({ sort }),
  openPublishDialog: (name = null) =>
    set({ publishDialogOpen: true, publishTargetName: name }),
  setPublishDialogOpen: (open) =>
    set(open ? { publishDialogOpen: true } : { publishDialogOpen: false, publishTargetName: null }),
  openVersionsDialog: (skill) =>
    set({ versionsDialogOpen: true, selectedSkill: skill }),
  openRemoveDialog: (skill) =>
    set({ removeDialogOpen: true, selectedSkill: skill }),
  closeDialogs: () =>
    set({
      publishDialogOpen: false,
      publishTargetName: null,
      versionsDialogOpen: false,
      removeDialogOpen: false,
      selectedSkill: null,
    }),
}))
