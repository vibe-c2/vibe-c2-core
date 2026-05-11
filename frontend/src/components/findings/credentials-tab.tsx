import { useMemo } from "react"
import {
  useInfiniteCredentials,
  useCredentialChangedSubscription,
} from "@/graphql/hooks/credentials"
import { useCredentialStore } from "@/stores/credentials"
import { CredentialsToolbar } from "@/components/findings/credentials-toolbar"
import { CredentialsTable } from "@/components/findings/credentials-table"
import { CreateCredentialDialog } from "@/components/findings/create-credential-dialog"
import { EditCredentialDialog } from "@/components/findings/edit-credential-dialog"
import { DeleteCredentialDialog } from "@/components/findings/delete-credential-dialog"
import { CredentialDetailsDialog } from "@/components/findings/credential-details-dialog"

interface CredentialsTabProps {
  operationId: string
}

export function CredentialsTab({ operationId }: CredentialsTabProps) {
  // Real-time SSE subscription scoped to this operation. Updates the React
  // Query cache when other sessions mutate credentials.
  useCredentialChangedSubscription(operationId)

  const filters = useCredentialStore((s) => s.filters)

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteCredentials({
    operationId,
    search: filters.search.trim() || null,
    type: filters.type,
    tags: filters.tags,
    validOnly: filters.validOnly,
  })

  const credentials = useMemo(
    () =>
      data?.pages.flatMap((page) =>
        page.credentials.edges.map((e) => e.node),
      ) ?? [],
    [data],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <CredentialsToolbar operationId={operationId} />
      <CredentialsTable
        credentials={credentials}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        fetchNextPage={fetchNextPage}
      />

      <CreateCredentialDialog operationId={operationId} />
      <EditCredentialDialog />
      <DeleteCredentialDialog />
      <CredentialDetailsDialog />
    </div>
  )
}
