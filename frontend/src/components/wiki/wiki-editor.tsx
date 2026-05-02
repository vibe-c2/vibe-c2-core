import { useEffect, useRef } from "react"
import { Extension } from "@tiptap/core"
import { useEditor, EditorContent, ReactNodeViewRenderer } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Collaboration from "@tiptap/extension-collaboration"
import Placeholder from "@tiptap/extension-placeholder"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table"
import Image from "@tiptap/extension-image"
import { HorizontalRule } from "@tiptap/extension-horizontal-rule"
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight"
import { yCursorPlugin } from "@tiptap/y-tiptap"
import { useHocuspocus } from "@/hooks/use-hocuspocus"
import { useAuthStore } from "@/stores/auth"
import { getCursorColor, renderCursor } from "@/lib/cursor-colors"
import { lowlight } from "@/lib/wiki-lowlight"
import { Skeleton } from "@/components/ui/skeleton"
import { ConnectionBanner } from "@/components/wiki/connection-banner"
import { WikiCodeBlock } from "@/components/wiki/wiki-code-block"
import { WikiHorizontalRuleNode } from "@/components/wiki/wiki-horizontal-rule-node"
import { WikiImageNode } from "@/components/wiki/wiki-image-node"
import { WikiFileExtension } from "@/components/wiki/wiki-file-node"
import { WikiEditorBubbleMenu } from "@/components/wiki/wiki-editor-bubble-menu"
import { WikiEditorTableMenu } from "@/components/wiki/wiki-editor-table-menu"
import { WikiSlashCommand } from "@/components/wiki/wiki-slash-command/extension"
import { WikiNoticeExtension } from "@/components/wiki/wiki-notice-node"
import { WikiEscapeEdgeBlock } from "@/components/wiki/wiki-escape-edge-block"
import {
  extractClipboardImages,
  extractDropImages,
  uploadAndInsertWikiImages,
} from "@/components/wiki/wiki-image-upload"
import {
  extractClipboardFiles,
  extractDropFiles,
  uploadAndInsertWikiFiles,
} from "@/components/wiki/wiki-file-upload"
import "./wiki-editor.css"

interface WikiEditorProps {
  documentId: string
  isEditor: boolean
}

export function WikiEditor({ documentId, isEditor }: WikiEditorProps) {
  const { ydoc, provider, connectionStatus, isSynced, isReady } = useHocuspocus(documentId)
  const user = useAuthStore((s) => s.user)

  // Paste/drop handlers run long after the editor config is captured; route
  // through a ref so they always observe the current editor (not a stale
  // reference from the render in which the config was built).
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null)

  const editor = useEditor({
    editable: isEditor,
    editorProps: {
      attributes: {
        spellcheck: "false",
      },
      handlePaste: (view, event) => {
        if (!isEditor) return false
        const images = extractClipboardImages(event.clipboardData)
        const attachments = extractClipboardFiles(event.clipboardData)
        if (images.length === 0 && attachments.length === 0) return false
        const currentEditor = editorRef.current
        if (!currentEditor) return false
        event.preventDefault()
        const pos = view.state.selection.from
        if (images.length > 0) {
          void uploadAndInsertWikiImages(currentEditor, documentId, images, { pos })
        }
        if (attachments.length > 0) {
          void uploadAndInsertWikiFiles(currentEditor, documentId, attachments, { pos })
        }
        return true
      },
      handleDrop: (view, event) => {
        if (!isEditor) return false
        const dt =
          event instanceof DragEvent ? event.dataTransfer : null
        const images = extractDropImages(dt)
        const attachments = extractDropFiles(dt)
        if (images.length === 0 && attachments.length === 0) return false
        const currentEditor = editorRef.current
        if (!currentEditor) return false
        event.preventDefault()
        const coords =
          event instanceof DragEvent
            ? view.posAtCoords({ left: event.clientX, top: event.clientY })
            : null
        const pos = coords?.pos ?? view.state.selection.from
        if (images.length > 0) {
          void uploadAndInsertWikiImages(currentEditor, documentId, images, { pos })
        }
        if (attachments.length > 0) {
          void uploadAndInsertWikiFiles(currentEditor, documentId, attachments, { pos })
        }
        return true
      },
    },
    extensions: [
      StarterKit.configure({
        history: false, // Y.js collaboration handles undo/redo
        codeBlock: false, // Replaced by CodeBlockLowlight below
        horizontalRule: false, // Replaced by custom NodeView below
        code: { HTMLAttributes: { class: "wiki-inline-code" } },
      }),
      HorizontalRule.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            variant: {
              default: "line",
              parseHTML: (el) => {
                const v = el.getAttribute("data-variant")
                return v === "dashed" ? "dashed" : "line"
              },
              renderHTML: (attrs) =>
                attrs.variant && attrs.variant !== "line"
                  ? { "data-variant": attrs.variant }
                  : {},
            },
          }
        },
        addNodeView() {
          return ReactNodeViewRenderer(WikiHorizontalRuleNode)
        },
      }),
      CodeBlockLowlight.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            wrap: {
              default: false,
              parseHTML: (el) => el.classList.contains("is-wrapped"),
              renderHTML: (attrs) => (attrs.wrap ? { class: "is-wrapped" } : {}),
            },
          }
        },
        addNodeView() {
          return ReactNodeViewRenderer(WikiCodeBlock)
        },
      }).configure({
        lowlight,
        defaultLanguage: "plaintext",
        HTMLAttributes: { class: "wiki-code-block" },
      }),
      Collaboration.configure({
        document: ydoc,
      }),
      // Use yCursorPlugin from @tiptap/y-tiptap directly (same package
      // that Collaboration uses for ySyncPlugin) so the plugin keys match.
      // The @tiptap/extension-collaboration-cursor package imports from
      // y-prosemirror which has a different PluginKey instance.
      ...(provider
        ? [Extension.create({
            name: "collaborationCursor",
            addProseMirrorPlugins() {
              const awareness = provider.awareness
              awareness.setLocalStateField("user", {
                name: user?.username ?? "Anonymous",
                color: getCursorColor(user?.userId ?? "anon"),
              })
              return [
                yCursorPlugin(awareness, { cursorBuilder: renderCursor }),
              ]
            },
          })]
        : []),
      Placeholder.configure({
        placeholder: isEditor ? "Start writing..." : "",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({
        resizable: true,
        allowTableNodeSelection: true,
        HTMLAttributes: { class: "wiki-table" },
      }),
      TableRow,
      TableHeader,
      TableCell,
      Image.extend({
        addNodeView() {
          return ReactNodeViewRenderer(WikiImageNode)
        },
      }).configure({
        // Images render as block-level nodes so they break the paragraph
        // flow rather than wedging inline — matches how paste/drop are used.
        inline: false,
        allowBase64: false,
        HTMLAttributes: { class: "wiki-image" },
      }),
      WikiFileExtension,
      WikiNoticeExtension,
      WikiSlashCommand.configure({
        context: { documentId },
      }),
      WikiEscapeEdgeBlock,
    ],
  }, [ydoc, provider, documentId, isEditor])

  // Keep the paste/drop ref pointed at the live editor so those handlers
  // never fire against a stale/destroyed instance after a deps-driven rebuild.
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  // Keep editable in sync with role changes without remounting.
  useEffect(() => {
    if (editor && editor.isEditable !== isEditor) {
      editor.setEditable(isEditor)
    }
  }, [editor, isEditor])

  // Hide cursor when the tab is not visible, restore when it returns.
  // Only clear the cursor field — the user label stays in awareness so
  // it's immediately available when the cursor reappears (avoids the
  // "User: <id>" fallback from a race between user and cursor updates).
  useEffect(() => {
    if (!provider || !editor) return
    const awareness = provider.awareness

    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        awareness.setLocalStateField("cursor", null)
      } else {
        const { from, to } = editor.state.selection
        editor.commands.setTextSelection({ from, to })
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => document.removeEventListener("visibilitychange", onVisibilityChange)
  }, [provider, editor])

  // One-time migration: if a document was authored with the textarea editor
  // (Y.Text on "content" key), the XmlFragment on "default" will be empty.
  // Copy the plain text into the rich editor so legacy content is preserved.
  useEffect(() => {
    if (!isReady || !editor) return
    const xmlFragment = ydoc.getXmlFragment("default")
    if (xmlFragment.length > 0) return

    const legacyText = ydoc.getText("content").toString()
    if (!legacyText) return

    editor.commands.setContent(legacyText)
  }, [isReady, editor, ydoc])

  return (
    <>
      <ConnectionBanner connectionStatus={connectionStatus} isSynced={isSynced} isReady={isReady} />
      {isEditor && <WikiEditorBubbleMenu editor={editor} />}
      {isEditor && <WikiEditorTableMenu editor={editor} />}
      <div
        className="flex-1 overflow-y-auto px-4 py-2"
        onMouseDown={(e) => {
          if (!isEditor || !editor) return
          if (e.target !== e.currentTarget) return
          e.preventDefault()

          if (editor.isEmpty) {
            editor.chain().focus().run()
            return
          }

          const view = editor.view
          const editorRect = (view.dom as HTMLElement).getBoundingClientRect()

          if (e.clientY > editorRect.bottom) {
            editor.chain().focus("end").run()
            return
          }
          if (e.clientY < editorRect.top) {
            editor.chain().focus("start").run()
            return
          }

          // Gutter click next to a line — resolve position at clamped X so
          // the caret lands on the clicked line, not at the end of the doc.
          const clampedX = Math.min(
            Math.max(e.clientX, editorRect.left + 1),
            editorRect.right - 1,
          )
          const coords = view.posAtCoords({ left: clampedX, top: e.clientY })
          if (coords) {
            const targetPos = coords.pos
            // At a wrap boundary, a single pos can render either at
            // end-of-previous-line or start-of-next-line. Resolve both
            // sides via view.coordsAtPos: if their line-Y differs,
            // we're at a wrap. If the click Y is closer to the forward
            // side, set the DOM selection directly using the forward
            // DOM position so the caret renders at line-2 start.
            const before = view.coordsAtPos(targetPos, -1)
            const after = view.coordsAtPos(targetPos, 1)
            const linesDiffer =
              Math.abs(
                (before.top + before.bottom) / 2 -
                  (after.top + after.bottom) / 2,
              ) > 4
            const afterIsCloser =
              Math.abs(e.clientY - (after.top + after.bottom) / 2) <
              Math.abs(e.clientY - (before.top + before.bottom) / 2)

            editor.chain().focus().setTextSelection(targetPos).run()

            if (linesDiffer && afterIsCloser) {
              const domPos = view.domAtPos(targetPos, 1)
              const domSel = window.getSelection()
              if (domSel) {
                const range = document.createRange()
                range.setStart(domPos.node, domPos.offset)
                range.collapse(true)
                domSel.removeAllRanges()
                domSel.addRange(range)
              }
            }
          } else {
            editor.chain().focus("end").run()
          }
        }}
      >
        {isReady ? (
          <EditorContent
            editor={editor}
            className="prose prose-sm dark:prose-invert max-w-none focus:outline-none"
          />
        ) : (
          <div aria-busy="true" aria-live="polite" className="flex flex-col gap-3">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}
      </div>
    </>
  )
}
