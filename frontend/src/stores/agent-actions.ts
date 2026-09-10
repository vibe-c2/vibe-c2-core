import { create } from "zustand"
import type { AgentActionOutcome } from "@/graphql/gql/graphql"

// Filters for the agent activity page. Session-scoped and not persisted: a
// filter restored on reload would quietly hide activity from an operator who
// had forgotten they set it, which is a poor property for an audit view.
interface AgentActionStoreState {
  agentKeyId: string | null
  // Narrows an otherwise cross-operation feed. Not the frame — the trail
  // belongs to the operator, not to one engagement.
  operationId: string | null
  writesOnly: boolean
  refusedOnly: boolean

  setAgentKeyId: (id: string | null) => void
  setOperationId: (id: string | null) => void
  toggleWritesOnly: () => void
  toggleRefusedOnly: () => void
  clearFilters: () => void
}

const defaults = {
  agentKeyId: null,
  operationId: null,
  writesOnly: false,
  refusedOnly: false,
}

export const useAgentActionStore = create<AgentActionStoreState>((set) => ({
  ...defaults,

  setAgentKeyId: (agentKeyId) => set({ agentKeyId }),
  setOperationId: (operationId) => set({ operationId }),
  toggleWritesOnly: () => set((s) => ({ writesOnly: !s.writesOnly })),
  toggleRefusedOnly: () => set((s) => ({ refusedOnly: !s.refusedOnly })),
  clearFilters: () => set(defaults),
}))

// outcomesFor turns the refusals toggle into the query's enum list. Kept here
// so the page and the query agree on what "refused only" means.
export function outcomesFor(refusedOnly: boolean): AgentActionOutcome[] | null {
  return refusedOnly ? ["REFUSED"] : null
}
