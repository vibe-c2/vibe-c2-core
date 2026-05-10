import { useMemo } from "react"
import {
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  DownloadIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useWikiStore } from "@/stores/wiki"
import { useWikiDragStore, type DropPosition, type DropTarget } from "@/stores/wiki-drag"
import { useWikiDocumentTrash, useUpdateWikiDocument } from "@/graphql/hooks/wiki"
import { WikiTreeNode } from "@/components/wiki/wiki-tree-node"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { WikiHistoryDropdown } from "@/components/wiki/wiki-history-dropdown"
import { collectBranchIdsWithChildren } from "@/components/wiki/wiki-tree-helpers"
import type { WikiDocumentTreeFieldsFragment } from "@/graphql/gql/graphql"

export interface TreeNode {
  id: string
  title: string
  emoji: string
  icon: string
  color: string
  sortOrder: string
  parentId: string | null
  childCount: number
  children: TreeNode[]
}

/** Build a recursive tree from the flat document list. */
function buildTree(docs: readonly WikiDocumentTreeFieldsFragment[]): TreeNode[] {
  const childrenMap = new Map<string | null, WikiDocumentTreeFieldsFragment[]>()
  for (const doc of docs) {
    const parentId = doc.parentDocument?.id ?? null
    const group = childrenMap.get(parentId) ?? []
    group.push(doc)
    childrenMap.set(parentId, group)
  }

  function build(parentId: string | null): TreeNode[] {
    const group = childrenMap.get(parentId) ?? []
    return group
      .sort((a, b) => a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0)
      .map((doc) => ({
        id: doc.id,
        title: doc.title,
        emoji: doc.emoji,
        icon: doc.icon,
        color: doc.color,
        sortOrder: doc.sortOrder,
        parentId: doc.parentDocument?.id ?? null,
        childCount: doc.childCount,
        children: build(doc.id),
      }))
  }

  return build(null)
}

/**
 * Compute a sort string between two adjacent strings.
 * Uses simple midpoint character approach for fractional indexing.
 */
function midSortOrder(before: string | null, after: string | null): string {
  const a = before ?? ""
  const b = after ?? ""
  // Simple approach: average the first differing character position
  const maxLen = Math.max(a.length, b.length) + 1
  let result = ""
  for (let i = 0; i < maxLen; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 64 // '@' — below 'A'
    const cb = i < b.length ? b.charCodeAt(i) : 123 // '{' — above 'z'
    const mid = Math.floor((ca + cb) / 2)
    if (mid > ca) {
      result += String.fromCharCode(mid)
      return result
    }
    result += String.fromCharCode(ca)
  }
  return result + "V" // fallback: append midpoint char
}

/** Collect a document's ID and all its descendant IDs (BFS). */
function collectDescendantIds(
  docId: string,
  docs: readonly WikiDocumentTreeFieldsFragment[],
): Set<string> {
  const ids = new Set<string>([docId])
  const queue = [docId]
  while (queue.length > 0) {
    const current = queue.pop()!
    for (const doc of docs) {
      if (doc.parentDocument?.id === current && !ids.has(doc.id)) {
        ids.add(doc.id)
        queue.push(doc.id)
      }
    }
  }
  return ids
}

interface WikiTreeSidebarProps {
  operationId: string
  isEditor: boolean
  documents: readonly WikiDocumentTreeFieldsFragment[]
  isLoading?: boolean
  // Forwarded to the wrapper div so ResizeHandle can imperatively mutate
  // `--wiki-sidebar-width` during a drag without going through React.
  ref?: React.Ref<HTMLDivElement>
}

export function WikiTreeSidebar({
  operationId,
  isEditor,
  documents,
  isLoading,
  ref,
}: WikiTreeSidebarProps) {
  const sidebarWidth = useWikiStore((s) => s.sidebarWidth)
  const openCreateDialog = useWikiStore((s) => s.openCreateDialog)
  const openImportOutlineDialog = useWikiStore((s) => s.openImportOutlineDialog)
  const openTrashPanel = useWikiStore((s) => s.openTrashPanel)
  const openContentSearch = useWikiStore((s) => s.openContentSearch)
  // Note: we deliberately do NOT subscribe to `expandedNodes` here. The
  // header's "Collapse all" button reads it lazily via `getState()` at
  // click time, so the sidebar doesn't re-render every time someone
  // expands or collapses a row.
  const expandMany = useWikiStore((s) => s.expandMany)
  const collapseMany = useWikiStore((s) => s.collapseMany)

  // Trash count for badge.
  const { data: trashData } = useWikiDocumentTrash(operationId)
  const trashCount = trashData?.pages[0]?.wikiDocumentTrash.totalCount ?? 0

  // Build tree from flat documents. Title-substring filtering used to live
  // here; it's now replaced by the Cmd+K command palette which searches
  // title + content via the backend text index with ranked snippets.
  const tree = useMemo(() => buildTree(documents), [documents])

  // DnD sensors with activation distance to distinguish click from drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const updateDocument = useUpdateWikiDocument()

  // DnD state lives in a separate store (`useWikiDragStore`) so per-row
  // highlight changes don't re-render the whole sidebar. We subscribe to
  // `activeId` here only because the overlay + the dragged-node descendant
  // exclusion both need it (both change once at drag start/end, not per
  // hover tick). `dropTarget` is intentionally NOT subscribed — handlers
  // read it via `getState()`.
  const activeId = useWikiDragStore((s) => s.activeId)

  // Descendants of the dragged node — cannot drop onto these.
  const excludedIds = useMemo(
    () => (activeId ? collectDescendantIds(activeId, documents) : new Set<string>()),
    [activeId, documents],
  )

  // Root drop zone so items can be dropped to top level.
  const { setNodeRef: setRootDropRef } = useDroppable({ id: "root" })

  // Find the active document for the drag overlay.
  const activeDoc = activeId ? documents.find((d) => d.id === activeId) : null

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string
    useWikiDragStore.getState().setActiveId(id)
  }

  function handleDragMove(event: DragMoveEvent) {
    const dragStore = useWikiDragStore.getState()
    const over = event.over
    if (!over) {
      if (dragStore.dropTarget) dragStore.setDropTarget(null)
      return
    }

    const id = over.id as string
    if (excludedIds.has(id)) {
      if (dragStore.dropTarget) dragStore.setDropTarget(null)
      return
    }

    // For root, always "inside".
    let position: DropPosition = "inside"
    if (id !== "root") {
      // Compute pointer Y relative to the hovered node's rect.
      const startEvent = event.activatorEvent as PointerEvent
      const pointerY = startEvent.clientY + event.delta.y
      const rect = over.rect
      const fraction = (pointerY - rect.top) / rect.height
      if (fraction < 0.25) position = "before"
      else if (fraction > 0.75) position = "after"
    }

    // Only update state when target actually changes.
    const prev = dragStore.dropTarget
    if (!prev || prev.id !== id || prev.position !== position) {
      const next: DropTarget = { id, position }
      dragStore.setDropTarget(next)
    }
  }

  function handleDragEnd() {
    // Read from store directly — avoids capturing stale closures.
    const dragStore = useWikiDragStore.getState()
    const draggedId = dragStore.activeId
    const target = dragStore.dropTarget

    // Reset drag state immediately so the overlay disappears.
    dragStore.reset()

    if (!draggedId || !target) return

    // "After" an expanded node with children = visually "before its first child".
    let resolvedTarget = target
    if (target.position === "after" && target.id !== "root") {
      const { expandedNodes } = useWikiStore.getState()
      if (expandedNodes.has(target.id)) {
        const firstChild = documents.find((d) => d.parentDocument?.id === target.id)
        if (firstChild) {
          resolvedTarget = { id: firstChild.id, position: "before" }
        }
      }
    }

    if (resolvedTarget.position === "inside") {
      // Reparent: make it the last child of the target node.
      const newParentId = resolvedTarget.id === "root" ? "" : resolvedTarget.id
      const parentIdForSiblings = resolvedTarget.id === "root" ? null : resolvedTarget.id
      const siblings = documents
        .filter((d) => (d.parentDocument?.id ?? null) === parentIdForSiblings && d.id !== draggedId)
        .sort((a, b) => a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0)
      const lastSort = siblings.length > 0 ? siblings[siblings.length - 1].sortOrder : null

      updateDocument.mutate({
        id: draggedId,
        input: {
          parentDocumentId: newParentId,
          sortOrder: midSortOrder(lastSort, null),
        },
      })
    } else {
      // Reorder: insert before/after the target among its siblings.
      const overDoc = documents.find((d) => d.id === resolvedTarget.id)
      if (!overDoc) return

      const parentId = overDoc.parentDocument?.id ?? ""
      const parentIdForFilter = overDoc.parentDocument?.id ?? null

      // Build current sibling order (INCLUDING dragged node).
      const allSiblings = documents
        .filter((d) => (d.parentDocument?.id ?? null) === parentIdForFilter)
        .sort((a, b) => a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0)

      // Remove dragged node and insert at the target position.
      const withoutDragged = allSiblings.filter((d) => d.id !== draggedId)
      const insertAt = resolvedTarget.position === "before"
        ? withoutDragged.findIndex((d) => d.id === resolvedTarget.id)
        : withoutDragged.findIndex((d) => d.id === resolvedTarget.id) + 1
      const reordered = [...withoutDragged]
      const draggedDoc = documents.find((d) => d.id === draggedId)!
      reordered.splice(insertAt, 0, draggedDoc)

      // Assign evenly spaced sort orders to the entire list.
      const count = reordered.length
      for (let i = 0; i < count; i++) {
        const fraction = (i + 1) / (count + 1)
        const newSort = String.fromCharCode(65 + Math.floor(fraction * 57))
        if (reordered[i].sortOrder !== newSort) {
          updateDocument.mutate({
            id: reordered[i].id,
            input: {
              ...(reordered[i].id === draggedId ? { parentDocumentId: parentId } : {}),
              sortOrder: newSort,
            },
          })
        }
      }
    }
  }

  function handleDragCancel() {
    useWikiDragStore.getState().reset()
  }

  return (
    <div
      ref={ref}
      // Width is driven via a CSS custom property so ResizeHandle can update
      // it in pure DOM during a drag (no React re-render). React still owns
      // the value at rest — when `sidebarWidth` changes via the store
      // (mouseup commit, hydration), the inline style re-applies the
      // variable. Mid-drag re-renders for unrelated state changes are safe:
      // React diffs the style prop and skips writing when the prop value
      // (the store width) hasn't changed, so the imperatively-set value
      // survives.
      style={{
        width: "var(--wiki-sidebar-width)",
        ["--wiki-sidebar-width" as string]: `${sidebarWidth}px`,
      } as React.CSSProperties}
      className="flex shrink-0 flex-col rounded-lg border bg-card overflow-hidden"
    >
      {/* Header */}
      <div className="flex h-10 items-center gap-1 border-b px-2">
        <span className="flex-1 truncate px-1 text-sm font-medium">Wiki</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() =>
                  expandMany(collectBranchIdsWithChildren(tree, true))
                }
              />
            }
          >
            <ChevronsUpDownIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>Expand all</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() =>
                  collapseMany([...useWikiStore.getState().expandedNodes])
                }
              />
            }
          >
            <ChevronsDownUpIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>Collapse all</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => openContentSearch(null, "All Documents")}
              />
            }
          >
            <SearchIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>Search documents</TooltipContent>
        </Tooltip>
        <WikiHistoryDropdown operationId={operationId} />
        {isEditor && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => openCreateDialog()}
                />
              }
            >
              <PlusIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>New document</TooltipContent>
          </Tooltip>
        )}
        {isEditor && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={openImportOutlineDialog}
                />
              }
            >
              <DownloadIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Import markdown</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={openTrashPanel}
                className="relative"
              />
            }
          >
            <Trash2Icon className="size-3.5" />
            {trashCount > 0 && (
              <Badge
                variant="destructive"
                className="absolute -right-1 -top-1 size-4 justify-center p-0 text-[10px]"
              >
                {trashCount > 99 ? "99+" : trashCount}
              </Badge>
            )}
          </TooltipTrigger>
          <TooltipContent>Trash</TooltipContent>
        </Tooltip>
      </div>

      {/* Tree body */}
      <div ref={setRootDropRef} className="flex-1 overflow-y-auto px-1 py-1">
        {isLoading ? (
          <div className="flex flex-col gap-1 px-1">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-7 rounded" />
            ))}
          </div>
        ) : tree.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            No documents yet
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragMove={handleDragMove}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            {tree.map((node) => (
              <WikiTreeNode
                key={node.id}
                node={node}
                depth={0}
                isEditor={isEditor}
                operationId={operationId}
              />
            ))}
            <DragOverlay dropAnimation={null}>
              {activeDoc && (
                <div className="flex items-center gap-1.5 rounded-md bg-popover px-2 py-1 text-sm shadow-md">
                  <DocumentIcon
                    emoji={activeDoc.emoji}
                    icon={activeDoc.icon}
                    color={activeDoc.color}
                  />
                  <span className="truncate">{activeDoc.title}</span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  )
}
