import { useState } from "react"
import { useNavigate, useParams } from "react-router"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  ChevronRightIcon,
  EllipsisIcon,
  FilePlusIcon,
  GripVerticalIcon,
  PencilIcon,
  SearchIcon,
  SmileIcon,
  Trash2Icon,
} from "lucide-react"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useWikiStore } from "@/stores/wiki"
import { useUpdateWikiDocument } from "@/graphql/hooks/wiki"
import { EmojiPicker } from "@/components/wiki/emoji-picker"
import { cn } from "@/lib/utils"
import type { TreeNode } from "@/components/wiki/wiki-tree-sidebar"

interface WikiTreeNodeProps {
  node: TreeNode
  depth: number
  isEditor: boolean
  visibleIds: Set<string> | null
  operationId: string
}

export function WikiTreeNode({
  node,
  depth,
  isEditor,
  visibleIds,
  operationId,
}: WikiTreeNodeProps) {
  const navigate = useNavigate()
  const { documentId: selectedDocumentId } = useParams<{ documentId: string }>()
  const isSelected = selectedDocumentId === node.id

  const expandedNodes = useWikiStore((s) => s.expandedNodes)
  const toggleNode = useWikiStore((s) => s.toggleNode)
  const openCreateDialog = useWikiStore((s) => s.openCreateDialog)
  const openDeleteDialog = useWikiStore((s) => s.openDeleteDialog)
  const openContentSearch = useWikiStore((s) => s.openContentSearch)

  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(node.title)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)

  const updateDocument = useUpdateWikiDocument()

  // Skip filtered-out nodes.
  if (visibleIds && !visibleIds.has(node.id)) return null

  const isExpanded = expandedNodes.has(node.id)
  const hasChildren = node.children.length > 0

  // DnD sortable hook.
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  function handleRenameSubmit() {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== node.title && trimmed.length <= 200) {
      updateDocument.mutate({ id: node.id, input: { title: trimmed } })
    } else {
      setRenameValue(node.title)
    }
    setRenaming(false)
  }

  function handleEmojiSelect(emoji: string) {
    updateDocument.mutate({ id: node.id, input: { emoji } })
    setEmojiPickerOpen(false)
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={() => toggleNode(node.id)}>
      <div
        ref={setNodeRef}
        style={{ ...style, paddingLeft: depth * 16 + 4 }}
        className={cn(
          "group flex items-center gap-0.5 rounded-md px-1 py-0.5 text-sm",
          isSelected && "bg-accent text-accent-foreground",
          !isSelected && "hover:bg-muted",
        )}
      >
        {/* Drag handle */}
        {isEditor && (
          <span
            {...attributes}
            {...listeners}
            className="cursor-grab opacity-0 group-hover:opacity-60"
          >
            <GripVerticalIcon className="size-3.5" />
          </span>
        )}

        {/* Expand/collapse chevron */}
        <CollapsibleTrigger
          render={
            <button className="flex size-5 items-center justify-center rounded hover:bg-muted-foreground/10" />
          }
        >
          {hasChildren ? (
            <ChevronRightIcon
              className={cn(
                "size-3.5 transition-transform",
                isExpanded && "rotate-90",
              )}
            />
          ) : (
            <span className="size-3.5" />
          )}
        </CollapsibleTrigger>

        {/* Emoji */}
        {emojiPickerOpen ? (
          <EmojiPicker
            emoji={node.emoji}
            onSelect={handleEmojiSelect}
            open={emojiPickerOpen}
            onOpenChange={setEmojiPickerOpen}
          />
        ) : (
          <span className="shrink-0 text-sm">{node.emoji || "\u{1F4C4}"}</span>
        )}

        {/* Title */}
        {renaming ? (
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleRenameSubmit()
              if (e.key === "Escape") {
                setRenameValue(node.title)
                setRenaming(false)
              }
            }}
            className="h-5 flex-1 border-none bg-transparent px-1 py-0 text-sm shadow-none focus-visible:ring-0"
          />
        ) : (
          <button
            className="flex-1 truncate px-1 text-left text-sm"
            onClick={() => navigate(`/wiki/${node.id}`)}
          >
            {node.title}
          </button>
        )}

        {/* Context menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0 opacity-0 group-hover:opacity-100"
              />
            }
          >
            <EllipsisIcon className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {isEditor && (
              <DropdownMenuItem onClick={() => openCreateDialog(node.id)}>
                <FilePlusIcon className="mr-2 size-4" />
                New child document
              </DropdownMenuItem>
            )}
            {isEditor && (
              <DropdownMenuItem
                onClick={() => {
                  setRenameValue(node.title)
                  setRenaming(true)
                }}
              >
                <PencilIcon className="mr-2 size-4" />
                Rename
              </DropdownMenuItem>
            )}
            {isEditor && (
              <DropdownMenuItem onClick={() => setEmojiPickerOpen(true)}>
                <SmileIcon className="mr-2 size-4" />
                Change emoji
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => openContentSearch(node.id, node.title)}
            >
              <SearchIcon className="mr-2 size-4" />
              Search in {node.title}...
            </DropdownMenuItem>
            {isEditor && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() =>
                    openDeleteDialog({ id: node.id, title: node.title })
                  }
                >
                  <Trash2Icon className="mr-2 size-4" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Children */}
      {hasChildren && (
        <CollapsibleContent>
          {node.children.map((child) => (
            <WikiTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              isEditor={isEditor}
              visibleIds={visibleIds}
              operationId={operationId}
            />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}
