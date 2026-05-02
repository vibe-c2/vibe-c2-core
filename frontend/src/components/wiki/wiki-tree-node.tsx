import { useState } from "react"
import { useNavigate, useParams } from "react-router"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import {
  ArrowDownAZIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  EllipsisIcon,
  FilePlusIcon,
  FolderInputIcon,
  PencilIcon,
  PlusIcon,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Input } from "@/components/ui/input"
import { useWikiStore } from "@/stores/wiki"
import { useUpdateWikiDocument } from "@/graphql/hooks/wiki"
import { EmojiPicker } from "@/components/wiki/emoji-picker"
import { cn } from "@/lib/utils"
import { collectBranchIdsWithChildren } from "@/components/wiki/wiki-tree-helpers"
import type { DropTarget, TreeNode } from "@/components/wiki/wiki-tree-sidebar"

interface WikiTreeNodeProps {
  node: TreeNode
  depth: number
  isEditor: boolean
  operationId: string
  activeId: string | null
  dropTarget: DropTarget | null
}

export function WikiTreeNode({
  node,
  depth,
  isEditor,
  operationId,
  activeId,
  dropTarget,
}: WikiTreeNodeProps) {
  const navigate = useNavigate()
  const { documentId: selectedDocumentId } = useParams<{ documentId: string }>()
  const isSelected = selectedDocumentId === node.id

  const expandedNodes = useWikiStore((s) => s.expandedNodes)
  const toggleNode = useWikiStore((s) => s.toggleNode)
  const expandMany = useWikiStore((s) => s.expandMany)
  const collapseMany = useWikiStore((s) => s.collapseMany)
  const openCreateDialog = useWikiStore((s) => s.openCreateDialog)
  const openMoveDialog = useWikiStore((s) => s.openMoveDialog)
  const openDeleteDialog = useWikiStore((s) => s.openDeleteDialog)
  const openContentSearch = useWikiStore((s) => s.openContentSearch)

  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(node.title)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const updateDocument = useUpdateWikiDocument()

  const isExpanded = expandedNodes.has(node.id)
  const hasChildren = node.children.length > 0

  // DnD: each node is both draggable (via handle) and a drop target.
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({ id: node.id })
  const { setNodeRef: setDropRef } = useDroppable({ id: node.id })

  const isDragging = activeId === node.id
  const isDropInside = dropTarget?.id === node.id && dropTarget.position === "inside"
  const isDropBefore = dropTarget?.id === node.id && dropTarget.position === "before"
  const isDropAfter = dropTarget?.id === node.id && dropTarget.position === "after"

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

  const indent = depth * 16 + 4

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={() => toggleNode(node.id)}
      className={cn(isDragging && "opacity-50")}
    >
      {/* Drop-before divider */}
      {isDropBefore && (
        <div style={{ paddingLeft: indent }} className="px-1">
          <div className="h-0.5 rounded-full bg-primary" />
        </div>
      )}

      <div
        ref={(el) => {
          setDropRef(el)
          if (isEditor) setDragRef(el)
        }}
        {...(isEditor ? attributes : {})}
        {...(isEditor ? listeners : {})}
        style={{ paddingLeft: indent }}
        className={cn(
          "group flex h-7 items-center gap-0.5 rounded-md px-1 text-sm",
          isEditor && "cursor-grab active:cursor-grabbing",
          isDropInside && "bg-primary/10 ring-1 ring-primary",
          !isDropInside && isSelected && "bg-accent text-accent-foreground",
          !isDropInside && !isSelected && "hover:bg-muted",
        )}
      >
        {/* Chevron/emoji shared slot: emoji by default, chevron on hover.
            Leaves render just the emoji (no trigger). */}
        {hasChildren ? (
          <CollapsibleTrigger
            render={
              <button
                className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-muted-foreground/10"
                aria-label={isExpanded ? "Collapse" : "Expand"}
              />
            }
          >
            <span className="text-sm group-hover:hidden">
              {node.emoji || "\u{1F4C4}"}
            </span>
            <ChevronRightIcon
              className={cn(
                "hidden size-3.5 transition-transform group-hover:block",
                isExpanded && "rotate-90",
              )}
            />
          </CollapsibleTrigger>
        ) : (
          <span className="flex size-5 shrink-0 items-center justify-center text-sm">
            {node.emoji || "\u{1F4C4}"}
          </span>
        )}

        {/* Emoji picker: opened via context menu, anchored to the row */}
        {emojiPickerOpen && (
          <EmojiPicker
            emoji={node.emoji}
            onSelect={handleEmojiSelect}
            open={emojiPickerOpen}
            onOpenChange={setEmojiPickerOpen}
          />
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
            className="flex h-full flex-1 items-center truncate px-1 text-left text-sm"
            onClick={() => navigate(`/wiki/${node.id}`)}
          >
            {node.title}
          </button>
        )}

        {/* Quick actions */}
        {hasChildren && (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 hidden group-hover:inline-flex"
                    onClick={(e) => {
                      e.stopPropagation()
                      expandMany(collectBranchIdsWithChildren([node], true))
                    }}
                  />
                }
              >
                <ChevronsUpDownIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>Expand subtree</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0 hidden group-hover:inline-flex"
                    onClick={(e) => {
                      e.stopPropagation()
                      collapseMany(collectBranchIdsWithChildren([node], true))
                    }}
                  />
                }
              >
                <ChevronsDownUpIcon className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>Collapse subtree</TooltipContent>
            </Tooltip>
          </>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="shrink-0 hidden group-hover:inline-flex"
                onClick={() => openContentSearch(node.id, node.title)}
              />
            }
          >
            <SearchIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>Search in {node.title}</TooltipContent>
        </Tooltip>
        {isEditor && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 hidden group-hover:inline-flex"
                  onClick={() => openCreateDialog(node.id)}
                />
              }
            >
              <PlusIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>New child document</TooltipContent>
          </Tooltip>
        )}

        {/* Context menu */}
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className={cn(
                  "shrink-0",
                  menuOpen ? "inline-flex" : "hidden group-hover:inline-flex",
                )}
              />
            }
          >
            <EllipsisIcon className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-48">
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
            {isEditor && (
              <DropdownMenuItem
                onClick={() =>
                  openMoveDialog({ id: node.id, title: node.title })
                }
              >
                <FolderInputIcon className="mr-2 size-4" />
                Move to
              </DropdownMenuItem>
            )}
            {isEditor && hasChildren && (
              <DropdownMenuItem
                onClick={() => {
                  const sorted = [...node.children].sort((a, b) =>
                    a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
                  )
                  const count = sorted.length
                  for (let i = 0; i < count; i++) {
                    const newSort = String.fromCharCode(65 + Math.floor(((i + 1) / (count + 1)) * 57))
                    if (sorted[i].sortOrder !== newSort) {
                      updateDocument.mutate({ id: sorted[i].id, input: { sortOrder: newSort } })
                    }
                  }
                }}
              >
                <ArrowDownAZIcon className="mr-2 size-4" />
                Sort
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

      {/* Drop-after divider */}
      {isDropAfter && (
        <div style={{ paddingLeft: indent }} className="px-1">
          <div className="h-0.5 rounded-full bg-primary" />
        </div>
      )}

      {/* Children */}
      {hasChildren && (
        <CollapsibleContent>
          {node.children.map((child) => (
            <WikiTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              isEditor={isEditor}
              operationId={operationId}
              activeId={activeId}
              dropTarget={dropTarget}
            />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}
