import type { Editor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
// Side-effect import to ensure the Table extension's module augmentation
// (declare module '@tiptap/core') is loaded in this file's type context so
// chain().addRowBefore(), deleteTable(), etc. are typed.
import "@tiptap/extension-table"
import { CellSelection } from "@tiptap/pm/tables"
import {
  ArrowDownToLineIcon,
  ArrowLeftToLineIcon,
  ArrowRightToLineIcon,
  ArrowUpToLineIcon,
  Columns3Icon,
  CombineIcon,
  Heading1Icon,
  Rows3Icon,
  SplitIcon,
  Trash2Icon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

interface WikiEditorTableMenuProps {
  editor: Editor | null
}

export function WikiEditorTableMenu({ editor }: WikiEditorTableMenuProps) {
  if (!editor) return null

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8 }}
      // Only surface for a CellSelection — the user dragged across cells or
      // clicked the table's node handle. A plain caret inside a cell means
      // they are typing; the menu used to pop up over the row above on
      // every click and shadow the text, so structural actions for that case
      // live in the right-click menu (wiki-editor-table-context-menu) instead.
      shouldShow={({ editor, state }) => {
        if (!editor.isEditable) return false
        return state.selection instanceof CellSelection
      }}
      className="flex items-center gap-0.5 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
    >
      <TableMenuButton
        icon={ArrowUpToLineIcon}
        tooltip="Add row above"
        onClick={() => editor.chain().focus().addRowBefore().run()}
      />
      <TableMenuButton
        icon={ArrowDownToLineIcon}
        tooltip="Add row below"
        onClick={() => editor.chain().focus().addRowAfter().run()}
      />
      <TableMenuButton
        icon={Rows3Icon}
        tooltip="Delete row"
        destructive
        onClick={() => editor.chain().focus().deleteRow().run()}
      />
      <div className="mx-0.5 h-4 w-px bg-foreground/10" aria-hidden />
      <TableMenuButton
        icon={ArrowLeftToLineIcon}
        tooltip="Add column left"
        onClick={() => editor.chain().focus().addColumnBefore().run()}
      />
      <TableMenuButton
        icon={ArrowRightToLineIcon}
        tooltip="Add column right"
        onClick={() => editor.chain().focus().addColumnAfter().run()}
      />
      <TableMenuButton
        icon={Columns3Icon}
        tooltip="Delete column"
        destructive
        onClick={() => editor.chain().focus().deleteColumn().run()}
      />
      <div className="mx-0.5 h-4 w-px bg-foreground/10" aria-hidden />
      <TableMenuButton
        icon={CombineIcon}
        tooltip="Merge cells"
        disabled={!editor.can().mergeCells()}
        onClick={() => editor.chain().focus().mergeCells().run()}
      />
      <TableMenuButton
        icon={SplitIcon}
        tooltip="Split cell"
        disabled={!editor.can().splitCell()}
        onClick={() => editor.chain().focus().splitCell().run()}
      />
      <div className="mx-0.5 h-4 w-px bg-foreground/10" aria-hidden />
      <TableMenuButton
        icon={Heading1Icon}
        tooltip="Toggle header row"
        onClick={() => editor.chain().focus().toggleHeaderRow().run()}
      />
      <TableMenuButton
        icon={Trash2Icon}
        tooltip="Delete table"
        destructive
        onClick={() => editor.chain().focus().deleteTable().run()}
      />
    </BubbleMenu>
  )
}

function TableMenuButton({
  icon: Icon,
  tooltip,
  active,
  destructive,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  tooltip: string
  active?: boolean
  destructive?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={active ? "secondary" : "ghost"}
            size="icon-xs"
            disabled={disabled}
            className={destructive ? "text-destructive hover:text-destructive" : undefined}
            onMouseDown={(e) => {
              e.preventDefault()
              if (!disabled) onClick()
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
