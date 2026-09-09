import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import {
  MyAgentKeysDocument,
  CreateAgentKeyDocument,
  RegenerateAgentKeyDocument,
  UpdateAgentKeyDocument,
  SetAgentKeyEnabledDocument,
  DeleteAgentKeyDocument,
  type CreateAgentKeyInput,
  type UpdateAgentKeyInput,
} from "@/graphql/gql/graphql"

// A user may own several agent keys, so unlike apiKeyKeys this is a list, not
// a single row. Every mutation invalidates the whole list rather than patching
// one entry — the list is small and always fully rendered.
export const agentKeyKeys = {
  all: ["agent-keys"] as const,
  mine: () => [...agentKeyKeys.all, "mine"] as const,
}

export function useMyAgentKeys() {
  return useQuery({
    queryKey: agentKeyKeys.mine(),
    queryFn: () => graphqlClient(MyAgentKeysDocument),
  })
}

// Create and regenerate return the raw token. The caller surfaces it once;
// nothing in the cache retains it.
export function useCreateAgentKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateAgentKeyInput) =>
      graphqlClient(CreateAgentKeyDocument, { input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeyKeys.mine() })
    },
  })
}

export function useRegenerateAgentKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => graphqlClient(RegenerateAgentKeyDocument, { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeyKeys.mine() })
    },
  })
}

export function useUpdateAgentKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; input: UpdateAgentKeyInput }) =>
      graphqlClient(UpdateAgentKeyDocument, vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeyKeys.mine() })
    },
  })
}

export function useSetAgentKeyEnabled() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: string; enabled: boolean }) =>
      graphqlClient(SetAgentKeyEnabledDocument, vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeyKeys.mine() })
    },
  })
}

export function useDeleteAgentKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => graphqlClient(DeleteAgentKeyDocument, { id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeyKeys.mine() })
    },
  })
}
