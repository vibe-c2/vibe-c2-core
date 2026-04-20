import { apiFetch, ApiError } from "@/services/api-client"

/** MIME types accepted by the backend image pipeline. Keep in sync with
 *  core/pkg/wiki/image_processor.go. */
export const WIKI_IMAGE_ACCEPT =
  "image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml"

export const WIKI_IMAGE_MAX_SIZE_BYTES = 10 * 1024 * 1024

export interface UploadedWikiImage {
  id: string
  url: string
  width: number
  height: number
}

/**
 * POST a single image to the wiki image endpoint. Returns the server-assigned
 * ID + URL the editor should reference. Caller is responsible for inserting
 * the resulting node into the document.
 *
 * Size validation is done client-side AND on the backend — the client-side
 * check just saves a round-trip for obvious rejects.
 */
export async function uploadWikiImage(
  file: File | Blob,
  documentId: string,
): Promise<UploadedWikiImage> {
  if (file.size > WIKI_IMAGE_MAX_SIZE_BYTES) {
    throw new ApiError(
      413,
      `File exceeds maximum size of ${WIKI_IMAGE_MAX_SIZE_BYTES} bytes`,
    )
  }

  const form = new FormData()
  form.append("documentId", documentId)
  // Provide a filename so the server's multipart parser always has one —
  // clipboard-pasted images come as Blobs with no name.
  const filename =
    (file as File).name && (file as File).name.length > 0
      ? (file as File).name
      : `pasted-${Date.now()}${extensionForMime((file as Blob).type)}`
  form.append("file", file, filename)

  // Upload can legitimately take longer than the default 30s for large files
  // on slow networks. Override to 2 minutes.
  const res = await apiFetch("/wiki/images", {
    method: "POST",
    body: form,
    timeoutMs: 120_000,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? "upload failed")
  }
  return res.json()
}

function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return ".png"
    case "image/jpeg":
      return ".jpg"
    case "image/webp":
      return ".webp"
    case "image/gif":
      return ".gif"
    case "image/avif":
      return ".avif"
    case "image/svg+xml":
      return ".svg"
    default:
      return ""
  }
}

/** True if a MIME type is one our backend accepts. Used by paste/drop guards. */
export function isSupportedImageMime(mime: string): boolean {
  return WIKI_IMAGE_ACCEPT.split(",").includes(mime)
}
