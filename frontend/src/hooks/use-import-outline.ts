// Mutation hook for the Outline-export importer. Lives outside
// graphql/hooks/wiki.ts because the import endpoint is a REST route
// (multipart/form-data), not a GraphQL mutation, so it doesn't fit the
// graphqlClient pattern the rest of that file uses.

import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  uploadOutlineExport,
  type OutlineImportReport,
} from "@/lib/wiki-outline-import"
import { wikiKeys } from "@/graphql/hooks/wiki"

interface UseImportOutlineVars {
  file: File
  operationId: string
}

export function useImportOutline() {
  const queryClient = useQueryClient()
  return useMutation<OutlineImportReport, Error, UseImportOutlineVars>({
    mutationFn: ({ file, operationId }) => uploadOutlineExport(file, operationId),
    onSuccess: (data, vars) => {
      // The backend's two wikiDocumentChanged events (one for the
      // "import" parent on first import, one for the <timestamp> parent
      // every time) will refresh exactly the right children buckets via
      // SSE. We also invalidate locally so the sidebar feels immediate
      // instead of waiting on the round-trip:
      //
      //   - root children: in case the "import" parent was freshly
      //     created in this run (the most-common UX-visible miss).
      //   - the report's import parent's children: a new <timestamp>
      //     child appeared under it.
      //   - the tree query: full-tree consumers (move dialog) need it.
      //   - per-op lists / recents / histories: the imported docs show
      //     up in those feeds too.
      queryClient.invalidateQueries({
        queryKey: wikiKeys.children(vars.operationId, null),
      })
      if (data.importParentId) {
        queryClient.invalidateQueries({
          queryKey: wikiKeys.children(vars.operationId, data.importParentId),
        })
      }
      queryClient.invalidateQueries({ queryKey: wikiKeys.tree(vars.operationId) })
      queryClient.invalidateQueries({ queryKey: wikiKeys.lists() })
      queryClient.invalidateQueries({ queryKey: wikiKeys.recents() })
      queryClient.invalidateQueries({ queryKey: wikiKeys.histories() })
    },
  })
}
