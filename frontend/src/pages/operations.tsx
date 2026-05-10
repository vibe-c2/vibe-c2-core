import { useMemo } from "react"
import { SwordsIcon } from "lucide-react"
import {
  useInfiniteOperations,
  useOperationChangedSubscription,
  useOperationMemberChangedSubscription,
} from "@/graphql/hooks/operations"
import { useOperationStore } from "@/stores/operations"
import { usePageMetadata } from "@/hooks/use-page-metadata"
import { OperationsToolbar } from "@/components/operations/operations-toolbar"
import { OperationsTable } from "@/components/operations/operations-table"
import { CreateOperationDialog } from "@/components/operations/create-operation-dialog"
import { EditOperationDialog } from "@/components/operations/edit-operation-dialog"
import { DeleteOperationDialog } from "@/components/operations/delete-operation-dialog"
import { MembersDialog } from "@/components/operations/members-dialog"

export function OperationsPage() {
  usePageMetadata({
    title: "Operations",
    icon: { kind: "lucide", component: SwordsIcon },
  })


  // Subscribe to real-time operation and membership changes via SSE.
  // When another session modifies operations, the query cache is
  // invalidated and the table refetches automatically.
  useOperationChangedSubscription()
  useOperationMemberChangedSubscription()

  const search = useOperationStore((s) => s.search)
  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteOperations({ search: search || null })

  const operations = useMemo(
    () => data?.pages.flatMap((page) => page.operations.edges.map((e) => e.node)) ?? [],
    [data],
  )

  return (
    <div className="flex flex-1 flex-col gap-2 p-2">
      <OperationsToolbar />
      <OperationsTable
        operations={operations}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        fetchNextPage={fetchNextPage}
      />
      <CreateOperationDialog />
      <EditOperationDialog />
      <DeleteOperationDialog />
      <MembersDialog />
    </div>
  )
}
