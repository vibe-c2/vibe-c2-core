import { useCallback, useState, useTransition } from "react"
import { useWikiStore } from "@/stores/wiki"
import { useEnsureWikiTree } from "@/graphql/hooks/wiki"
import { collectExpandableIdsFromFlat } from "@/components/wiki/wiki-tree-helpers"

export type WikiSubtreeAction = "expand" | "collapse"

/**
 * Drives the wiki sidebar's "Expand all" and per-row "Expand/Collapse
 * subtree" buttons. Two phases dominate on huge operations:
 *
 *   1. The full-tree GraphQL fetch — required so we can reach branches the
 *      user has never opened. Tracked via `isFetching`.
 *   2. The React commit that mounts/unmounts every affected row. Wrapped in
 *      `useTransition` so the spinner stays smooth while it runs.
 *
 * `loading` ORs both phases so consumers can drive a single spinner that
 * stays visible from click until the last row paints. Pass `rootId = null`
 * to act on the whole operation; pass a document id to scope to that
 * subtree (root inclusive).
 *
 * Collapse-all in the sidebar header is *not* routed through here — it has
 * no fetch phase and would force an unnecessary tree round-trip just to
 * compute ids that are already in `expandedNodes`.
 */
export function useWikiSubtreeExpansion(operationId: string) {
  const ensureWikiTree = useEnsureWikiTree(operationId)
  const expandMany = useWikiStore((s) => s.expandMany)
  const collapseMany = useWikiStore((s) => s.collapseMany)

  const [isFetching, setIsFetching] = useState(false)
  const [isCommitting, startCommitTransition] = useTransition()
  const loading = isFetching || isCommitting

  const run = useCallback(
    async (action: WikiSubtreeAction, rootId: string | null) => {
      setIsFetching(true)
      try {
        const rows = await ensureWikiTree()
        const ids = collectExpandableIdsFromFlat(rows, rootId)
        startCommitTransition(() => {
          if (action === "expand") expandMany(ids)
          else collapseMany(ids)
        })
      } finally {
        setIsFetching(false)
      }
    },
    [ensureWikiTree, expandMany, collapseMany],
  )

  return { loading, run }
}
