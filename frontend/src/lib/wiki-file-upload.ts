import { ApiError, tryRefresh } from "@/services/api-client"

/** 50MB — must match WIKI_FILE_MAX_SIZE on the backend (see .env.example). */
export const WIKI_FILE_MAX_SIZE_BYTES = 50 * 1024 * 1024

export interface UploadedWikiFile {
  id: string
  url: string
  filename: string
  size: number
  contentType: string
}

export interface UploadWikiFileOptions {
  /** Progress callback; pct is 0..1. Called multiple times during upload. */
  onProgress?: (pct: number) => void
  /** Caller-supplied abort signal. Aborting throws an AbortError. */
  signal?: AbortSignal
}

const API_URL = import.meta.env.VITE_API_URL as string

/** True when a file should be routed to the image pipeline rather than the
 *  generic file pipeline. Used by paste/drop handlers to dispatch correctly. */
export function isImageFile(file: File | Blob): boolean {
  return file.type.startsWith("image/")
}

/** Read the non-httpOnly csrf_token cookie set by the backend. Mirrors the
 *  logic in services/api-client.ts — duplicated here because XHR does not
 *  go through apiFetch. */
function readCsrfToken(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * POST a file to the wiki file endpoint via XMLHttpRequest, exposing upload
 * progress so the editor can render a percentage while 50MB attachments crawl
 * up the wire. On 401, a single refresh-and-retry is attempted — same
 * behaviour as apiFetch but hand-rolled because XHR cannot go through it.
 *
 * Size validation runs both client- and server-side; the client check just
 * saves a round trip on obvious rejects.
 */
export async function uploadWikiFile(
  file: File,
  documentId: string,
  opts: UploadWikiFileOptions = {},
): Promise<UploadedWikiFile> {
  if (file.size > WIKI_FILE_MAX_SIZE_BYTES) {
    throw new ApiError(
      413,
      `File exceeds maximum size of ${WIKI_FILE_MAX_SIZE_BYTES} bytes`,
    )
  }

  const filename =
    file.name && file.name.length > 0
      ? file.name
      : `attachment-${Date.now()}`

  const send = (): Promise<UploadedWikiFile> =>
    postFile(file, filename, documentId, opts)

  try {
    return await send()
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const refreshed = await tryRefresh()
      if (refreshed) return send()
    }
    throw err
  }
}

function postFile(
  file: File,
  filename: string,
  documentId: string,
  opts: UploadWikiFileOptions,
): Promise<UploadedWikiFile> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append("documentId", documentId)
    form.append("file", file, filename)

    const xhr = new XMLHttpRequest()
    xhr.open("POST", `${API_URL}/wiki/files`, true)
    xhr.withCredentials = true

    const csrf = readCsrfToken()
    if (csrf) xhr.setRequestHeader("X-CSRF-Token", csrf)

    if (opts.onProgress) {
      xhr.upload.addEventListener("progress", (ev) => {
        if (ev.lengthComputable && ev.total > 0) {
          opts.onProgress?.(ev.loaded / ev.total)
        }
      })
    }

    const abort = () => xhr.abort()
    if (opts.signal) {
      if (opts.signal.aborted) {
        reject(new DOMException("Aborted", "AbortError"))
        return
      }
      opts.signal.addEventListener("abort", abort, { once: true })
    }

    xhr.addEventListener("load", () => {
      opts.signal?.removeEventListener("abort", abort)
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as UploadedWikiFile)
        } catch (parseErr) {
          reject(parseErr)
        }
        return
      }
      const message = parseErrorMessage(xhr.responseText) ?? "upload failed"
      reject(new ApiError(xhr.status, message))
    })

    xhr.addEventListener("error", () => {
      opts.signal?.removeEventListener("abort", abort)
      reject(new ApiError(0, "Network error"))
    })

    xhr.addEventListener("abort", () => {
      opts.signal?.removeEventListener("abort", abort)
      reject(new DOMException("Aborted", "AbortError"))
    })

    xhr.send(form)
  })
}

function parseErrorMessage(body: string): string | null {
  if (!body) return null
  try {
    const parsed = JSON.parse(body) as { error?: string }
    return parsed.error ?? null
  } catch {
    return null
  }
}
