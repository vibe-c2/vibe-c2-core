import { BacklinkList } from "@/components/wiki/backlink-list"
import { useHashBacklinks } from "@/graphql/hooks/hashes"

interface HashBacklinkListProps {
  hashId: string
}

/**
 * Lists the wiki documents that reference a hash via the inline /hash chip.
 * Thin data-fetching wrapper around the shared {@link BacklinkList} component.
 * Sibling of {@link CredentialBacklinkList} — renders even when empty so
 * operators get a visible "Referenced in" header.
 */
export function HashBacklinkList({ hashId }: HashBacklinkListProps) {
  const { data, isLoading } = useHashBacklinks(hashId)
  const backlinks = data?.wikiDocumentsReferencingHash ?? []

  return (
    <BacklinkList
      documents={backlinks}
      title="Referenced in"
      isLoading={isLoading}
      showWhenEmpty
      scrollable
      showFullPath
    />
  )
}
