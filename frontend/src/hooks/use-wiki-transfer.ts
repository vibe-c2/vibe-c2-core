// Hooks for the wiki transfer API. Export and import both start a job and
// then poll it; the dialogs render whatever state the job is in.
//
// Lives outside graphql/hooks/wiki.ts because the transfer API is REST
// (multipart upload, zip download), not GraphQL.

import { useEffect } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  fetchJob,
  isTerminal,
  startExport,
  startImport,
  type StartExportArgs,
  type StartImportArgs,
  type TransferJob,
} from "@/lib/wiki-transfer"
import { wikiKeys } from "@/graphql/hooks/wiki"

const POLL_MS = 1500

export const transferKeys = {
  job: (jobId: string) => ["wiki", "transfer", "job", jobId] as const,
}

export function useStartExport() {
  return useMutation<TransferJob, Error, StartExportArgs>({ mutationFn: startExport })
}

export function useStartImport() {
  return useMutation<TransferJob, Error, StartImportArgs>({ mutationFn: startImport })
}

/**
 * Poll one job until it settles. Pass null to idle. When an import job
 * finishes the wiki caches are invalidated so the new pages appear without
 * waiting for the server-sent events.
 */
export function useTransferJob(jobId: string | null, operationId: string) {
  const queryClient = useQueryClient()
  const query = useQuery<TransferJob, Error>({
    queryKey: transferKeys.job(jobId ?? "none"),
    queryFn: () => fetchJob(jobId as string),
    enabled: jobId !== null,
    refetchInterval: (q) => {
      const job = q.state.data
      if (!job || !isTerminal(job)) return POLL_MS
      return false
    },
    staleTime: 0,
  })

  const job = query.data
  const settledImport = job !== undefined && job.kind === "import" && isTerminal(job)
  useEffect(() => {
    if (!settledImport) return
    void queryClient.invalidateQueries({ queryKey: wikiKeys.children(operationId, null) })
    void queryClient.invalidateQueries({ queryKey: wikiKeys.tree(operationId) })
    void queryClient.invalidateQueries({ queryKey: wikiKeys.lists() })
    void queryClient.invalidateQueries({ queryKey: wikiKeys.recents() })
    void queryClient.invalidateQueries({ queryKey: wikiKeys.histories() })
  }, [settledImport, operationId, queryClient])

  return query
}
