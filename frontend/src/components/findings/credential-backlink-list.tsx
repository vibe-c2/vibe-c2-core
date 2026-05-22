import { BacklinkList } from "@/components/wiki/backlink-list"
import { useCredentialBacklinks } from "@/graphql/hooks/credentials"

interface CredentialBacklinkListProps {
  credentialId: string
}

/**
 * Lists the wiki documents that reference a credential via the inline
 * /credential chip. Thin data-fetching wrapper around the shared
 * {@link BacklinkList} component used by the wiki editor footer.
 *
 * Unlike the wiki variant we render even when empty — operators expect a
 * visible "Referenced in" header so they know to look for backlinks when
 * adding them, rather than wondering if the section exists at all.
 */
export function CredentialBacklinkList({
  credentialId,
}: CredentialBacklinkListProps) {
  const { data, isLoading } = useCredentialBacklinks(credentialId)
  const backlinks = data?.wikiDocumentsReferencingCredential ?? []

  return (
    <BacklinkList
      documents={backlinks}
      title="Referenced in"
      isLoading={isLoading}
      showWhenEmpty
    />
  )
}
