import { useEffect } from "react"
import { Extension } from "@tiptap/core"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Collaboration from "@tiptap/extension-collaboration"
import Placeholder from "@tiptap/extension-placeholder"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import { yCursorPlugin } from "@tiptap/y-tiptap"
import { useHocuspocus } from "@/hooks/use-hocuspocus"
import { useAuthStore } from "@/stores/auth"
import { getCursorColor, renderCursor } from "@/lib/cursor-colors"
import { Skeleton } from "@/components/ui/skeleton"
import { ConnectionBanner } from "@/components/wiki/connection-banner"
import { WikiEditorToolbar } from "@/components/wiki/wiki-editor-toolbar"
import "./wiki-editor.css"

interface WikiEditorProps {
  documentId: string
  isEditor: boolean
}

export function WikiEditor({ documentId, isEditor }: WikiEditorProps) {
  const { ydoc, provider, connectionStatus, isSynced, isReady } = useHocuspocus(documentId)
  const user = useAuthStore((s) => s.user)

  const editor = useEditor({
    editable: isEditor,
    extensions: [
      StarterKit.configure({
        history: false, // Y.js collaboration handles undo/redo
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
    ],
  }, [ydoc, provider])

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
      {isEditor && <WikiEditorToolbar editor={editor} />}
      <div className="flex-1 overflow-y-auto px-4 py-2">
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
