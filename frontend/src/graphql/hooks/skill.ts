import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import type { MeQuery } from "@/graphql/gql/graphql"
import {
  SkillChangelogDocument,
  SnoozeSkillUpdateDocument,
} from "@/graphql/gql/graphql"
import { userKeys } from "@/graphql/hooks/users"

export const skillKeys = {
  changelog: () => ["skill", "changelog"] as const,
}

// The changelog is compiled into the server binary, so it only changes when
// the server is redeployed. Fetch once per page load and keep it.
export function useSkillChangelog() {
  return useQuery({
    queryKey: skillKeys.changelog(),
    queryFn: () => graphqlClient(SkillChangelogDocument),
    staleTime: Infinity,
  })
}

// Patches the cached `me` in place. Both mutations below only touch skill
// bookkeeping, so a targeted patch is enough and avoids a refetch of the
// whole profile.
function patchMe(
  queryClient: ReturnType<typeof useQueryClient>,
  patch: Partial<MeQuery["me"]>,
) {
  const previous = queryClient.getQueryData<MeQuery>(userKeys.me())
  if (!previous?.me) return previous
  queryClient.setQueryData<MeQuery>(userKeys.me(), {
    ...previous,
    me: { ...previous.me, ...patch },
  })
  return previous
}

/**
 * Dismiss the update prompt for a release. Optimistic: the dialog closes on
 * click, the server confirms, and an error puts the previous state back.
 */
export function useSnoozeSkillUpdate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (version: number) =>
      graphqlClient(SnoozeSkillUpdateDocument, { version }),
    onMutate: async (version) => {
      await queryClient.cancelQueries({ queryKey: userKeys.me() })
      return { previous: patchMe(queryClient, { skillUpdateSnoozedVersion: version }) }
    },
    onError: (_err, _version, context) => {
      if (context?.previous) {
        queryClient.setQueryData(userKeys.me(), context.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.me() })
    },
  })
}

// How long to give the browser to finish the download before asking the
// server what it recorded. The server writes the record after streaming the
// zip, so a short delay is enough; the optimistic patch covers the gap.
const DOWNLOAD_RECONCILE_DELAY_MS = 2_000

/**
 * The skill is downloaded by a plain link, not a fetch, so nothing in the SPA
 * sees the response. The server records the download on its side; this
 * assumes it succeeded — patching `me` so the prompt disappears at once —
 * and reconciles with the server shortly after.
 */
export function useMarkSkillDownloaded() {
  const queryClient = useQueryClient()
  return (version: number) => {
    patchMe(queryClient, {
      skillDownloadedVersion: version,
      skillDownloadedAt: new Date().toISOString(),
    })
    window.setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: userKeys.me() })
    }, DOWNLOAD_RECONCILE_DELAY_MS)
  }
}
