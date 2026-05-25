import { create } from "zustand"

// Store for the "My API Keys" dialog. The freshly-minted token (only visible
// once at creation/regeneration) is held here so the dialog can render it in
// a copy-once banner across re-renders, then cleared on close.
interface APIKeyStoreState {
  apiKeysDialogOpen: boolean

  // The raw vc2_... token from the last create/regenerate. Null when there's
  // nothing fresh to display. Cleared by closeAPIKeysDialog and explicitly
  // by the user after they've copied it.
  freshToken: string | null

  openAPIKeysDialog: () => void
  closeAPIKeysDialog: () => void
  setFreshToken: (token: string | null) => void
}

export const useAPIKeyStore = create<APIKeyStoreState>((set) => ({
  apiKeysDialogOpen: false,
  freshToken: null,

  openAPIKeysDialog: () => set({ apiKeysDialogOpen: true }),
  closeAPIKeysDialog: () => set({ apiKeysDialogOpen: false, freshToken: null }),
  setFreshToken: (token) => set({ freshToken: token }),
}))
