import { useMemo } from "react"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SearchInput } from "@/components/ui/search-input"
import {
  useInfiniteHosts,
  useHostChangedSubscription,
} from "@/graphql/hooks/hosts"
import { useHostStore } from "@/stores/hosts"
import { HostsTable } from "@/components/findings/hosts-table"
import { HostFormDialog } from "@/components/findings/host-form-dialog"
import { DeleteHostDialog } from "@/components/findings/delete-host-dialog"

interface HostsTabProps {
  operationId: string
}

// Hosts are scoped-only — a cross-operation view would collide because
// different target networks reuse the same private IP ranges — so unlike
// HashesTab there is no scoped/global split and the tab takes the operation
// id directly. The toolbar is inlined too: with search as the only filter
// (no tags/statuses on hosts) a separate toolbar component would be a shell.
export function HostsTab({ operationId }: HostsTabProps) {
  useHostChangedSubscription(operationId)

  const filters = useHostStore((s) => s.filters)
  const setSearch = useHostStore((s) => s.setSearch)
  const openCreate = useHostStore((s) => s.openCreateDialog)

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteHosts({
      operationId,
      search: filters.search.trim() || null,
    })

  const hosts = useMemo(
    () =>
      data?.pages.flatMap((page) => page.hosts.edges.map((e) => e.node)) ?? [],
    [data],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={filters.search}
          onValueChange={setSearch}
          placeholder="Search hostname, OS, or address..."
          className="relative w-full max-w-md"
        />
        <div className="ms-auto">
          <Button onClick={openCreate}>
            <PlusIcon className="size-4" />
            Add host
          </Button>
        </div>
      </div>

      <HostsTable
        hosts={hosts}
        isLoading={isLoading}
        isFetchingNextPage={isFetchingNextPage}
        hasNextPage={hasNextPage}
        fetchNextPage={fetchNextPage}
        hasActiveSearch={filters.search.trim().length > 0}
      />

      <HostFormDialog operationId={operationId} />
      <DeleteHostDialog />
    </div>
  )
}
