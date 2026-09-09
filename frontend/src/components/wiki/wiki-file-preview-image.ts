// Decides whether an attachment is an image the browser can render directly.
//
// Deliberately separate from wiki-file-preview-source.ts. Everything there
// answers "what bytes do we fetch and convert into a srcdoc"; an image needs
// neither — the browser is already the renderer, so the card points an <img>
// at the attachment URL and the work is done. Sharing a module would put a
// kind through that pipeline that never travels it.

/** Raster types we render inline. Mirrors previewAllowedContentTypes in
 *  wiki_file_controller.go, which must serve these with an inline disposition
 *  for the new-tab preview to display rather than download. */
const IMAGE_CONTENT_TYPES = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/bmp",
])

/** SVG is excluded on purpose, matching the backend's dangerousContentTypes.
 *  It is a scriptable document rather than a raster: an <img> would render it
 *  harmlessly, but the lightbox and the new-tab preview would not, and one
 *  rule for all three is worth more than a preview of one format. */
const DENIED_IMAGE_CONTENT_TYPES = new Set<string>(["image/svg+xml"])

/** Extension fallback for when MIME sniffing lands on something generic —
 *  the same problem docx/xlsx have in wiki-file-preview-source.ts. An image
 *  stored as application/octet-stream still deserves its thumbnail. */
const IMAGE_EXTENSIONS = new Set<string>([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "bmp",
])

/**
 * True when this attachment should render as an image: thumbnail on the card,
 * full-size in the lightbox.
 *
 * Content type wins; the extension is consulted only when the type is
 * unrecognised, and never to override a denied type — a file named .png that
 * the backend positively identified as SVG stays denied.
 */
export function isPreviewableImage(
  contentType: string,
  filename: string,
): boolean {
  if (DENIED_IMAGE_CONTENT_TYPES.has(contentType)) return false
  if (IMAGE_CONTENT_TYPES.has(contentType)) return true
  // Only fall back when the type says nothing useful. An "image/tiff" the
  // browser can't decode must not be rescued by a .tif extension.
  if (contentType !== "" && contentType !== "application/octet-stream") {
    return false
  }
  const dot = filename.lastIndexOf(".")
  const ext = dot === -1 ? "" : filename.slice(dot + 1).toLowerCase()
  return IMAGE_EXTENSIONS.has(ext)
}
