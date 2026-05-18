import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router"
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
import { Skeleton } from "@/components/ui/skeleton"
import { useWikiStore } from "@/stores/wiki"
import { useWikiDragStore } from "@/stores/wiki-drag"
import {
  useUpdateWikiDocument,
  useWikiDocumentChildren,
} from "@/graphql/hooks/wiki"
import {
  DocumentIconPicker,
  type DocumentIconValue,
} from "@/components/wiki/document-icon-picker"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { cn } from "@/lib/utils"
import {
  collectBranchIdsWithChildren,
  rowToTreeNode,
  sortByOrder,
} from "@/components/wiki/wiki-tree-helpers"
import type { TreeNode } from "@/components/wiki/wiki-tree-sidebar"

interface WikiTreeNodeProps {
  node: TreeNode
  depth: number
  isEditor: boolean
  operationId: string
}

function WikiTreeNodeImpl({
  node,
  depth,
  isEditor,
  operationId,
}: WikiTreeNodeProps) {
  const { documentId: selectedDocumentId } = useParams<{ documentId: string }>()
  const isSelected = selectedDocumentId === node.id

  // Subscribe to a *boolean* (not the Set itself) so this row only
  // re-renders when its own expansion flips. Reading `s.expandedNodes`
  // would hand back a new Set reference on every toggle/expandMany call
  // and re-render every visible row.
  const isExpanded = useWikiStore((s) => s.expandedNodes.has(node.id))
  const toggleNode = useWikiStore((s) => s.toggleNode)

  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(node.title)
  const [iconPickerOpen, setIconPickerOpen] = useState(false)

  const updateDocument = useUpdateWikiDocument()

  // childCount carries the "are there children?" signal directly from the
  // server — we don't have to load the children to know whether the caret
  // should show. children.length is the *loaded* count (used for sort
  // operations on the already-fetched subtree).
  const hasChildren = node.childCount > 0

  // Lazy children fetch: only fires when expanded. Once loaded, cached
  // forever (staleTime: Infinity) — SSE invalidates per-parent on mutations.
  const { data: childrenData, isLoading: isLoadingChildren } =
    useWikiDocumentChildren(operationId, node.id, {
      enabled: hasChildren && isExpanded,
    })
  const childRows = useMemo(
    () => sortByOrder(childrenData?.wikiDocumentChildren ?? []),
    [childrenData?.wikiDocumentChildren],
  )

  // DnD: each node is both draggable (via handle) and a drop target.
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({ id: node.id })
  const { setNodeRef: setDropRef } = useDroppable({ id: node.id })

  // When the row becomes the selected document — usually because the user
  // navigated from search or pasted a deep link — bring it into view. The
  // page-level effect already expanded the ancestors by the time this fires.
  const rowRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (isSelected) {
      rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
  }, [isSelected])

  // Per-row drag subscriptions: each selector returns a primitive (boolean
  // or string|null), so zustand's default Object.is equality means a row
  // only re-renders when *its own* drag state flips. Without this, the
  // sidebar's setState on every hover tick used to re-render every row.
  const isDragging = useWikiDragStore((s) => s.activeId === node.id)
  const dropPosition = useWikiDragStore((s) =>
    s.dropTarget?.id === node.id ? s.dropTarget.position : null,
  )
  const isDropInside = dropPosition === "inside"
  const isDropBefore = dropPosition === "before"
  const isDropAfter = dropPosition === "after"

  function handleRenameSubmit() {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== node.title && trimmed.length <= 200) {
      updateDocument.mutate({ id: node.id, input: { title: trimmed } })
    } else {
      setRenameValue(node.title)
    }
    setRenaming(false)
  }

  function handleIconSelect(next: DocumentIconValue) {
    updateDocument.mutate({
      id: node.id,
      input: { emoji: next.emoji, icon: next.icon, color: next.color },
    })
    setIconPickerOpen(false)
  }

  // Stable callbacks handed to the memoized quick-actions subcomponent.
  // `useCallback` deps include `node.title` only because the rename UI
  // needs to seed its input with the current title — title rarely changes,
  // so the actions block's memo stays valid across drag/expand re-renders.
  const handleStartRename = useCallback(() => {
    setRenameValue(node.title)
    setRenaming(true)
  }, [node.title])
  const handleStartIconPicker = useCallback(() => {
    setIconPickerOpen(true)
  }, [])

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
          rowRef.current = el
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
            <span className="flex size-5 items-center justify-center text-sm group-hover:hidden">
              <DocumentIcon
                emoji={node.emoji}
                icon={node.icon}
                color={node.color}
              />
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
            <DocumentIcon
              emoji={node.emoji}
              icon={node.icon}
              color={node.color}
            />
          </span>
        )}

        {/* Icon picker: opened via context menu, anchored to the row */}
        {iconPickerOpen && (
          <DocumentIconPicker
            value={{ emoji: node.emoji, icon: node.icon, color: node.color }}
            onSelect={handleIconSelect}
            open={iconPickerOpen}
            onOpenChange={setIconPickerOpen}
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
          <Link
            to={`/wiki/${node.id}`}
            // draggable=false prevents the browser's native HTML5 link drag
            // (which would let the user drag the URL as text); dnd-kit uses
            // pointer events on the row, so this doesn't disable reordering.
            draggable={false}
            className="flex h-full flex-1 items-center truncate px-1 text-left text-sm"
          >
            {node.title}
          </Link>
        )}

        {/* Quick actions + context menu — extracted so this expensive subtree
            (5 Tooltips + a DropdownMenu + buttons, ~6–8ms per row render)
            bails out via memo when the row re-renders for unrelated reasons
            (drag highlight flips, dnd-kit measurement passes, expansion
            cascades). The profile showed this block dominated spike-commit
            time; memoizing it here is the highest-leverage win. */}
        <WikiTreeRowQuickActions
          node={node}
          operationId={operationId}
          isEditor={isEditor}
          onStartRename={handleStartRename}
          onStartIconPicker={handleStartIconPicker}
        />
      </div>

      {/* Drop-after divider */}
      {isDropAfter && (
        <div style={{ paddingLeft: indent }} className="px-1">
          <div className="h-0.5 rounded-full bg-primary" />
        </div>
      )}

      {/* Children — lazy: only mounted when expanded; the hook above gates
          the fetch on the same condition so collapsed branches cost nothing. */}
      {hasChildren && (
        <CollapsibleContent>
          {isLoadingChildren ? (
            <div style={{ paddingLeft: (depth + 1) * 16 + 4 }} className="py-1">
              <Skeleton className="h-5 rounded" />
            </div>
          ) : (
            childRows.map((row) => (
              <WikiTreeNode
                key={row.id}
                node={rowToTreeNode(row)}
                depth={depth + 1}
                isEditor={isEditor}
                operationId={operationId}
              />
            ))
          )}
        </CollapsibleContent>
      )}
    </Collapsible>
  )
}

// Memoized so an unrelated parent re-render (sidebar resize, hover tick on
// a sibling row) skips this row's render entirely. Drag highlights and
// expansion are read via store subscriptions, so memo's shallow prop
// compare is sufficient.
export const WikiTreeNode = memo(WikiTreeNodeImpl)

interface WikiTreeRowQuickActionsProps {
  node: TreeNode
  operationId: string
  isEditor: boolean
  onStartRename: () => void
  onStartIconPicker: () => void
}

function WikiTreeRowQuickActionsImpl({
  node,
  operationId,
  isEditor,
  onStartRename,
  onStartIconPicker,
}: WikiTreeRowQuickActionsProps) {
  const expandMany = useWikiStore((s) => s.expandMany)
  const collapseMany = useWikiStore((s) => s.collapseMany)
  const openCreateDialog = useWikiStore((s) => s.openCreateDialog)
  const openMoveDialog = useWikiStore((s) => s.openMoveDialog)
  const openDeleteDialog = useWikiStore((s) => s.openDeleteDialog)
  const openContentSearch = useWikiStore((s) => s.openContentSearch)
  const updateDocument = useUpdateWikiDocument()

  // Menu-open state is local to this subtree — no reason to live in the
  // parent row, where it would force the row (and its dnd hooks) to
  // re-render whenever the menu opens or closes.
  const [menuOpen, setMenuOpen] = useState(false)

  // childCount is the canonical "has any children?" signal (cheap, comes
  // from the server). The "Sort" and "Expand subtree" buttons that operate
  // on already-loaded children read from the per-parent cache directly —
  // they implicitly skip unloaded branches.
  const hasChildren = node.childCount > 0
  // Cached children for this node, if its branch was ever expanded. Used by
  // the "Sort" action; we don't trigger a fetch from here, so unloaded
  // branches show no Sort row (acceptable — the user only sorts what they
  // can see).
  const { data: cachedChildren } = useWikiDocumentChildren(
    operationId,
    node.id,
    { enabled: false },
  )
  const loadedChildren = cachedChildren?.wikiDocumentChildren ?? []

  return (
    <>
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
                    // Lazy tree: we only know what's loaded. Expanding the
                    // node itself triggers its children fetch; descendants
                    // expand naturally as the user walks deeper. For already
                    // loaded subtrees we expand everything we have.
                    const ids = collectBranchIdsWithChildren(
                      [{ ...node, children: loadedChildren.map(rowToTreeNode) }],
                      true,
                    )
                    expandMany(ids)
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
                    const ids = collectBranchIdsWithChildren(
                      [{ ...node, children: loadedChildren.map(rowToTreeNode) }],
                      true,
                    )
                    collapseMany(ids)
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
            <DropdownMenuItem onClick={onStartRename}>
              <PencilIcon className="mr-2 size-4" />
              Rename
            </DropdownMenuItem>
          )}
          {isEditor && (
            <DropdownMenuItem onClick={onStartIconPicker}>
              <SmileIcon className="mr-2 size-4" />
              Change icon
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
          {isEditor && hasChildren && loadedChildren.length > 0 && (
            <DropdownMenuItem
              onClick={() => {
                const sorted = [...loadedChildren].sort((a, b) =>
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
    </>
  )
}

const WikiTreeRowQuickActions = memo(WikiTreeRowQuickActionsImpl)
