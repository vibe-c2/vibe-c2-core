import type { Editor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import { NodeSelection } from "@tiptap/pm/state"
import { BoldIcon, CodeIcon, ItalicIcon, StrikethroughIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

interface WikiEditorBubbleMenuProps {
  editor: Editor | null
}

export function WikiEditorBubbleMenu({ editor }: WikiEditorBubbleMenuProps) {
  if (!editor) return null

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor, from, to, state }) => {
        if (!editor.isEditable) return false
        if (from === to) return false
        if (editor.isActive("codeBlock")) return false
        // Node selections (image, etc.) report from !== to but none of the
        // mark toggles in this menu apply to them — hide to avoid offering
        // actions that would silently no-op.
        if (state.selection instanceof NodeSelection) return false
        return true
      }}
      className="flex items-center gap-0.5 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
    >
      <BubbleButton
        icon={BoldIcon}
        tooltip="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <BubbleButton
        icon={ItalicIcon}
        tooltip="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <BubbleButton
        icon={StrikethroughIcon}
        tooltip="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <BubbleButton
        icon={CodeIcon}
        tooltip="Inline code"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />
    </BubbleMenu>
  )
}

function BubbleButton({
  icon: Icon,
  tooltip,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  tooltip: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={active ? "secondary" : "ghost"}
            size="icon-xs"
            onMouseDown={(e) => {
              e.preventDefault()
              onClick()
            }}
          />
        }
      >
        <Icon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}
