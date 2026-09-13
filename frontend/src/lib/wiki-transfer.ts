// Client for the wiki transfer API: exports and imports run as background
// jobs the backend executes outside the request, so the browser starts a
// job, polls it, and downloads the result when it is done.
//
//   POST /wiki/transfer/exports          → job
//   POST /wiki/transfer/imports          → job (multipart)
//   GET  /wiki/transfer/jobs/:id         → job (+ report when finished)
//   GET  /wiki/transfer/jobs/:id/download → the archive (cookie-authed GET)

import { apiFetch, ApiError } from "@/services/api-client"

const API_URL = import.meta.env.VITE_API_URL as string

export type TransferFormat = "bundle" | "markdown"
export type TransferKind = "export" | "import"
export type TransferStatus = "queued" | "running" | "done" | "failed"

/** Suffix of the native, lossless archive. Mirrors bundle.Extension. */
export const BUNDLE_EXTENSION = ".vibewiki.zip"

/** Hard cap mirroring the backend's WIKI_IMPORT_ZIP_MAX_SIZE default. */
export const IMPORT_MAX_SIZE_BYTES = 200 * 1024 * 1024

export interface SkipRecord {
  path: string
  reason: string
}

export interface ExportReport {
  bundleId: string
  format: TransferFormat
  scope: "tree" | "subtree"
  rootTitle: string
  totalDocs: number
  exportedDocs: number
  skippedDocs: number
  imagesExported: number
  filesExported: number
  credentialsExported: number
  credentialsTombstoned: number
  skipped?: SkipRecord[]
  warnings?: SkipRecord[]
}

export interface ImportReport {
  bundleId: string
  targetParentId?: string | null
  rootIds: string[]
  totalDocs: number
  createdDocs: number
  skippedDocs: number
  imagesIngested: number
  filesIngested: number
  credentialsReused: number
  credentialsCreated: number
  credentialsTombstoned: number
  credentialsSkipped: number
  chipsRemapped: number
  chipsDropped: number
  skipped?: SkipRecord[]
  warnings?: SkipRecord[]
}

export interface TransferJob {
  jobId: string
  operationId: string
  kind: TransferKind
  format: TransferFormat
  status: TransferStatus
  progress: { done: number; total: number }
  error?: string
  artifactName?: string
  artifactSize?: number
  request: {
    rootDocumentId?: string | null
    includeCredentials?: boolean
    targetParentId?: string | null
    holdingPen?: boolean
    uploadFilename?: string
  }
  report?: ExportReport | ImportReport
  expiresAt: string
  startedAt?: string
  finishedAt?: string
}

export function isTerminal(job: Pick<TransferJob, "status">): boolean {
  return job.status === "done" || job.status === "failed"
}

/** True when a filename looks like a native bundle rather than a markdown zip. */
export function isBundleFilename(name: string): boolean {
  return name.toLowerCase().endsWith(BUNDLE_EXTENSION)
}

export function jobDownloadUrl(jobId: string): string {
  return `${API_URL}/wiki/transfer/jobs/${encodeURIComponent(jobId)}/download`
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

async function errorFrom(res: Response, fallback: string): Promise<ApiError> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  return new ApiError(res.status, body.error ?? fallback)
}

export interface StartExportArgs {
  operationId: string
  rootId?: string | null
  format: TransferFormat
}

export async function startExport(args: StartExportArgs): Promise<TransferJob> {
  const res = await apiFetch("/wiki/transfer/exports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operationId: args.operationId,
      rootId: args.rootId ?? null,
      format: args.format,
    }),
  })
  if (!res.ok) throw await errorFrom(res, "export failed to start")
  return res.json() as Promise<TransferJob>
}

/** Where an import lands. */
export type ImportDestination =
  | { kind: "holdingPen" }
  | { kind: "root" }
  | { kind: "parent"; parentId: string }

export interface StartImportArgs {
  operationId: string
  file: File
  destination: ImportDestination
}

export function importQuery(args: Pick<StartImportArgs, "operationId" | "destination">): string {
  const params = new URLSearchParams({ operationId: args.operationId })
  if (args.destination.kind === "holdingPen") params.set("holdingPen", "true")
  if (args.destination.kind === "parent") params.set("targetParentId", args.destination.parentId)
  return params.toString()
}

export async function startImport(args: StartImportArgs): Promise<TransferJob> {
  if (args.file.size > IMPORT_MAX_SIZE_BYTES) {
    throw new ApiError(
      413,
      `Archive exceeds the ${formatBytes(IMPORT_MAX_SIZE_BYTES)} limit (got ${formatBytes(args.file.size)}).`,
    )
  }
  const form = new FormData()
  form.append("file", args.file, args.file.name || "archive.zip")
  // The upload itself is the slow part; the job runs after the response.
  const res = await apiFetch(`/wiki/transfer/imports?${importQuery(args)}`, {
    method: "POST",
    body: form,
    timeoutMs: 5 * 60 * 1000,
  })
  if (!res.ok) throw await errorFrom(res, "import failed to start")
  return res.json() as Promise<TransferJob>
}

export async function fetchJob(jobId: string): Promise<TransferJob> {
  const res = await apiFetch(`/wiki/transfer/jobs/${encodeURIComponent(jobId)}`, { method: "GET" })
  if (!res.ok) throw await errorFrom(res, "could not load job")
  return res.json() as Promise<TransferJob>
}
