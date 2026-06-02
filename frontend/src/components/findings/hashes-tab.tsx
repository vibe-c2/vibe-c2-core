import { useMemo } from "react"
import {
  useInfiniteHashes,
  useInfiniteMyHashes,
  useHashChangedSubscription,
  useMyHashChangedSubscription,
} from "@/graphql/hooks/hashes"
import { useInfiniteOperations } from "@/graphql/hooks/operations"
import { useHashStore } from "@/stores/hashes"
import { HashesToolbar } from "@/components/findings/hashes-toolbar"
import { HashesTable } from "@/components/findings/hashes-table"
import { CreateHashDialog } from "@/components/findings/create-hash-dialog"
import { DeleteHashDialog } from "@/components/findings/delete-hash-dialog"
import { HashDetailsDialog } from "@/components/findings/hash-details-dialog"
import { BulkImportHashesDialog } from "@/components/findings/bulk-import-hashes-dialog"
import { MarkHashCrackedDialog } from "@/components/findings/mark-hash-cracked-dialog"
import type { FindingsMode } from "@/components/findings/findings-mode"
import { useFindingsOpsParam } from "@/hooks/use-findings-ops-param"

interface HashesTabProps {
  mode: FindingsMode
}

export function HashesTab({ mode }: HashesTabProps) {
  return mode.kind === "scoped" ? (
    <ScopedHashesTab operationId={mode.operationId} />
  ) : (
    <GlobalHashesTab />
  )
}

function ScopedHashesTab({ operationId }: { operationId: string }) {
  useHashChangedSubscription(operationId)

  const filters = useHashStore((s) => s.filters)
  const mode: FindingsMode = { kind: "scoped", operationId }

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteHashes({
      operationId,
      search: filters.search.trim() || null,
      statuses: filters.statuses.length > 0 ? filters.statuses : null,
      tags: filters.tags,
      hasCredential: filters.hasCredential,
    })

  const hashes = useMemo(
    () =>
      data?.pages.flatMap((page) => page.hashes.edges.map((e) => e.node)) ?? [],
    [data],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <HashesToolbar mode={mode} />
      <HashesTable
        hashes={hashes}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        fetchNextPage={fetchNextPage}
      />

      <CreateHashDialog operationId={operationId} />
      <DeleteHashDialog />
      <HashDetailsDialog />
      <BulkImportHashesDialog operationId={operationId} />
      <MarkHashCrackedDialog />
    </div>
  )
}

function GlobalHashesTab() {
  const filters = useHashStore((s) => s.filters)
  const { operationIds } = useFindingsOpsParam()
  const mode: FindingsMode = { kind: "global", operationIds }

  const isExplicitEmpty = operationIds !== null && operationIds.length === 0

  useMyHashChangedSubscription(operationIds, { enabled: !isExplicitEmpty })

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteMyHashes(
      {
        operationIds,
        search: filters.search.trim() || null,
        statuses: filters.statuses.length > 0 ? filters.statuses : null,
        tags: filters.tags,
        hasCredential: filters.hasCredential,
      },
      { enabled: !isExplicitEmpty },
    )

  const hashes = useMemo(
    () =>
      data?.pages.flatMap((page) => page.myHashes.edges.map((e) => e.node)) ??
      [],
    [data],
  )

  // Same zero-membership detection as credentials.
  const opsProbe = useInfiniteOperations({ first: 1 })
  const isImplicitAll = operationIds === null
  const opsTotal = opsProbe.data?.pages[0]?.operations.totalCount
  const hasZeroAccessibleOps =
    isImplicitAll && !opsProbe.isLoading && opsTotal === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <HashesToolbar mode={mode} />
      {hasZeroAccessibleOps ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border bg-card py-16 text-center text-muted-foreground">
          <p className="text-sm font-medium text-foreground">
            You're not a member of any operation yet
          </p>
          <p className="max-w-sm text-xs">
            Ask an operation admin to add you, or create one yourself from the
            Operations page. Hashes live inside operations.
          </p>
        </div>
      ) : isExplicitEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border bg-card py-16 text-muted-foreground">
          <p className="text-sm">
            No operations selected — pick one or more from the menu above.
          </p>
        </div>
      ) : (
        <HashesTable
          hashes={hashes}
          isLoading={isLoading}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
          fetchNextPage={fetchNextPage}
          showOperationColumn
        />
      )}

      {/* CreateHashDialog without an operationId switches into "pick before
          save" mode (inline op picker). DeleteHashDialog / HashDetailsDialog
          read the row's operationId from the cached node. */}
      <CreateHashDialog />
      <DeleteHashDialog />
      <HashDetailsDialog />
      <MarkHashCrackedDialog />
    </div>
  )
}
