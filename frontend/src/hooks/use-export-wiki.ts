// Mutation hook for the wiki export endpoint. Mirrors use-import-outline so
// the export dialog uses the same `useMutation`-driven loading/error UX as
// the import flow. Lives outside graphql/hooks/wiki.ts because the export
// route is a REST GET (returns a zip stream), not a GraphQL query.

import { useMutation } from "@tanstack/react-query"
import {
  requestWikiExport,
  triggerExportDownload,
  type ExportRequest,
  type ExportResult,
} from "@/lib/wiki-export"

export function useExportWiki() {
  return useMutation<ExportResult, Error, ExportRequest>({
    mutationFn: requestWikiExport,
    onSuccess: (result) => {
      // The mutation hook fires the browser download on success so callers
      // only need to await the mutation, not manage the blob lifecycle.
      triggerExportDownload(result)
    },
  })
}
