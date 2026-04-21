import {
  NodeViewWrapper,
  type ReactNodeViewProps,
} from "@tiptap/react"
import {
  DownloadIcon,
  ExternalLinkIcon,
  FileArchiveIcon,
  FileAudioIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoIcon,
  Trash2Icon,
} from "lucide-react"
import type { MouseEvent as ReactMouseEvent, ReactElement } from "react"

/** Content types the browser can render inline without executing scripts.
 *  Must stay in sync with previewAllowedContentTypes in wiki_file_controller.go. */
const PREVIEW_ALLOWED_CONTENT_TYPES = new Set<string>([
  "application/pdf",
  "text/plain",
  "text/markdown",
])

/** Types we never serve inline regardless of ?preview=1 — mirrors the backend's
 *  dangerousContentTypes list in wiki_file_controller.go. */
const DANGEROUS_CONTENT_TYPES = new Set<string>([
  "text/html",
  "image/svg+xml",
  "application/xhtml+xml",
  "application/javascript",
  "application/x-javascript",
  "text/javascript",
])

interface FileNodeAttrs {
  fileId: string | null
  url: string | null
  filename: string
  size: number
  contentType: string
}

// Uses <button>s (not <a>s) because anchor clicks inside a ProseMirror node
// view double-fire under React StrictMode. Mousedown is swallowed so PM
// can't start a selection cycle against these buttons — same pattern as
// WikiImageNode.
export function WikiFileCard({ node, editor, getPos }: ReactNodeViewProps): ReactElement {
  const attrs = node.attrs as unknown as FileNodeAttrs
  const isEditable = editor.isEditable
  const url = attrs.url ?? ""
  const filename = attrs.filename || "file"
  const canPreview =
    PREVIEW_ALLOWED_CONTENT_TYPES.has(attrs.contentType) &&
    !DANGEROUS_CONTENT_TYPES.has(attrs.contentType)

  function handleDelete() {
    const pos = typeof getPos === "function" ? getPos() : undefined
    if (pos == null) return
    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run()
  }

  function handleDownload() {
    if (!url) return
    triggerDownload(url, filename)
  }

  function handlePreview() {
    if (!url) return
    window.open(`${url}?preview=1`, "_blank", "noopener,noreferrer")
  }

  // Primary "open it" action for the filename row: preview in a new tab
  // when the content type renders safely inline, otherwise download.
  function handleFilenameClick() {
    if (canPreview && url) {
      handlePreview()
      return
    }
    handleDownload()
  }

  return (
    <NodeViewWrapper className="wiki-file-wrapper" as="figure">
      <div className="wiki-file-card" contentEditable={false}>
        <div className="wiki-file-icon" aria-hidden="true">
          {renderIcon(attrs.contentType, filename)}
        </div>
        <div className="wiki-file-meta">
          <button
            type="button"
            className="wiki-file-name"
            title={filename}
            onMouseDown={swallow}
            onClick={handleFilenameClick}
          >
            {filename}
          </button>
          <span className="wiki-file-size">{formatBytes(attrs.size)}</span>
        </div>
        <div className="wiki-file-actions">
          {canPreview && url ? (
            <button
              type="button"
              className="wiki-file-action-button"
              aria-label="Preview file"
              title="Preview in new tab"
              onMouseDown={swallow}
              onClick={handlePreview}
            >
              <ExternalLinkIcon size={14} />
            </button>
          ) : null}
          {url ? (
            <button
              type="button"
              className="wiki-file-action-button"
              aria-label="Download file"
              title="Download"
              onMouseDown={swallow}
              onClick={handleDownload}
            >
              <DownloadIcon size={14} />
            </button>
          ) : null}
          {isEditable ? (
            <button
              type="button"
              className="wiki-file-action-button wiki-file-action-button--danger"
              aria-label="Remove file attachment"
              title="Delete"
              onMouseDown={swallow}
              onClick={handleDelete}
            >
              <Trash2Icon size={14} />
            </button>
          ) : null}
        </div>
      </div>
    </NodeViewWrapper>
  )
}

function swallow(e: ReactMouseEvent): void {
  e.preventDefault()
  e.stopPropagation()
}

function renderIcon(contentType: string, filename: string): ReactElement {
  const size = 20
  const type = (contentType ?? "").toLowerCase()

  if (type.startsWith("audio/")) return <FileAudioIcon size={size} />
  if (type.startsWith("video/")) return <FileVideoIcon size={size} />
  if (
    type.startsWith("text/") ||
    type === "application/json" ||
    type === "application/pdf" ||
    type === "application/msword" ||
    type.includes("wordprocessingml")
  ) {
    return <FileTextIcon size={size} />
  }
  if (
    type.includes("spreadsheet") ||
    type === "text/csv" ||
    type === "application/vnd.ms-excel"
  ) {
    return <FileSpreadsheetIcon size={size} />
  }
  if (
    type === "application/zip" ||
    type === "application/x-tar" ||
    type === "application/x-7z-compressed" ||
    type === "application/x-rar-compressed" ||
    type === "application/gzip"
  ) {
    return <FileArchiveIcon size={size} />
  }

  // Fall back to the extension when the server couldn't identify the type.
  const ext = filename.toLowerCase().split(".").pop() ?? ""
  if (["zip", "tar", "gz", "7z", "rar"].includes(ext))
    return <FileArchiveIcon size={size} />
  if (["xls", "xlsx", "csv", "tsv"].includes(ext))
    return <FileSpreadsheetIcon size={size} />
  if (["doc", "docx", "txt", "md", "rtf", "pdf"].includes(ext))
    return <FileTextIcon size={size} />
  return <FileIcon size={size} />
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let idx = 0
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx++
  }
  const precision = idx === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(precision)} ${units[idx]}`
}

// Anchor is appended to <body> — outside the editor's DOM subtree — so PM's
// click handling can't touch it. Guarantees exactly one download per call.
function triggerDownload(url: string, filename: string): void {
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.rel = "noopener noreferrer"
  a.style.display = "none"
  document.body.appendChild(a)
  try {
    a.click()
  } finally {
    document.body.removeChild(a)
  }
}
