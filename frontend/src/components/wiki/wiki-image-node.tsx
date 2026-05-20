import { useState } from "react"
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react"
import { MaximizeIcon, Trash2Icon } from "lucide-react"
import Lightbox from "yet-another-react-lightbox"
import Zoom from "yet-another-react-lightbox/plugins/zoom"
import Fullscreen from "yet-another-react-lightbox/plugins/fullscreen"
import Counter from "yet-another-react-lightbox/plugins/counter"
import "yet-another-react-lightbox/styles.css"
import "yet-another-react-lightbox/plugins/counter.css"

/**
 * NodeView for Tiptap's Image extension. Wraps the raw <img> in a container
 * that overlays a fullscreen button on hover; clicking either the button or
 * the image itself opens a zoomable, fullscreen-capable lightbox.
 *
 * Using ReactNodeViewRenderer (same pattern as WikiCodeBlock) keeps all the
 * hover state local — nothing leaks into the CRDT.
 */
export function WikiImageNode({ node, editor, getPos }: ReactNodeViewProps) {
  const [isOpen, setIsOpen] = useState(false)
  const src: string = node.attrs.src ?? ""
  const alt: string = node.attrs.alt ?? ""
  // Natural dimensions captured at upload time, persisted on the node so
  // the browser can reserve aspect ratio before the image decodes.
  // `null` for legacy nodes uploaded before this attribute existed —
  // those render with no explicit dimensions (current behavior).
  const width = typeof node.attrs.width === "number" ? node.attrs.width : null
  const height = typeof node.attrs.height === "number" ? node.attrs.height : null
  const isEditable = editor.isEditable

  function handleDelete() {
    // getPos() can return undefined briefly during transitions (node view
    // detached, tr not yet applied). Bail rather than dispatching a bogus
    // range that could nuke the wrong content.
    const pos = typeof getPos === "function" ? getPos() : undefined
    if (pos == null) return
    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run()
  }

  return (
    <NodeViewWrapper
      className="wiki-image-wrapper"
      // The wrapper is structural, not editable text; kill contentEditable
      // so clicks don't steal the ProseMirror selection.
      as="figure"
    >
      <div className="wiki-image-frame" contentEditable={false}>
        <img
          src={src}
          alt={alt}
          width={width ?? undefined}
          height={height ?? undefined}
          // Defer decoding so a long doc full of images doesn't block the
          // main thread on initial render. The intrinsic dimensions above
          // give the browser everything it needs to lay the image out
          // correctly before the bytes arrive.
          loading="lazy"
          decoding="async"
          className="wiki-image"
          draggable={false}
          onClick={() => setIsOpen(true)}
        />
        <div className="wiki-image-actions" contentEditable={false}>
          <button
            type="button"
            className="wiki-image-action-button"
            aria-label="Open image preview"
            title="Preview"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setIsOpen(true)}
          >
            <MaximizeIcon size={14} />
          </button>
          {isEditable ? (
            <button
              type="button"
              className="wiki-image-action-button wiki-image-action-button--danger"
              aria-label="Delete image"
              title="Delete"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleDelete}
            >
              <Trash2Icon size={14} />
            </button>
          ) : null}
        </div>
      </div>

      {isOpen ? (
        <Lightbox
          open={isOpen}
          close={() => setIsOpen(false)}
          slides={[{ src, alt }]}
          plugins={[Zoom, Fullscreen, Counter]}
          carousel={{ finite: true }}
          controller={{ closeOnBackdropClick: true }}
          render={{
            // Single-image lightbox — suppress the prev/next arrows the
            // default controls would show.
            buttonPrev: () => null,
            buttonNext: () => null,
          }}
          zoom={{
            maxZoomPixelRatio: 4,
            scrollToZoom: true,
          }}
        />
      ) : null}
    </NodeViewWrapper>
  )
}
