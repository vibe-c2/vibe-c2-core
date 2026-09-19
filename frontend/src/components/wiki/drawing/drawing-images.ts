// Images on a drawing page.
//
// Excalidraw keeps image bytes in a `files` map beside the scene, as data
// URLs, and expects its host to persist that map. Putting it in the CRDT would
// be the obvious move and the wrong one: a handful of screenshots would dwarf
// the drawing itself in every update, every snapshot and every backup, and the
// bytes would then exist in a place the attachment garbage collector cannot
// see.
//
// Instead an image is uploaded to the same wiki image endpoint the prose
// editor uses, and the element's `fileId` is rewritten to the id the server
// minted. Three things fall out of that:
//
//   - the CRDT carries a uuid rather than a megabyte;
//   - `dataURL` can be the image's own same-origin URL, so nothing has to be
//     re-encoded on load and the browser caches it like any other image;
//   - the sidecar can project those ids into `image_references`, which is what
//     keeps ImageSweeper from reclaiming a blob that a drawing is using. That
//     projection is not an optimisation — without it every image placed on a
//     drawing is deleted once it passes the sweeper's grace period.

import type { BinaryFileData, BinaryFiles } from "@excalidraw/excalidraw/types"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
import { uploadWikiImage } from "@/lib/wiki-image-upload"

/** Where the wiki serves an image by id. Must match the src the prose editor's
 * image node uses, since both read the same blobs. */
export function wikiImageURL(imageID: string): string {
  return `/api/v1/wiki/images/${imageID}`
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whether a fileId is one of ours.
 *
 * Excalidraw mints its own ids as long hex digests, so a uuid is an unambiguous
 * marker that the bytes have already been uploaded and the id points at a wiki
 * image. Used to tell "this image needs adopting" from "this image is already
 * stored", which has to be decided per element and not per session — a remote
 * peer's images arrive already adopted.
 */
export function isWikiImageID(fileId: string | undefined | null): boolean {
  return typeof fileId === "string" && UUID_RE.test(fileId)
}

/** Every wiki image id referenced by the scene's image elements. */
export function wikiImageIDs(elements: readonly ExcalidrawElement[]): string[] {
  const ids = new Set<string>()
  for (const el of elements) {
    if (el.type !== "image" || el.isDeleted) continue
    const fileId = (el as { fileId?: string }).fileId
    if (isWikiImageID(fileId)) ids.add(fileId as string)
  }
  return [...ids]
}

/**
 * The `files` map for a scene whose images are already wiki images.
 *
 * `dataURL` is a plain same-origin URL rather than an encoded payload —
 * Excalidraw only ever assigns it to an <img> src, so it does not have to be a
 * data: URL, and keeping it a real URL is what lets the browser cache the
 * image instead of re-reading it out of the document on every load.
 */
export function wikiImageFiles(elements: readonly ExcalidrawElement[]): BinaryFiles {
  const files: BinaryFiles = {}
  for (const id of wikiImageIDs(elements)) {
    files[id as keyof BinaryFiles] = {
      id,
      dataURL: wikiImageURL(id),
      // The real type is recorded server-side; the canvas only needs something
      // image-shaped here, and it never re-encodes what it did not decode.
      mimeType: "image/png",
      created: Date.now(),
    } as unknown as BinaryFileData
  }
  return files
}

/** An image the canvas holds locally that has not been uploaded yet. */
export interface PendingImage {
  fileId: string
  dataURL: string
}

/**
 * Find images the canvas has taken on that are not yet stored.
 *
 * A file only counts once its element exists: Excalidraw registers the bytes
 * slightly before the element that uses them, and uploading in that window
 * would store a blob that nothing references — which the sweeper would then
 * reclaim while the user was still placing it.
 */
export function pendingImages(
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles,
): PendingImage[] {
  const pending: PendingImage[] = []
  const seen = new Set<string>()

  for (const el of elements) {
    if (el.type !== "image" || el.isDeleted) continue
    const fileId = (el as { fileId?: string }).fileId
    if (!fileId || isWikiImageID(fileId) || seen.has(fileId)) continue

    const file = files[fileId as keyof BinaryFiles] as BinaryFileData | undefined
    // Only a genuine data: payload can be uploaded. Anything else is either
    // already a URL we put there or a file we have not been handed yet.
    if (!file?.dataURL?.startsWith("data:")) continue

    seen.add(fileId)
    pending.push({ fileId, dataURL: file.dataURL })
  }
  return pending
}

/**
 * Rewrite elements to point at uploaded images.
 *
 * Versions are bumped deliberately. The rewrite has to propagate to everyone
 * else — otherwise a peer holds an element referencing a fileId that only ever
 * existed in this browser — and the sync layer publishes on version change.
 */
export function applyImageIDs(
  elements: readonly ExcalidrawElement[],
  mapping: ReadonlyMap<string, string>,
): ExcalidrawElement[] {
  return elements.map((el) => {
    const fileId = (el as { fileId?: string }).fileId
    if (el.type !== "image" || !fileId) return el

    const uploaded = mapping.get(fileId)
    if (!uploaded) return el

    return {
      ...el,
      fileId: uploaded,
      version: el.version + 1,
      versionNonce: Math.floor(Math.random() * 2 ** 31),
    } as ExcalidrawElement
  })
}

/** Decode a data: URL into bytes for upload. */
export async function dataURLToBlob(dataURL: string): Promise<Blob> {
  const response = await fetch(dataURL)
  return response.blob()
}

/**
 * Upload every pending image and return oldFileId to wiki image id.
 *
 * One failure does not sink the others: an image that cannot be stored is left
 * with its local id, so it keeps rendering for the person who added it and is
 * retried on the next change rather than disappearing from under them.
 */
export async function uploadPendingImages(
  documentId: string,
  pending: readonly PendingImage[],
  onError?: (fileId: string, error: unknown) => void,
): Promise<Map<string, string>> {
  const mapping = new Map<string, string>()

  await Promise.all(
    pending.map(async ({ fileId, dataURL }) => {
      try {
        const blob = await dataURLToBlob(dataURL)
        const uploaded = await uploadWikiImage(blob, documentId)
        mapping.set(fileId, uploaded.id)
      } catch (error) {
        onError?.(fileId, error)
      }
    }),
  )

  return mapping
}
