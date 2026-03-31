import { create } from "zustand"

interface SessionStoreState {
  // My Sessions dialog (opened from NavUser dropdown)
  mySessionsDialogOpen: boolean
  securityWarning: boolean
  openMySessionsDialog: () => void
  openMySessionsDialogWithWarning: () => void

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
  securityWarning: false,
  selectedSessionId: null,
  revokeDialogOpen: false,
  revokeIsAdmin: false,

  openMySessionsDialog: () => set({ mySessionsDialogOpen: true, securityWarning: false }),
  openMySessionsDialogWithWarning: () => set({ mySessionsDialogOpen: true, securityWarning: true }),

  openRevokeDialog: (sessionId, isAdmin = false) =>
    set({ revokeDialogOpen: true, selectedSessionId: sessionId, revokeIsAdmin: isAdmin }),

  closeRevokeDialog: () =>
    set({ revokeDialogOpen: false, selectedSessionId: null, revokeIsAdmin: false }),

  closeDialogs: () =>
    set({
      mySessionsDialogOpen: false,
      securityWarning: false,
      revokeDialogOpen: false,
      selectedSessionId: null,
      revokeIsAdmin: false,
    }),
}))
