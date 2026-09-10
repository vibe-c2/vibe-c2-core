import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { onSubscriptionsResumed } from "@/lib/subscription-registry"

/**
 * Refill the cache gap left by a hidden tab.
 *
 * Subscriptions are torn down while the tab is hidden
 * (lib/subscription-registry.ts) and the event bus has no replay, so
 * everything published in that window is gone. That would be harmless if the
 * caches refetched on their own — but they deliberately do not. Subscriptions
 * are the single invalidation source for wiki documents and friends, so those
 * queries run at `staleTime: Infinity`, and `refetchOnWindowFocus` is off
 * globally (lib/query-client.ts). The result was a tree that stayed wrong
 * until a full page reload.
 *
 * That is easy to miss with human collaborators, because you are usually
 * looking at the tab when they make a change. It is guaranteed with an MCP
 * agent: driving one means the tab is hidden the whole time it works.
 *
 * A blanket invalidation rather than an enumerated key list, for two reasons.
 * Only *active* queries refetch, so the cost is the handful backing the screen
 * the operator just came back to — which is exactly what they expect after
 * being away. And a key list here would be a second copy of what every
 * subscription handler already invalidates, free to drift out of step with
 * them; there is no such thing as a subscription whose events this should skip.
 *
 * Mounted once, in AppLayout.
 */
export function useResumeRefetch() {
  const queryClient = useQueryClient()

  useEffect(() => onSubscriptionsResumed(() => {
    queryClient.invalidateQueries()
  }), [queryClient])
}
