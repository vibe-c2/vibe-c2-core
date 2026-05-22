import type { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { toast } from "sonner"
import {
  isSupportedImageMime,
  uploadWikiImage,
  WIKI_IMAGE_MAX_SIZE_BYTES,
} from "@/lib/wiki-image-upload"

interface InsertAt {
  pos: number
}

/**
 * Kick off an async upload and, on success, insert a finalized image node
 * at the captured position. All user feedback is handled via toasts — we
 * intentionally do NOT insert placeholder nodes into the CRDT, so co-editors
 * never see half-uploaded blob URLs.
 */
export async function uploadAndInsertWikiImage(
  editor: Editor,
  documentId: string,
  file: File | Blob,
  insertAt: InsertAt,
): Promise<void> {
  if (file.size === 0) return
  if (file.size > WIKI_IMAGE_MAX_SIZE_BYTES) {
    toast.error(
      `Image exceeds the 10 MB limit (got ${formatSize(file.size)}).`,
    )
    return
  }
  if (!isSupportedImageMime(file.type)) {
    toast.error(`Unsupported image type: ${file.type || "unknown"}.`)
    return
  }

  const toastId = toast.loading("Uploading image…")
  try {
    // Read intrinsic dimensions in parallel with the upload so the
    // captured numbers can ride along on the inserted node. Failure to
    // measure (e.g. SVGs without intrinsic size, decode errors) is
    // non-fatal — the node just inserts without width/height and the
    // browser falls back to its old decode-time layout. `Promise.all`
    // here is bounded by the upload, which always dominates the wait.
    const [uploaded, dimensions] = await Promise.all([
      uploadWikiImage(file, documentId),
      readImageDimensions(file),
    ])
    // Re-resolve the insertion position at completion time. If the document
    // was edited during the upload, mapping through the editor state lets us
    // insert roughly where the user initiated the paste, not off the end.
    const pos = clampToDocSize(editor, insertAt.pos)
    // Insert, then advance the caret past the image. Tiptap's insertContentAt
    // defaults to a NodeSelection on the inserted block, which ProseMirror
    // renders with the `ProseMirror-hideselection` class — so the admin sees
    // no caret, while remote clients still receive the selection range via
    // y-prosemirror awareness and render a labeled ghost cursor under the
    // image. Collapsing to a TextSelection right after the node keeps both
    // views in sync and ready for the user to keep typing.
    const ok = editor
      .chain()
      .focus()
      .insertContentAt(pos, {
        type: "image",
        attrs: {
          src: uploaded.url,
          alt: "",
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
        },
      })
      .command(({ tr, dispatch }) => {
        if (!dispatch) return true
        const end = Math.min(tr.selection.to, tr.doc.content.size)
        tr.setSelection(TextSelection.create(tr.doc, end))
        tr.scrollIntoView()
        return true
      })
      .run()
    if (!ok) {
      toast.error("Uploaded, but couldn't insert into the document.", {
        id: toastId,
      })
      return
    }
    toast.success("Image inserted", { id: toastId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed"
    toast.error(message, { id: toastId })
  }
}

/** Upload multiple files sequentially so the insertion order is stable. */
export async function uploadAndInsertWikiImages(
  editor: Editor,
  documentId: string,
  files: File[] | Blob[],
  insertAt: InsertAt,
): Promise<void> {
  for (const file of files) {
    await uploadAndInsertWikiImage(editor, documentId, file, insertAt)
    // Next image inserts after the one we just added.
    insertAt = { pos: editor.state.selection.from }
  }
}

/**
 * Read an image's natural pixel dimensions client-side. Used to stamp
 * width/height onto the inserted node so the browser can reserve correct
 * aspect ratio before the image decodes (no layout shift on first paint
 * after scroll-into-view). Returns `null` for inputs the browser can't
 * decode at all, or where `naturalWidth/Height` is 0 (some SVGs without
 * intrinsic size, broken files, etc.) — the caller treats `null` as
 * "fall back to no explicit dimensions".
 */
async function readImageDimensions(
  file: File | Blob,
): Promise<{ width: number; height: number } | null> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const width = img.naturalWidth
    const height = img.naturalHeight
    if (width <= 0 || height <= 0) return null
    return { width, height }
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

function clampToDocSize(editor: Editor, pos: number): number {
  const size = editor.state.doc.content.size
  if (pos < 0) return 0
  if (pos > size) return size
  return pos
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Pull image File entries out of a ClipboardEvent's clipboardData.
 *
 * macOS pastes get TWO codepaths: `clipboardData.items` is the modern view
 * (kind + MIME), but Safari and some Chromium versions populate only
 * `clipboardData.files` for screenshot/Preview pastes — the items list comes
 * back with kind="string" entries (HTML representation) and no kind="file".
 * Fall back to .files when items yields nothing so Cmd+V works regardless of
 * which surface the OS exposed.
 */
export function extractClipboardImages(
  clipboardData: DataTransfer | null,
): File[] {
  if (!clipboardData) return []
  const out: File[] = []
  for (const item of Array.from(clipboardData.items)) {
    if (item.kind !== "file") continue
    if (!item.type.startsWith("image/")) continue
    const f = item.getAsFile()
    if (f) out.push(f)
  }
  if (out.length === 0) {
    for (const f of Array.from(clipboardData.files)) {
      if (f.type.startsWith("image/")) out.push(f)
    }
  }
  return out
}

/** Pull image Files out of a drag DataTransfer. */
export function extractDropImages(
  dataTransfer: DataTransfer | null,
): File[] {
  if (!dataTransfer) return []
  return Array.from(dataTransfer.files).filter((f) =>
    f.type.startsWith("image/"),
  )
}

/**
 * Open the native file picker and upload the selection. Invoked by the
 * /image slash command; detached from the editor so we can reuse it from a
 * toolbar button later.
 */
export function pickAndUploadWikiImage(
  editor: Editor,
  documentId: string,
  insertAt: InsertAt,
): void {
  const input = document.createElement("input")
  input.type = "file"
  input.accept = "image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml"
  input.multiple = true
  input.style.display = "none"
  input.addEventListener("change", async () => {
    const files = input.files ? Array.from(input.files) : []
    document.body.removeChild(input)
    if (files.length === 0) return
    await uploadAndInsertWikiImages(editor, documentId, files, insertAt)
  })
  // Safari requires the input to be in the DOM before .click().
  document.body.appendChild(input)
  input.click()
}
