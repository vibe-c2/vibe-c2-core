import { create } from "zustand"

// Store for the "Agent Keys" dialog. Mirrors the API-key store, with two
// additions: the create form is a distinct sub-view (there can be several
// keys, so "create" is an action rather than an empty state), and freshToken
// is paired with the id it belongs to so the banner renders against the right
// row after the list refetches.
interface AgentKeyStoreState {
  agentKeysDialogOpen: boolean
  createFormOpen: boolean

  // The raw vca_... token from the last create/regenerate, and which key it
  // belongs to. Null when there is nothing fresh to display.
  freshToken: string | null
  freshTokenKeyId: string | null

  openAgentKeysDialog: () => void
  closeAgentKeysDialog: () => void
  setCreateFormOpen: (open: boolean) => void
  setFreshToken: (token: string | null, keyId?: string | null) => void
}

export const useAgentKeyStore = create<AgentKeyStoreState>((set) => ({
  agentKeysDialogOpen: false,
  createFormOpen: false,
  freshToken: null,
  freshTokenKeyId: null,

  openAgentKeysDialog: () => set({ agentKeysDialogOpen: true }),
  // Closing always drops the token: leaving it in memory across opens would
  // let a secret reappear long after the user moved on.
  closeAgentKeysDialog: () =>
    set({
      agentKeysDialogOpen: false,
      createFormOpen: false,
      freshToken: null,
      freshTokenKeyId: null,
    }),
  setCreateFormOpen: (open) => set({ createFormOpen: open }),
  setFreshToken: (token, keyId = null) =>
    set({ freshToken: token, freshTokenKeyId: token ? keyId : null }),
}))
