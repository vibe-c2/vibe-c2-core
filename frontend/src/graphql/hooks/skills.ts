import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import type { SkillRegistryQuery as SkillRegistryQueryResult } from "@/graphql/gql/graphql"
import {
  SkillRegistryDocument,
  SkillVersionsDocument,
  SnoozeSkillDocument,
  RemoveSkillDocument,
} from "@/graphql/gql/graphql"

export const communitySkillKeys = {
  all: ["community-skills"] as const,
  registry: () => [...communitySkillKeys.all, "registry"] as const,
  versions: (name: string) =>
    [...communitySkillKeys.all, "versions", name] as const,
}

export function useSkillRegistry() {
  return useQuery({
    queryKey: communitySkillKeys.registry(),
    queryFn: () => graphqlClient(SkillRegistryDocument),
  })
}

// A skill's history, fetched only when somebody opens the version list.
export function useSkillVersions(name: string, enabled: boolean) {
  return useQuery({
    queryKey: communitySkillKeys.versions(name),
    queryFn: () => graphqlClient(SkillVersionsDocument, { name }),
    enabled,
  })
}

// Patches one skill in the cached registry. The mutations below change a
// single field on a single row, so refetching the whole listing to learn that
// would be wasteful and would make the UI flicker.
function patchSkill(
  queryClient: ReturnType<typeof useQueryClient>,
  name: string,
  patch: Partial<SkillRegistryQueryResult["skillRegistry"]["skills"][number]>,
) {
  const previous = queryClient.getQueryData<SkillRegistryQueryResult>(
    communitySkillKeys.registry(),
  )
  if (!previous) return previous
  queryClient.setQueryData<SkillRegistryQueryResult>(
    communitySkillKeys.registry(),
    {
      ...previous,
      skillRegistry: {
        ...previous.skillRegistry,
        skills: previous.skillRegistry.skills.map((skill) =>
          skill.name === name ? { ...skill, ...patch } : skill,
        ),
      },
    },
  )
  return previous
}

/**
 * Dismiss the update prompt for one skill. Optimistic, like the built-in
 * skill's snooze: the prompt closes on click and an error puts it back.
 */
export function useSnoozeSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, version }: { name: string; version: number }) =>
      graphqlClient(SnoozeSkillDocument, { name, version }),
    onMutate: async ({ name, version }) => {
      await queryClient.cancelQueries({ queryKey: communitySkillKeys.registry() })
      return { previous: patchSkill(queryClient, name, { snoozedVersion: version }) }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(communitySkillKeys.registry(), context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: communitySkillKeys.registry() })
    },
  })
}

export function useRemoveSkill() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => graphqlClient(RemoveSkillDocument, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communitySkillKeys.all })
    },
  })
}

// How long to give the browser to finish before asking the server what it
// recorded. Same shape as the built-in skill's download: the zip arrives over
// a plain link, so nothing in the SPA sees the response.
const DOWNLOAD_RECONCILE_DELAY_MS = 2_000

/**
 * A download is a link, not a fetch. Assume it worked so the "update
 * available" badge clears immediately, then reconcile with the server.
 */
export function useMarkSkillDownloaded() {
  const queryClient = useQueryClient()
  return (name: string, version: number) => {
    patchSkill(queryClient, name, {
      downloadedVersion: version,
      downloadedAt: new Date().toISOString(),
    })
    window.setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: communitySkillKeys.registry() })
    }, DOWNLOAD_RECONCILE_DELAY_MS)
  }
}
