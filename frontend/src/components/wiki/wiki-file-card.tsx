import {
  NodeViewWrapper,
  type ReactNodeViewProps,
} from "@tiptap/react"
import {
  ChevronDownIcon,
  DownloadIcon,
  ExternalLinkIcon,
  EyeIcon,
  FileArchiveIcon,
  FileAudioIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoIcon,
  Trash2Icon,
} from "lucide-react"
import { useState, type MouseEvent as ReactMouseEvent, type ReactElement } from "react"

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

/** Lucide glyph size for the hover-action buttons. */
const ACTION_ICON_SIZE = 14
/** Lucide glyph size for the file-type icon in the card's leading slot. */
const FILE_ICON_SIZE = 20

// Renders a wiki file attachment: icon + filename + size, with hover actions
// (preview / download / delete). PDFs additionally get an expandable inline
// preview panel. Action buttons use the FileActionButton helper below — see
// its comment for why they're <button>s, not <a>s.
export function WikiFileCard({ node, editor, getPos }: ReactNodeViewProps): ReactElement {
  const attrs = node.attrs as unknown as FileNodeAttrs
  const isEditable = editor.isEditable
  const url = attrs.url ?? ""
  const filename = attrs.filename || "file"
  const contentType = canonicalize(attrs.contentType)
  const canPreview =
    PREVIEW_ALLOWED_CONTENT_TYPES.has(contentType) &&
    !DANGEROUS_CONTENT_TYPES.has(contentType)
  // PDFs render inline in an expandable panel; other previewable types
  // (text, markdown) still open in a new tab.
  const canPreviewInline = contentType === "application/pdf" && url !== ""
  const previewUrl = url ? `${url}?preview=1` : ""

  // Whether the inline PDF panel is open. The <iframe> is only mounted while
  // expanded, so collapsed cards never fetch the file bytes.
  const [expanded, setExpanded] = useState(false)

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
    if (!previewUrl) return
    window.open(previewUrl, "_blank", "noopener,noreferrer")
  }

  function toggleInlinePreview() {
    if (!canPreviewInline) return
    setExpanded((prev) => !prev)
  }

  // Primary "open it" action for the filename row: expand the inline PDF
  // panel for PDFs, preview in a new tab for other safe types, otherwise
  // download.
  function handleFilenameClick() {
    if (canPreviewInline) {
      toggleInlinePreview()
      return
    }
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
          {renderIcon(contentType, filename)}
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
          {canPreviewInline ? (
            <FileActionButton
              icon={expanded ? <ChevronDownIcon size={ACTION_ICON_SIZE} /> : <EyeIcon size={ACTION_ICON_SIZE} />}
              label={expanded ? "Hide preview" : "Preview file"}
              title={expanded ? "Hide preview" : "Preview"}
              expanded={expanded}
              onClick={toggleInlinePreview}
            />
          ) : null}
          {canPreview && !canPreviewInline && url ? (
            <FileActionButton
              icon={<ExternalLinkIcon size={ACTION_ICON_SIZE} />}
              label="Preview file"
              title="Preview in new tab"
              onClick={handlePreview}
            />
          ) : null}
          {url ? (
            <FileActionButton
              icon={<DownloadIcon size={ACTION_ICON_SIZE} />}
              label="Download file"
              title="Download"
              onClick={handleDownload}
            />
          ) : null}
          {isEditable ? (
            <FileActionButton
              icon={<Trash2Icon size={ACTION_ICON_SIZE} />}
              label="Remove file attachment"
              title="Delete"
              danger
              onClick={handleDelete}
            />
          ) : null}
        </div>
      </div>
      {canPreviewInline && expanded ? (
        <div className="wiki-file-preview" contentEditable={false}>
          <iframe
            className="wiki-file-preview-frame"
            src={previewUrl}
            title={`Preview of ${filename}`}
          />
        </div>
      ) : null}
    </NodeViewWrapper>
  )
}

interface FileActionButtonProps {
  icon: ReactElement
  /** Accessible name; also the screen-reader label. */
  label: string
  /** Hover tooltip. */
  title: string
  onClick: () => void
  /** Renders the destructive (red-hover) variant. */
  danger?: boolean
  /** When set, exposes aria-expanded for the inline-preview toggle. */
  expanded?: boolean
}

// Shared hover-action button for the card. <button> (not <a>) because anchor
// clicks inside a ProseMirror node view double-fire under React StrictMode;
// mousedown is swallowed so PM can't start a selection cycle against it.
function FileActionButton({
  icon,
  label,
  title,
  onClick,
  danger,
  expanded,
}: FileActionButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={
        danger
          ? "wiki-file-action-button wiki-file-action-button--danger"
          : "wiki-file-action-button"
      }
      aria-label={label}
      aria-expanded={expanded}
      title={title}
      onMouseDown={swallow}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}

function swallow(e: ReactMouseEvent): void {
  e.preventDefault()
  e.stopPropagation()
}

// Strip any parameters (e.g. "; charset=utf-8") and lowercase so the MIME
// comparison matches the backend's canonicalContentType in
// wiki_file_controller.go.
function canonicalize(contentType: string): string {
  const ct = (contentType ?? "").split(";")[0]
  return ct.trim().toLowerCase()
}

function renderIcon(contentType: string, filename: string): ReactElement {
  const size = FILE_ICON_SIZE
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
