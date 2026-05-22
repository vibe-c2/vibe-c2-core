import { BacklinkList } from "@/components/wiki/backlink-list"
import { useWikiDocumentBacklinks } from "@/graphql/hooks/wiki"

interface WikiBacklinkListProps {
  documentId: string
}

/**
 * Renders the "Backlinks" footer block — the inverse of Sub-pages. Lists the
 * other documents in this operation that cite the currently open one inline
 * via the `/doc` slash command.
 *
 * Thin data-fetching wrapper around {@link BacklinkList}. Mirrors the visual
 * language of `WikiChildDocumentList` so the editor footer reads as one pair
 * of related lists rather than two unrelated widgets.
 *
 * Trashed referrers are filtered server-side; the list stays empty rather
 * than surfacing dead links, and the wrapper hides the section entirely on
 * empty (no analogue to the sub-page "Add" affordance to show — backlinks
 * are derived from editor activity, not a direct user action on this page).
 */
export function WikiBacklinkList({ documentId }: WikiBacklinkListProps) {
  const { data, isLoading } = useWikiDocumentBacklinks(documentId)
  const backlinks = data?.wikiDocumentBacklinks ?? []

  return <BacklinkList documents={backlinks} isLoading={isLoading} />
}
