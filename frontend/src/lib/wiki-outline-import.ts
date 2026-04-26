// Thin client for the Outline-export importer. Mirrors the shape of
// lib/wiki-image-upload.ts so the dialog calls one well-typed helper
// instead of a raw fetch.

import { apiFetch, ApiError } from "@/services/api-client"

export interface OutlineImportSkipRecord {
  path: string
  reason: string
}

export interface OutlineImportReport {
  importParentId: string
  timestampParentId: string
  totalDocs: number
  createdDocs: number
  skippedDocs: number
  imagesIngested: number
  filesIngested: number
  skipped?: OutlineImportSkipRecord[]
  warnings?: OutlineImportSkipRecord[]
}

/** Hard cap mirroring the backend's WIKI_IMPORT_ZIP_MAX_SIZE default (200 MiB). */
export const OUTLINE_IMPORT_MAX_SIZE_BYTES = 200 * 1024 * 1024

/**
 * POST the Outline export zip to the importer. The backend extracts,
 * validates, ingests attachments, calls the Hocuspocus sidecar to convert
 * each document's markdown to a Y.js update, and returns a structured
 * report describing what landed in import/<timestamp>/.
 */
export async function uploadOutlineExport(
  file: File,
  operationId: string,
): Promise<OutlineImportReport> {
  if (file.size > OUTLINE_IMPORT_MAX_SIZE_BYTES) {
    throw new ApiError(
      413,
      `Zip exceeds the ${formatBytes(OUTLINE_IMPORT_MAX_SIZE_BYTES)} limit (got ${formatBytes(
        file.size,
      )}).`,
    )
  }

  const form = new FormData()
  form.append("file", file, file.name || "export.zip")

  // Imports run synchronously on the backend (extract → ingest → seed),
  // and 200 MB zips with thousands of attachments can take real time.
  // Give the request a 5-minute deadline; viewers won't hit this path.
  const res = await apiFetch(`/wiki/import/outline?operationId=${encodeURIComponent(operationId)}`, {
    method: "POST",
    body: form,
    timeoutMs: 5 * 60 * 1000,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, (body as { error?: string }).error ?? "import failed")
  }
  return res.json() as Promise<OutlineImportReport>
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(0)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}
