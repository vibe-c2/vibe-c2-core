import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import {
  MyApiKeyDocument,
  CreateMyApiKeyDocument,
  RegenerateMyApiKeyDocument,
  SetMyApiKeyEnabledDocument,
  DeleteMyApiKeyDocument,
} from "@/graphql/gql/graphql"

// Query keys for the single-row API key surface. Only "my" exists; admin
// can't list other users' keys (the GraphQL surface doesn't expose it).
export const apiKeyKeys = {
  all: ["api-keys"] as const,
  me: () => [...apiKeyKeys.all, "me"] as const,
}

export function useMyAPIKey() {
  return useQuery({
    queryKey: apiKeyKeys.me(),
    queryFn: () => graphqlClient(MyApiKeyDocument),
  })
}

// Create and Regenerate both return the full raw token. The caller is
// responsible for surfacing it to the user once — none of the cache
// invalidation flows store it.
export function useCreateMyAPIKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => graphqlClient(CreateMyApiKeyDocument),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.me() })
    },
  })
}

export function useRegenerateMyAPIKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => graphqlClient(RegenerateMyApiKeyDocument),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.me() })
    },
  })
}

export function useSetMyAPIKeyEnabled() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (enabled: boolean) =>
      graphqlClient(SetMyApiKeyEnabledDocument, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.me() })
    },
  })
}

export function useDeleteMyAPIKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => graphqlClient(DeleteMyApiKeyDocument),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.me() })
    },
  })
}
