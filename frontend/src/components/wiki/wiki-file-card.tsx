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
  FileCodeIcon,
  FileIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoIcon,
  Maximize2Icon,
  Trash2Icon,
} from "lucide-react"
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type RefObject,
} from "react"

import { PreviewResizeHandle } from "./wiki-file-preview-resize"

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

/** HTML types we can preview by fetching the bytes and rendering them in a
 *  fully sandboxed <iframe srcdoc>. These stay in DANGEROUS_CONTENT_TYPES — the
 *  backend never serves them inline. We read the body via fetch() (which ignores
 *  Content-Disposition) and the iframe sandbox (no allow-scripts / no
 *  allow-same-origin) neutralizes any embedded script. Inline CSS and data-URI
 *  assets still render, so self-contained single-file HTML looks right. */
const INLINE_HTML_CONTENT_TYPES = new Set<string>([
  "text/html",
  "application/xhtml+xml",
])

/** Largest attachment we pull fully into memory to render in a srcdoc iframe.
 *  Self-contained reports (inlined CSS + data-URI assets) get large quickly, so
 *  this sits well above the typical single-file HTML report; only genuinely huge
 *  files fall back to download so a giant srcdoc can't freeze the tab. */
const MAX_INLINE_HTML_BYTES = 25 * 1024 * 1024

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
// (preview / download / delete). PDFs and self-contained HTML additionally get
// an expandable inline preview panel (PDF via inline iframe src, HTML via a
// sandboxed srcdoc). Action buttons use the FileActionButton helper below — see
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
  // Two inline-preview mechanisms share the expandable panel:
  //   - PDF: <iframe src=...?preview=1> served inline by the backend.
  //   - HTML: <iframe srcdoc> built from fetched bytes, fully sandboxed.
  // Other previewable types (text, markdown) still open in a new tab.
  const isPdf = contentType === "application/pdf"
  const isHtml =
    INLINE_HTML_CONTENT_TYPES.has(contentType) && attrs.size <= MAX_INLINE_HTML_BYTES
  const canPreviewInline = (isPdf || isHtml) && url !== ""
  const previewUrl = url ? `${url}?preview=1` : ""

  // Whether the inline preview panel is open. The frame is only mounted while
  // expanded, so collapsed cards never fetch the file bytes.
  const [expanded, setExpanded] = useState(false)
  // User-dragged preview height in px, or null to fall back to the CSS default
  // (min(75vh, 720px)). Held on the card — not the panel — so a resize survives
  // collapsing and re-expanding the same attachment.
  const [previewHeight, setPreviewHeight] = useState<number | null>(null)
  // The preview panel — target of the native Fullscreen request.
  const previewRef = useRef<HTMLDivElement>(null)
  // Set when Fullscreen is triggered from a collapsed card: the panel must
  // mount before we can request fullscreen on it, so we defer the request to
  // the effect below that fires once the panel is expanded.
  const pendingFullscreenRef = useRef(false)
  // HTML is fetched into a srcdoc only while its panel is open.
  const htmlPreview = useHtmlPreview(url, expanded && isHtml)

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

  // Maximize the preview via the native Fullscreen API. Toggles back out if
  // already on. When the card is collapsed we first open the panel and defer
  // the actual request to the effect below — the fullscreen target can't be
  // mounted until the panel renders, and the user activation survives the
  // extra render tick.
  function toggleFullscreen() {
    if (document.fullscreenElement) {
      void document.exitFullscreen()
      return
    }
    if (!expanded) {
      pendingFullscreenRef.current = true
      setExpanded(true)
      return
    }
    void previewRef.current?.requestFullscreen().catch(() => {
      /* user denied or unsupported — leave the inline panel as-is */
    })
  }

  // Fire a deferred fullscreen request once the panel has mounted (see
  // toggleFullscreen). Runs only when the collapsed-card path armed it.
  useEffect(() => {
    if (!expanded || !pendingFullscreenRef.current) return
    pendingFullscreenRef.current = false
    void previewRef.current?.requestFullscreen().catch(() => {
      /* user denied or unsupported — leave the inline panel open */
    })
  }, [expanded])

  // Primary "open it" action for the filename row: expand the inline panel
  // for PDF/HTML, preview in a new tab for other safe types, otherwise
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
          {canPreviewInline ? (
            <FileActionButton
              icon={<Maximize2Icon size={ACTION_ICON_SIZE} />}
              label="View preview fullscreen"
              title="Fullscreen"
              onClick={toggleFullscreen}
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
        <FilePreviewPanel
          containerRef={previewRef}
          isPdf={isPdf}
          previewUrl={previewUrl}
          filename={filename}
          html={htmlPreview}
          height={previewHeight}
          onHeightChange={setPreviewHeight}
        />
      ) : null}
    </NodeViewWrapper>
  )
}

interface HtmlPreviewState {
  /** Fetched HTML body; null until the first successful load. */
  content: string | null
  /** User-facing failure message; null while pending or on success. */
  error: string | null
}

// Fetches an HTML attachment's bytes for inline srcdoc rendering. No-ops until
// `active` (panel open AND the file is previewable HTML), then fetches once and
// caches the result for the card's lifetime. Cookie auth rides the same-origin
// request automatically (same as the PDF/download paths); the attachment
// Content-Disposition doesn't affect a fetch() body read.
function useHtmlPreview(url: string, active: boolean): HtmlPreviewState {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!active || !url) return
    if (content !== null || error !== null) return

    let cancelled = false
    fetch(url, { credentials: "same-origin", headers: { Accept: "text/html" } })
      .then((res) => {
        if (!res.ok) throw new Error(`Couldn't load preview (HTTP ${res.status}).`)
        return res.text()
      })
      .then((text) => {
        if (!cancelled) setContent(text)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Couldn't load preview.")
        }
      })
    return () => {
      cancelled = true
    }
  }, [active, url, content, error])

  return { content, error }
}

interface FilePreviewPanelProps {
  /** Container ref — the element handed to the native Fullscreen request and
   *  the target the resize drag mutates in place. */
  containerRef: RefObject<HTMLDivElement | null>
  isPdf: boolean
  /** Inline-disposition URL for the PDF iframe (unused for HTML). */
  previewUrl: string
  filename: string
  html: HtmlPreviewState
  /** User-dragged height in px, or null for the CSS default. */
  height: number | null
  /** Commits a new dragged height once the drag ends. */
  onHeightChange: (height: number) => void
}

// The expandable preview panel. PDFs render via an inline iframe src; HTML
// renders the fetched bytes into a fully locked sandbox (no allow-scripts, no
// allow-same-origin) so embedded scripts are inert while inline CSS and
// data-URI assets still display. A drag handle along the bottom edge lets the
// reader grow or shrink the frame; the chosen height is held on the card.
function FilePreviewPanel({
  containerRef,
  isPdf,
  previewUrl,
  filename,
  html,
  height,
  onHeightChange,
}: FilePreviewPanelProps): ReactElement {
  // Shared by whichever of the two iframes renders — the resize handle measures
  // this to seed the drag. Absent while HTML is still loading or errored, which
  // is exactly when we also hide the handle.
  const frameRef = useRef<HTMLIFrameElement>(null)
  const hasFrame = isPdf || html.content !== null

  return (
    <div className="wiki-file-preview" contentEditable={false} ref={containerRef}>
      {isPdf ? (
        <iframe
          ref={frameRef}
          className="wiki-file-preview-frame"
          src={previewUrl}
          title={`Preview of ${filename}`}
        />
      ) : html.error !== null ? (
        <p className="wiki-file-preview-status wiki-file-preview-status--error">
          {html.error}
        </p>
      ) : html.content === null ? (
        <p className="wiki-file-preview-status">Loading preview…</p>
      ) : (
        <iframe
          ref={frameRef}
          className="wiki-file-preview-frame"
          sandbox=""
          srcDoc={html.content}
          title={`Preview of ${filename}`}
        />
      )}
      {hasFrame ? (
        <PreviewResizeHandle
          containerRef={containerRef}
          frameRef={frameRef}
          height={height}
          onCommit={onHeightChange}
        />
      ) : null}
    </div>
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
    type === "text/html" ||
    type === "application/xhtml+xml" ||
    type === "application/xml" ||
    type === "text/xml"
  ) {
    return <FileCodeIcon size={size} />
  }
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
