// Thin client for the wiki export endpoint. Mirrors lib/wiki-outline-import.ts
// so the export dialog calls a single well-typed helper instead of a raw
// fetch + blob dance.

import { apiFetch, ApiError } from "@/services/api-client"

export interface ExportRequest {
  operationId: string
  // Subtree exports pass a root document id; tree-wide exports omit it.
  rootId?: string | null
}

export interface ExportResult {
  blob: Blob
  // Filename suggested by the backend's Content-Disposition header. Falls
  // back to a generic name when the header is absent or unparseable.
  filename: string
}

/**
 * Download a wiki export zip from the backend. Resolves with the zip blob
 * and suggested filename on success; rejects with an `ApiError` carrying
 * the structured error body on failure.
 *
 * The endpoint streams the zip — large exports can take real time. We
 * give the request a 5-minute deadline so the spinner doesn't lie
 * indefinitely about progress.
 */
export async function requestWikiExport(
  req: ExportRequest,
): Promise<ExportResult> {
  const params = new URLSearchParams({ operationId: req.operationId })
  if (req.rootId) params.set("rootId", req.rootId)

  const res = await apiFetch(`/wiki/export?${params.toString()}`, {
    method: "GET",
    timeoutMs: 5 * 60 * 1000,
  })

  if (!res.ok) {
    // Errors come back as JSON; the zip stream never starts until the
    // backend has decided to commit.
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, (body as { error?: string }).error ?? "export failed")
  }

  const blob = await res.blob()
  const filename = parseFilename(res.headers.get("Content-Disposition")) ?? defaultFilename()

  return { blob, filename }
}

/** Parse the filename from a Content-Disposition header, RFC 6266 style. */
function parseFilename(header: string | null): string | null {
  if (!header) return null
  // Prefer the encoded form (`filename*=UTF-8''<url-escaped>`) when present.
  const star = /filename\*\s*=\s*([^;]+)/i.exec(header)
  if (star) {
    const raw = star[1].trim()
    const m = /^UTF-8''(.+)$/i.exec(raw)
    if (m) {
      try {
        return decodeURIComponent(m[1])
      } catch {
        // fall through to the unencoded form
      }
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header)
  if (plain) return plain[1].trim()
  return null
}

function defaultFilename(): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "Z")
  return `wiki-export-${ts}.zip`
}

/**
 * Trigger a browser download for a previously-fetched export. Uses the
 * temporary `<a download>` pattern so the file lands in the user's default
 * downloads folder without a manual save-as prompt.
 */
export function triggerExportDownload(result: ExportResult): void {
  const url = URL.createObjectURL(result.blob)
  const a = document.createElement("a")
  a.href = url
  a.download = result.filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Revoke after the browser has a chance to start the download. setTimeout
  // 0 is enough in every modern engine; we use a small delay to be safe.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
