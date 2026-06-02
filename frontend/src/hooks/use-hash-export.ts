import { useCallback, useState } from "react"
import { toast } from "sonner"
import { graphqlClient } from "@/lib/graphql-client"
import {
  HashesDocument,
  MyHashesDocument,
  type HashStatus,
} from "@/graphql/gql/graphql"
import { useHashStore } from "@/stores/hashes"
import { useOperation } from "@/graphql/hooks/operations"
import { useFindingsOpsParam } from "@/hooks/use-findings-ops-param"
import type { FindingsMode } from "@/components/findings/findings-mode"
import {
  downloadBlob,
  exportFilename,
  toCsv,
  toJson,
  type ExportableHash,
} from "@/lib/hash-export"
import type { ExportFormat } from "@/lib/file-export"

// Larger than the table's page size so a typical export takes a handful of
// round trips at most. The server caps `first` independently; if it ever
// lowers the ceiling we just do more round trips.
const EXPORT_PAGE_SIZE = 200

// Defensive cap on the page loop. `hasNextPage === false` always terminates
// in practice; this stops a server bug that returns the same cursor forever
// from spinning indefinitely. 1000 pages × 200 = 200k rows.
const MAX_PAGES = 1000

type Filters = {
  search: string | null
  statuses: HashStatus[] | null
  tags: string[] | null
  hasCredential: boolean | null
}

const FORMATS: Record<
  ExportFormat,
  { mime: string; encode: (h: readonly ExportableHash[]) => string }
> = {
  json: { mime: "application/json", encode: toJson },
  csv: { mime: "text/csv", encode: toCsv },
}

export function useHashExport(mode: FindingsMode) {
  const filters = useHashStore((s) => s.filters)
  const { operationIds } = useFindingsOpsParam()
  // useOperation is gated on `!!id`, so in global mode this stays inert.
  // In scoped mode it usually hits cache (the op page already loaded it).
  const operationQuery = useOperation(
    mode.kind === "scoped" ? mode.operationId : "",
  )
  const operationName = operationQuery.data?.operation.name

  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState(0)

  const run = useCallback(
    async (format: ExportFormat) => {
      if (isExporting) return
      setIsExporting(true)
      setProgress(0)

      const effectiveFilters: Filters = {
        search: filters.search.trim() || null,
        statuses: filters.statuses.length > 0 ? filters.statuses : null,
        tags: filters.tags.length > 0 ? filters.tags : null,
        hasCredential: filters.hasCredential,
      }

      try {
        const hashes = await fetchAll(
          mode,
          operationIds,
          effectiveFilters,
          setProgress,
        )

        if (hashes.length === 0) {
          toast.info("No hashes match the current filters")
          return
        }

        const { mime, encode } = FORMATS[format]
        const label =
          mode.kind === "scoped" ? operationName ?? "operation" : "global"
        downloadBlob(encode(hashes), exportFilename(label, format), mime)
        toast.success(`Exported ${hashes.length} hashes`)
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to export hashes",
        )
      } finally {
        setIsExporting(false)
        setProgress(0)
      }
    },
    [filters, isExporting, mode, operationIds, operationName],
  )

  return { exportHashes: run, isExporting, progress }
}

type Page = {
  nodes: ExportableHash[]
  hasNextPage: boolean
  endCursor: string | null | undefined
}

async function fetchAll(
  mode: FindingsMode,
  operationIds: string[] | null,
  filters: Filters,
  onProgress: (n: number) => void,
): Promise<ExportableHash[]> {
  const fetchPage = pageFetcher(mode, operationIds, filters)
  // Mirrors the table: in global mode an explicit empty selection means
  // "user picked zero operations" → nothing to export.
  if (!fetchPage) return []

  const out: ExportableHash[] = []
  let after: string | undefined = undefined
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await fetchPage(after)
    out.push(...page.nodes)
    onProgress(out.length)
    if (!page.hasNextPage || !page.endCursor || page.endCursor === after) break
    after = page.endCursor
  }
  return out
}

function pageFetcher(
  mode: FindingsMode,
  operationIds: string[] | null,
  filters: Filters,
): ((after: string | undefined) => Promise<Page>) | null {
  if (mode.kind === "scoped") {
    const operationId = mode.operationId
    return async (after) => {
      const res = await graphqlClient(HashesDocument, {
        operationId,
        ...filters,
        first: EXPORT_PAGE_SIZE,
        after,
      })
      return {
        nodes: res.hashes.edges.map((e) => e.node),
        hasNextPage: res.hashes.pageInfo.hasNextPage,
        endCursor: res.hashes.pageInfo.endCursor,
      }
    }
  }

  if (operationIds !== null && operationIds.length === 0) return null

  return async (after) => {
    const res = await graphqlClient(MyHashesDocument, {
      operationIds,
      ...filters,
      first: EXPORT_PAGE_SIZE,
      after,
    })
    return {
      nodes: res.myHashes.edges.map((e) => e.node),
      hasNextPage: res.myHashes.pageInfo.hasNextPage,
      endCursor: res.myHashes.pageInfo.endCursor,
    }
  }
}
