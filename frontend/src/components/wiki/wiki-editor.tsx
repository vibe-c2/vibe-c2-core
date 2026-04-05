import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Collaboration from "@tiptap/extension-collaboration"
import Placeholder from "@tiptap/extension-placeholder"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import { useHocuspocus } from "@/hooks/use-hocuspocus"
import { WikiEditorToolbar } from "@/components/wiki/wiki-editor-toolbar"
import { ConnectionBanner } from "@/components/wiki/connection-banner"

interface WikiEditorProps {
  documentId: string
  isEditor: boolean
  content: string
}

export function WikiEditor({ documentId, isEditor, content }: WikiEditorProps) {
  if (isEditor) {
    return <CollaborativeEditor documentId={documentId} />
  }
  return <ReadOnlyEditor content={content} />
}

function CollaborativeEditor({ documentId }: { documentId: string }) {
  const { ydoc, isConnected, isSynced } = useHocuspocus(documentId)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false }), // Y.js handles undo/redo
      Collaboration.configure({ document: ydoc }),
      Placeholder.configure({ placeholder: "Start writing..." }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
  })

  return (
    <>
      <ConnectionBanner isConnected={isConnected} isSynced={isSynced} />
      <WikiEditorToolbar editor={editor} />
      <div className="flex-1 overflow-y-auto px-4 py-2">
        <EditorContent
          editor={editor}
          className="prose prose-sm dark:prose-invert max-w-none focus:outline-none"
        />
      </div>
    </>
  )
}

function ReadOnlyEditor({ content }: { content: string }) {
  const editor = useEditor({
    editable: false,
    content,
    extensions: [StarterKit, TaskList, TaskItem],
  })

  return (
    <div className="flex-1 overflow-y-auto px-4 py-2">
      <EditorContent
        editor={editor}
        className="prose prose-sm dark:prose-invert max-w-none"
      />
    </div>
  )
}
