import { create } from "zustand"

interface SessionStoreState {
  // My Sessions dialog (opened from NavUser dropdown)
  mySessionsDialogOpen: boolean
  openMySessionsDialog: () => void

  // Revoke confirmation
  selectedSessionId: string | null
  revokeDialogOpen: boolean
  revokeIsAdmin: boolean
  openRevokeDialog: (sessionId: string, isAdmin?: boolean) => void
  closeRevokeDialog: () => void

  closeDialogs: () => void
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  mySessionsDialogOpen: false,
  selectedSessionId: null,
  revokeDialogOpen: false,
  revokeIsAdmin: false,

  openMySessionsDialog: () => set({ mySessionsDialogOpen: true }),

  openRevokeDialog: (sessionId, isAdmin = false) =>
    set({ revokeDialogOpen: true, selectedSessionId: sessionId, revokeIsAdmin: isAdmin }),

  closeRevokeDialog: () =>
    set({ revokeDialogOpen: false, selectedSessionId: null, revokeIsAdmin: false }),

  closeDialogs: () =>
    set({
      mySessionsDialogOpen: false,
      revokeDialogOpen: false,
      selectedSessionId: null,
      revokeIsAdmin: false,
    }),
}))
