import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import { useSubscription } from "@/hooks/use-subscription"
import {
  ModulesDocument,
  RemoveModuleDocument,
  ModuleChangedDocument,
} from "@/graphql/gql/graphql"

// Query key factory. The module list is small and unpaginated, so a single
// list namespace keyed by the status filter is enough.
export const moduleKeys = {
  all: ["modules"] as const,
  lists: () => [...moduleKeys.all, "list"] as const,
  list: (status: string[] | null) => [...moduleKeys.lists(), status] as const,
}

export function useModules(status: string[] | null) {
  return useQuery({
    queryKey: moduleKeys.list(status),
    queryFn: () => graphqlClient(ModulesDocument, { status }),
  })
}

/**
 * Soft-remove (deregister) a module instance. The list is invalidated by the
 * moduleChanged subscription, but we also invalidate here so the table reflects
 * the change immediately even if the subscription stream is momentarily paused.
 */
export function useRemoveModule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (instance: string) =>
      graphqlClient(RemoveModuleDocument, { instance }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: moduleKeys.lists() })
    },
  })
}

/**
 * Subscribe to real-time module lifecycle changes.
 *
 * When a module registers, deregisters, or is declared dead — including the
 * "removed but still alive → re-registers" flip — the list query is invalidated
 * so the table refetches. The full row travels on the event, but since the list
 * is unpaginated a plain invalidate is simpler than surgically patching it.
 */
export function useModuleChangedSubscription() {
  const queryClient = useQueryClient()

  useSubscription(ModuleChangedDocument, undefined, {
    onData: () => {
      queryClient.invalidateQueries({ queryKey: moduleKeys.lists() })
    },
  })
}
