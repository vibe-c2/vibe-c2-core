import {
  useInfiniteCredentials,
  useInfiniteMyCredentials,
  useCredentialChangedSubscription,
  useMyCredentialChangedSubscription,
} from "@/graphql/hooks/credentials"
import { useInfiniteOperations } from "@/graphql/hooks/operations"
import { useCredentialStore } from "@/stores/credentials"
import { CredentialsToolbar } from "@/components/findings/credentials-toolbar"
import { CredentialsTable } from "@/components/findings/credentials-table"
import { CreateCredentialDialog } from "@/components/findings/create-credential-dialog"
import { EditCredentialDialog } from "@/components/findings/edit-credential-dialog"
import { DeleteCredentialDialog } from "@/components/findings/delete-credential-dialog"
import type { FindingsMode } from "@/components/findings/findings-mode"
import { useFindingsOpsParam } from "@/hooks/use-findings-ops-param"
import { useConnectionNodes } from "@/hooks/use-connection-nodes"

interface CredentialsTabProps {
  mode: FindingsMode
}

export function CredentialsTab({ mode }: CredentialsTabProps) {
  return mode.kind === "scoped" ? (
    <ScopedCredentialsTab operationId={mode.operationId} />
  ) : (
    <GlobalCredentialsTab />
  )
}

// Scoped path — single-op SSE subscription, per-op queries, and the
// CreateCredentialDialog gets the op id straight from the parent.
function ScopedCredentialsTab({ operationId }: { operationId: string }) {
  // Real-time SSE subscription scoped to this operation. Updates the React
  // Query cache when other sessions mutate credentials.
  useCredentialChangedSubscription(operationId)

  const filters = useCredentialStore((s) => s.filters)
  const sort = useCredentialStore((s) => s.sort)
  const setSort = useCredentialStore((s) => s.setSort)
  const mode: FindingsMode = { kind: "scoped", operationId }

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteCredentials({
    operationId,
    search: filters.search.trim() || null,
    searchFields: filters.searchFields,
    type: filters.type,
    tags: filters.tags,
    validOnly: filters.validOnly,
    sortBy: sort.field,
    sortDirection: sort.direction,
  })

  const credentials = useConnectionNodes(data, (p) => p.credentials)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <CredentialsToolbar mode={mode} />
      <CredentialsTable
        credentials={credentials}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        fetchNextPage={fetchNextPage}
        sort={sort}
        onSortChange={setSort}
      />

      <CreateCredentialDialog operationId={operationId} />
      <EditCredentialDialog />
      <DeleteCredentialDialog />
    </div>
  )
}

// Global path — runs the cross-operation query, renders the multi-op picker
// above the toolbar, and shows the Operation column in the table.
function GlobalCredentialsTab() {
  const filters = useCredentialStore((s) => s.filters)
  const sort = useCredentialStore((s) => s.sort)
  const setSort = useCredentialStore((s) => s.setSort)
  // The toolbar owns the picker UI; the tab reads the URL hook for its own
  // data fetching. Both observers see the same react-router source of truth.
  const { operationIds } = useFindingsOpsParam()
  const mode: FindingsMode = { kind: "global", operationIds }

  // Explicit empty selection: skip the query entirely (it would no-op on the
  // server anyway, but this avoids the round trip and shows a clearer state).
  const isExplicitEmpty = operationIds !== null && operationIds.length === 0

  // Real-time updates: same idea as ScopedCredentialsTab, but the multi-op
  // sibling subscription. Skip when the user has explicit empty selection —
  // there's nothing for the server to deliver. The server-side filter is
  // captured at subscribe time, so reconnecting on operationIds change is the
  // standard way to refresh the membership snapshot.
  useMyCredentialChangedSubscription(operationIds, {
    enabled: !isExplicitEmpty,
  })

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteMyCredentials(
    {
      operationIds,
      search: filters.search.trim() || null,
      searchFields: filters.searchFields,
      type: filters.type,
      tags: filters.tags,
      validOnly: filters.validOnly,
      sortBy: sort.field,
      sortDirection: sort.direction,
    },
    { enabled: !isExplicitEmpty },
  )

  const credentials = useConnectionNodes(data, (p) => p.myCredentials)

  // Detect the "user is not a member of any operation" case so we can show a
  // dedicated empty state instead of the generic "no credentials match these
  // filters" one. Only fires when the user has an implicit "all my ops"
  // selection — explicit empty / explicit selections render their own states.
  // Non-admins see only their memberships from `operations`, so totalCount===0
  // is a reliable signal. App-admins see every op in the system, so they'd
  // never hit this branch (they have to pick ops explicitly).
  const opsProbe = useInfiniteOperations({ first: 1 })
  const isImplicitAll = operationIds === null
  const opsTotal = opsProbe.data?.pages[0]?.operations.totalCount
  const hasZeroAccessibleOps =
    isImplicitAll && !opsProbe.isLoading && opsTotal === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <CredentialsToolbar mode={mode} />
      {hasZeroAccessibleOps ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border bg-card py-16 text-center text-muted-foreground">
          <p className="text-sm font-medium text-foreground">
            You're not a member of any operation yet
          </p>
          <p className="max-w-sm text-xs">
            Ask an operation admin to add you, or create one yourself from the
            Operations page. Credentials live inside operations.
          </p>
        </div>
      ) : isExplicitEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border bg-card py-16 text-muted-foreground">
          <p className="text-sm">
            No operations selected — pick one or more from the menu above.
          </p>
        </div>
      ) : (
        <CredentialsTable
          credentials={credentials}
          isLoading={isLoading}
          isFetchingNextPage={isFetchingNextPage}
          hasNextPage={hasNextPage}
          fetchNextPage={fetchNextPage}
          sort={sort}
          onSortChange={setSort}
          showOperationColumn
        />
      )}

      {/* Edit / delete / details read the target credential's operation id
          from the cached row. Create renders an inline op picker — omitting
          the operationId prop puts the dialog in "pick before save" mode. */}
      <CreateCredentialDialog />
      <EditCredentialDialog />
      <DeleteCredentialDialog />
    </div>
  )
}
