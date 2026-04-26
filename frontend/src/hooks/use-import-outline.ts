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
    onSuccess: (_data, vars) => {
      // The new import/<timestamp>/<collection>/... subtree is now in the
      // operation; invalidate the tree so the sidebar redraws.
      queryClient.invalidateQueries({ queryKey: wikiKeys.tree(vars.operationId) })
    },
  })
}
