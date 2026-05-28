import { useMemo } from "react"
import { useWikiDocumentTree } from "@/graphql/hooks/wiki"
import type { AncestorCrumb } from "@/components/wiki/wiki-ancestor-breadcrumb"
import type { WikiDocumentTreeFieldsFragment } from "@/graphql/gql/graphql"

export interface WikiDocumentTreeAncestors {
  docs: ReadonlyArray<WikiDocumentTreeFieldsFragment>
  ancestorsByDocId: ReadonlyMap<string, AncestorCrumb[]>
  isLoading: boolean
}

/**
 * Fetches the operation's wiki document tree and precomputes each row's
 * ancestor chain so callers can render the same icon-title-breadcrumb rows
 * the wiki document picker and search palette use.
 *
 * The chain walk bounds at the loaded tree size to defend against cyclic
 * data slipping in. `isDeleted` is always false because the tree query
 * filters server-side to live docs.
 */
export function useWikiDocumentTreeAncestors(
  operationId: string,
): WikiDocumentTreeAncestors {
  const { data, isLoading } = useWikiDocumentTree(operationId)

  const docs = useMemo(
    () => data?.wikiDocumentTree ?? [],
    [data?.wikiDocumentTree],
  )

  const docById = useMemo(() => {
    const m = new Map<string, WikiDocumentTreeFieldsFragment>()
    for (const d of docs) m.set(d.id, d)
    return m
  }, [docs])

  const ancestorsByDocId = useMemo(() => {
    const out = new Map<string, AncestorCrumb[]>()
    for (const doc of docs) {
      const chain: AncestorCrumb[] = []
      let parentId = doc.parentDocumentId
      let guard = docById.size
      while (parentId && guard-- > 0) {
        const parent = docById.get(parentId)
        if (!parent) break
        chain.push({
          id: parent.id,
          title: parent.title ?? "Untitled",
          emoji: parent.emoji,
          icon: parent.icon,
          color: parent.color,
          isDeleted: false,
        })
        parentId = parent.parentDocumentId
      }
      chain.reverse()
      out.set(doc.id, chain)
    }
    return out
  }, [docs, docById])

  return { docs, ancestorsByDocId, isLoading }
}
