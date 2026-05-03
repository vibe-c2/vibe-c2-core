import type { Editor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import { getMarkRange } from "@tiptap/core"
import { CodeCopyButton } from "@/components/wiki/wiki-code-copy-button"

interface WikiInlineCodePopoverProps {
  editor: Editor | null
}

/**
 * Floating copy button for inline `code` marks. Auto-shows whenever the caret
 * is inside an inline code mark — same trigger pattern as WikiLinkPopover.
 * Visual style and copy behavior come from the shared CodeCopyButton.
 */
export function WikiInlineCodePopover({ editor }: WikiInlineCodePopoverProps) {
  if (!editor) return null

  function getInlineCodeText(): string {
    if (!editor) return ""
    const codeType = editor.schema.marks.code
    if (!codeType) return ""
    const $from = editor.state.doc.resolve(editor.state.selection.from)
    const range = getMarkRange($from, codeType)
    if (!range) return ""
    return editor.state.doc.textBetween(range.from, range.to)
  }

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="wikiInlineCodePopover"
      updateDelay={0}
      options={{ placement: "top", offset: 6 }}
      // Collapsed caret only — when the user has a selection inside the code
      // mark, the WikiEditorBubbleMenu (formatting toggles) takes over the
      // same `top` slot; copy is still reachable via Ctrl/Cmd-C.
      shouldShow={({ editor, from, to }) =>
        editor.isEditable && from === to && editor.isActive("code")
      }
      className="z-50"
    >
      <CodeCopyButton getText={getInlineCodeText} />
    </BubbleMenu>
  )
}
