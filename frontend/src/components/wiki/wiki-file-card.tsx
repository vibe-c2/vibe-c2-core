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
  ImageIcon,
  Maximize2Icon,
  Trash2Icon,
} from "lucide-react"
import { useTheme } from "next-themes"
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type RefObject,
} from "react"

import Lightbox from "yet-another-react-lightbox"
import Zoom from "yet-another-react-lightbox/plugins/zoom"
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen"
import Counter from "yet-another-react-lightbox/plugins/counter"
import "yet-another-react-lightbox/styles.css"
import "yet-another-react-lightbox/plugins/counter.css"

import { usePrintMode } from "@/hooks/use-print-mode"
import { useFocusRestoreWithoutScroll } from "@/hooks/use-focus-restore-without-scroll"
import { PreviewResizeHandle } from "./wiki-file-preview-resize"
import { isPreviewableImage } from "./wiki-file-preview-image"
import {
  detectMediaPreviewKind,
  type MediaPreviewKind,
} from "./wiki-file-preview-media"
import {
  detectInlinePreviewKind,
  useRenderedPreview,
  type InlinePreviewKind,
  type RenderedPreviewState,
} from "./wiki-file-preview-source"

/** Content types the browser can render inline without executing scripts.
 *  Must stay in sync with previewAllowedContentTypes in wiki_file_controller.go. */
const PREVIEW_ALLOWED_CONTENT_TYPES = new Set<string>([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
  "video/webm",
  "video/mp4",
  "video/ogg",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/mp4",
  "audio/flac",
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
// (preview / download / delete). PDFs, self-contained HTML, Word documents,
// spreadsheets, delimited text, Markdown and plain text all get an expandable
// inline preview panel (PDF via an inline iframe src; the rest converted
// client-side into a sandboxed srcdoc — see wiki-file-preview-source.ts).
// Image attachments take a third path: the browser is already the renderer, so
// the card shows a real thumbnail in its leading slot and clicking it opens the
// full image in a lightbox — no expandable panel, no conversion.
// A type that has no inline renderer, or is too large for one, falls back to
// the new-tab preview when the backend will serve it inline, and to download
// otherwise. Action buttons use the FileActionButton helper below — see its
// comment for why they're <button>s, not <a>s.
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
  //   - everything else: <iframe srcdoc> built from bytes we fetched and
  //     converted ourselves, fully sandboxed and CSP-constrained.
  // Other previewable types (text, markdown) still open in a new tab.
  const isPdf = contentType === "application/pdf"
  // Images bypass the panel entirely — see the thumbnail/lightbox path below.
  const isImage = isPreviewableImage(contentType, filename) && url !== ""
  // Video and audio play in the panel through a native element pointed at
  // the inline URL; nothing is fetched or converted here.
  const mediaKind: MediaPreviewKind | null =
    isPdf || isImage ? null : detectMediaPreviewKind(contentType, filename)
  const renderedKind: InlinePreviewKind | null =
    isPdf || isImage || mediaKind !== null
      ? null
      : detectInlinePreviewKind(contentType, filename, attrs.size)
  const canPreviewInline =
    (isPdf || mediaKind !== null || renderedKind !== null) && url !== ""
  const previewUrl = url ? `${url}?preview=1` : ""

  // The frame is style-isolated, so the converters embed a palette rather than
  // inheriting the app's. Resolved (not raw) theme, so "system" maps to a real
  // value instead of leaking through as a string the converters don't know.
  const { resolvedTheme } = useTheme()
  const previewTheme = resolvedTheme === "dark" ? "dark" : "light"

  // Whether the inline preview panel is open. The frame is only mounted while
  // expanded, so collapsed cards never fetch the file bytes.
  const [expanded, setExpanded] = useState(false)
  // Whether the image lightbox is open. Mounted only while open, so a document
  // full of image attachments pays nothing for the ones nobody opens.
  const [lightboxOpen, setLightboxOpen] = useState(false)
  // Set when the thumbnail fails to load — most often a blob the sweeper
  // collected, leaving the node behind. Falling back to the type icon keeps the
  // card readable instead of leaving a broken-image gap, and disarms the
  // lightbox, which would only show the same failure larger.
  const [thumbFailed, setThumbFailed] = useState(false)
  const showThumbnail = isImage && !thumbFailed
  // The print page never scrolls, so a lazy thumbnail below the initial
  // viewport would still be unfetched when window.print() fires and export as a
  // blank tile. Same trade the image node makes.
  const isPrintMode = usePrintMode()
  // Same focus-restore scroll as the inline image node — see the hook.
  const captureFocusTarget = useFocusRestoreWithoutScroll(lightboxOpen)

  function openLightbox() {
    captureFocusTarget()
    setLightboxOpen(true)
  }
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
  // Bytes are fetched and converted only while the panel is open.
  const rendered = useRenderedPreview(
    url,
    renderedKind,
    expanded && renderedKind !== null,
    previewTheme,
    filename,
  )

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
    if (showThumbnail) {
      openLightbox()
      return
    }
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
        {showThumbnail ? (
          <button
            type="button"
            className="wiki-file-thumb"
            aria-label={`Open ${filename} full size`}
            title="Open full size"
            onMouseDown={swallow}
            onClick={openLightbox}
          >
            <img
              src={previewUrl}
              alt=""
              // Below-the-fold attachments must not fetch until scrolled to —
              // a long document can carry many of these, and the thumbnail is
              // the full-size image scaled down by the browser (there is no
              // separate thumbnail artifact on the backend).
              loading={isPrintMode ? "eager" : "lazy"}
              decoding={isPrintMode ? "sync" : "async"}
              draggable={false}
              onError={() => setThumbFailed(true)}
            />
          </button>
        ) : (
          <div className="wiki-file-icon" aria-hidden="true">
            {renderIcon(contentType, filename)}
          </div>
        )}
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
          {showThumbnail ? (
            <FileActionButton
              icon={<Maximize2Icon size={ACTION_ICON_SIZE} />}
              label="Open image full size"
              title="Open full size"
              onClick={openLightbox}
            />
          ) : null}
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
          {canPreview && !canPreviewInline && !showThumbnail && url ? (
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
      {lightboxOpen ? (
        <Lightbox
          open
          close={() => setLightboxOpen(false)}
          slides={[{ src: previewUrl, alt: filename }]}
          plugins={[Zoom, Fullscreen, Counter]}
          carousel={{ finite: true }}
          controller={{ closeOnBackdropClick: true }}
          render={{
            // One attachment per card — no carousel to page through.
            buttonPrev: () => null,
            buttonNext: () => null,
          }}
          zoom={{ maxZoomPixelRatio: 4, scrollToZoom: true }}
        />
      ) : null}
      {canPreviewInline && expanded ? (
        <FilePreviewPanel
          containerRef={previewRef}
          isPdf={isPdf}
          mediaKind={mediaKind}
          previewUrl={previewUrl}
          filename={filename}
          rendered={rendered}
          height={previewHeight}
          onHeightChange={setPreviewHeight}
        />
      ) : null}
    </NodeViewWrapper>
  )
}

interface FilePreviewPanelProps {
  /** Container ref — the element handed to the native Fullscreen request and
   *  the target the resize drag mutates in place. */
  containerRef: RefObject<HTMLDivElement | null>
  isPdf: boolean
  /** Video or audio rendered through a native player; null otherwise. */
  mediaKind: MediaPreviewKind | null
  /** Inline-disposition URL for the PDF iframe and the media player (unused for HTML). */
  previewUrl: string
  filename: string
  rendered: RenderedPreviewState
  /** User-dragged height in px, or null for the CSS default. */
  height: number | null
  /** Commits a new dragged height once the drag ends. */
  onHeightChange: (height: number) => void
}

// The expandable preview panel. PDFs render via an inline iframe src; every
// other format renders a converted document into a fully locked sandbox (no
// allow-scripts, no allow-same-origin) so embedded scripts are inert, carrying
// an injected CSP that also denies the document any network egress, while
// inline CSS and data-URI assets still display. A drag handle lets the
// reader grow or shrink the frame; the chosen height is held on the card.
function FilePreviewPanel({
  containerRef,
  isPdf,
  mediaKind,
  previewUrl,
  filename,
  rendered,
  height,
  onHeightChange,
}: FilePreviewPanelProps): ReactElement {
  // Shared by whichever of the two iframes renders — the resize handle measures
  // this to seed the drag. Absent while HTML is still loading or errored, which
  // is exactly when we also hide the handle.
  const frameRef = useRef<HTMLIFrameElement>(null)
  // Media sizes itself to its own aspect ratio, so no drag handle.
  const hasFrame = mediaKind === null && (isPdf || rendered.content !== null)

  return (
    <div className="wiki-file-preview" contentEditable={false} ref={containerRef}>
      {mediaKind === "video" ? (
        // preload="metadata": duration and first frame only, until played.
        <video
          className="wiki-file-preview-media"
          controls
          preload="metadata"
          src={previewUrl}
          title={filename}
        />
      ) : mediaKind === "audio" ? (
        <audio
          className="wiki-file-preview-media wiki-file-preview-media--audio"
          controls
          preload="metadata"
          src={previewUrl}
          title={filename}
        />
      ) : isPdf ? (
        <iframe
          ref={frameRef}
          className="wiki-file-preview-frame"
          src={previewUrl}
          title={`Preview of ${filename}`}
        />
      ) : rendered.error !== null ? (
        <p className="wiki-file-preview-status wiki-file-preview-status--error">
          {rendered.error}
        </p>
      ) : rendered.content === null ? (
        <p className="wiki-file-preview-status">Loading preview…</p>
      ) : (
        <iframe
          ref={frameRef}
          className="wiki-file-preview-frame"
          sandbox=""
          srcDoc={rendered.content}
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
  // Reached by images that have no thumbnail: SVG (never rendered inline), a
  // format the browser can't decode, or one whose bytes have gone missing.
  if (type.startsWith("image/")) return <ImageIcon size={size} />
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
