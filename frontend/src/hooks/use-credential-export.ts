import { useCallback, useState } from "react"
import { toast } from "sonner"
import { graphqlClient } from "@/lib/graphql-client"
import {
  CredentialsDocument,
  MyCredentialsDocument,
  type CredentialType,
  type CredentialSearchField,
} from "@/graphql/gql/graphql"
import { useCredentialStore } from "@/stores/credentials"
import { useOperation } from "@/graphql/hooks/operations"
import { useFindingsOpsParam } from "@/hooks/use-findings-ops-param"
import type { FindingsMode } from "@/components/findings/findings-mode"
import {
  downloadBlob,
  exportFilename,
  toCsv,
  toJson,
  type ExportableCredential,
} from "@/lib/credential-export"

// Larger than the table's 20 so a typical export takes a handful of round
// trips at most. The server caps `first` independently; if it ever lowers
// the ceiling we just do more round trips.
const EXPORT_PAGE_SIZE = 200

// Defensive cap on the page loop. `hasNextPage === false` always terminates
// in practice; this stops a server bug that returns the same cursor forever
// from spinning indefinitely. 1000 pages × 200 = 200k rows.
const MAX_PAGES = 1000

type Filters = {
  search: string | null
  searchFields: CredentialSearchField[] | null
  type: CredentialType | null
  tags: string[] | null
  validOnly: boolean | null
}

export type ExportFormat = "json" | "csv"

const FORMATS: Record<
  ExportFormat,
  { mime: string; encode: (c: readonly ExportableCredential[]) => string }
> = {
  json: { mime: "application/json", encode: toJson },
  csv: { mime: "text/csv", encode: toCsv },
}

export function useCredentialExport(mode: FindingsMode) {
  const filters = useCredentialStore((s) => s.filters)
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
        searchFields:
          filters.searchFields.length > 0 ? filters.searchFields : null,
        type: filters.type,
        tags: filters.tags.length > 0 ? filters.tags : null,
        validOnly: filters.validOnly,
      }

      try {
        const credentials = await fetchAll(
          mode,
          operationIds,
          effectiveFilters,
          setProgress,
        )

        if (credentials.length === 0) {
          toast.info("No credentials match the current filters")
          return
        }

        const { mime, encode } = FORMATS[format]
        const label =
          mode.kind === "scoped" ? operationName ?? "operation" : "global"
        downloadBlob(encode(credentials), exportFilename(label, format), mime)
        toast.success(`Exported ${credentials.length} credentials`)
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to export credentials",
        )
      } finally {
        setIsExporting(false)
        setProgress(0)
      }
    },
    [filters, isExporting, mode, operationIds, operationName],
  )

  return { exportCredentials: run, isExporting, progress }
}

type Page = {
  nodes: ExportableCredential[]
  hasNextPage: boolean
  endCursor: string | null | undefined
}

async function fetchAll(
  mode: FindingsMode,
  operationIds: string[] | null,
  filters: Filters,
  onProgress: (n: number) => void,
): Promise<ExportableCredential[]> {
  const fetchPage = pageFetcher(mode, operationIds, filters)
  // Mirrors the table: in global mode an explicit empty selection means
  // "user picked zero operations" → nothing to export.
  if (!fetchPage) return []

  const out: ExportableCredential[] = []
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
      const res = await graphqlClient(CredentialsDocument, {
        operationId,
        ...filters,
        first: EXPORT_PAGE_SIZE,
        after,
      })
      return {
        nodes: res.credentials.edges.map((e) => e.node),
        hasNextPage: res.credentials.pageInfo.hasNextPage,
        endCursor: res.credentials.pageInfo.endCursor,
      }
    }
  }

  if (operationIds !== null && operationIds.length === 0) return null

  return async (after) => {
    const res = await graphqlClient(MyCredentialsDocument, {
      operationIds,
      ...filters,
      first: EXPORT_PAGE_SIZE,
      after,
    })
    return {
      nodes: res.myCredentials.edges.map((e) => e.node),
      hasNextPage: res.myCredentials.pageInfo.hasNextPage,
      endCursor: res.myCredentials.pageInfo.endCursor,
    }
  }
}
