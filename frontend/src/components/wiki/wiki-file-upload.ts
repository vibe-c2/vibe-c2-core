import type { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { toast } from "sonner"
import {
  isImageFile,
  uploadWikiFile,
  WIKI_FILE_MAX_SIZE_BYTES,
  type UploadedWikiFile,
} from "@/lib/wiki-file-upload"

interface InsertAt {
  pos: number
}

export const WIKI_FILE_NODE_NAME = "wikiFile"

/**
 * Upload a single file attachment and, on success, insert a finalized
 * wikiFile node at the captured position. Feedback goes through a single
 * toast whose label is swapped between progress / success / error states —
 * mirrors the image pipeline but adds a percentage since 50MB files benefit
 * from visible progress.
 */
export async function uploadAndInsertWikiFile(
  editor: Editor,
  documentId: string,
  file: File,
  insertAt: InsertAt,
): Promise<void> {
  if (file.size === 0) return
  if (file.size > WIKI_FILE_MAX_SIZE_BYTES) {
    toast.error(
      `File exceeds the 50 MB limit (got ${formatSize(file.size)}).`,
    )
    return
  }

  const label = file.name || "file"
  const toastId = toast.loading(`Uploading ${label}…`)

  try {
    const uploaded = await uploadWikiFile(file, documentId, {
      onProgress: (pct) => {
        const percent = Math.min(99, Math.round(pct * 100))
        toast.loading(`Uploading ${label} (${percent}%)`, { id: toastId })
      },
    })

    const pos = clampToDocSize(editor, insertAt.pos)
    const ok = editor
      .chain()
      .focus()
      .insertContentAt(pos, {
        type: WIKI_FILE_NODE_NAME,
        attrs: attrsFromUpload(uploaded),
      })
      .command(({ tr, dispatch }) => {
        if (!dispatch) return true
        // Collapse the default NodeSelection to a TextSelection so the user's
        // caret lands past the card — matches the image pipeline behavior.
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
    toast.success(`Attached ${label}`, { id: toastId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Upload failed"
    toast.error(message, { id: toastId })
  }
}

/** Upload multiple files sequentially so insertion order is stable. */
export async function uploadAndInsertWikiFiles(
  editor: Editor,
  documentId: string,
  files: File[],
  insertAt: InsertAt,
): Promise<void> {
  let pos = insertAt.pos
  for (const file of files) {
    await uploadAndInsertWikiFile(editor, documentId, file, { pos })
    pos = editor.state.selection.from
  }
}

/** Pull non-image File entries out of a ClipboardEvent's clipboardData. */
export function extractClipboardFiles(
  clipboardData: DataTransfer | null,
): File[] {
  if (!clipboardData) return []
  const out: File[] = []
  for (const item of Array.from(clipboardData.items)) {
    if (item.kind !== "file") continue
    const f = item.getAsFile()
    if (!f) continue
    if (isImageFile(f)) continue
    out.push(f)
  }
  return out
}

/** Pull non-image Files out of a drag DataTransfer. */
export function extractDropFiles(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) return []
  return Array.from(dataTransfer.files).filter((f) => !isImageFile(f))
}

/**
 * Open the native file picker and upload the selection. Invoked by the
 * /file slash command; detached from the editor so we can reuse it from a
 * toolbar button later.
 */
export function pickAndUploadWikiFile(
  editor: Editor,
  documentId: string,
  insertAt: InsertAt,
): void {
  const input = document.createElement("input")
  input.type = "file"
  input.multiple = true
  input.style.display = "none"
  input.addEventListener("change", async () => {
    const files = input.files ? Array.from(input.files) : []
    document.body.removeChild(input)
    if (files.length === 0) return
    await uploadAndInsertWikiFiles(editor, documentId, files, insertAt)
  })
  // Safari requires the input to be in the DOM before .click().
  document.body.appendChild(input)
  input.click()
}

function attrsFromUpload(uploaded: UploadedWikiFile): Record<string, string | number> {
  return {
    fileId: uploaded.id,
    url: uploaded.url,
    filename: uploaded.filename,
    size: uploaded.size,
    contentType: uploaded.contentType,
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
