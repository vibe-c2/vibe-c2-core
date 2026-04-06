import { useMemo, useRef, useState } from "react"
import { PlusIcon, SearchIcon, Trash2Icon } from "lucide-react"
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
import { SearchInput } from "@/components/ui/search-input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useWikiStore } from "@/stores/wiki"
import { useWikiDocumentTrash, useUpdateWikiDocument } from "@/graphql/hooks/wiki"
import { WikiTreeNode } from "@/components/wiki/wiki-tree-node"
import type { WikiDocumentTreeFieldsFragment } from "@/graphql/gql/graphql"

export type DropPosition = "before" | "inside" | "after"

export interface DropTarget {
  id: string
  position: DropPosition
}

export interface TreeNode {
  id: string
  title: string
  emoji: string
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
        sortOrder: doc.sortOrder,
        parentId: doc.parentDocument?.id ?? null,
        childCount: doc.childCount,
        children: build(doc.id),
      }))
  }

  return build(null)
}

/** Collect IDs of matching nodes and all their ancestors. */
function filterTree(tree: TreeNode[], query: string): Set<string> {
  const visible = new Set<string>()
  const lower = query.toLowerCase()

  function walk(nodes: TreeNode[], ancestors: string[]) {
    for (const node of nodes) {
      const path = [...ancestors, node.id]
      if (node.title.toLowerCase().includes(lower)) {
        for (const id of path) visible.add(id)
      }
      walk(node.children, path)
    }
  }

  walk(tree, [])
  return visible
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
}

export function WikiTreeSidebar({
  operationId,
  isEditor,
  documents,
  isLoading,
}: WikiTreeSidebarProps) {
  const sidebarWidth = useWikiStore((s) => s.sidebarWidth)
  const openCreateDialog = useWikiStore((s) => s.openCreateDialog)
  const openTrashPanel = useWikiStore((s) => s.openTrashPanel)
  const openContentSearch = useWikiStore((s) => s.openContentSearch)

  const [filter, setFilter] = useState("")

  // Trash count for badge.
  const { data: trashData } = useWikiDocumentTrash(operationId)
  const trashCount = trashData?.pages[0]?.wikiDocumentTrash.totalCount ?? 0

  // Build tree from flat documents.
  const tree = useMemo(() => buildTree(documents), [documents])
  const visibleIds = useMemo(
    () => (filter ? filterTree(tree, filter) : null),
    [tree, filter],
  )

  // DnD sensors with activation distance to distinguish click from drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const updateDocument = useUpdateWikiDocument()

  // DnD state for tracking active drag and hovered drop target.
  const [activeId, setActiveId] = useState<string | null>(null)
  const activeIdRef = useRef<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const dropTargetRef = useRef<DropTarget | null>(null)

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
    activeIdRef.current = id
    setActiveId(id)
  }

  function handleDragMove(event: DragMoveEvent) {
    const over = event.over
    if (!over) {
      if (dropTargetRef.current) {
        dropTargetRef.current = null
        setDropTarget(null)
      }
      return
    }

    const id = over.id as string
    if (excludedIds.has(id)) {
      if (dropTargetRef.current) {
        dropTargetRef.current = null
        setDropTarget(null)
      }
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
    const prev = dropTargetRef.current
    if (!prev || prev.id !== id || prev.position !== position) {
      const next: DropTarget = { id, position }
      dropTargetRef.current = next
      setDropTarget(next)
    }
  }

  function handleDragEnd() {
    // Read from refs — state may be stale due to batched renders.
    const draggedId = activeIdRef.current
    const target = dropTargetRef.current

    // Reset state.
    activeIdRef.current = null
    setActiveId(null)
    setDropTarget(null)
    dropTargetRef.current = null

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
    activeIdRef.current = null
    setActiveId(null)
    setDropTarget(null)
    dropTargetRef.current = null
  }

  return (
    <div
      style={{ width: sidebarWidth }}
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
                onClick={() => openContentSearch(null, "All Documents")}
              />
            }
          >
            <SearchIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>Search documents</TooltipContent>
        </Tooltip>
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

      {/* Filter input */}
      <div className="flex h-10 items-center border-b px-2">
        <SearchInput
          value={filter}
          onValueChange={setFilter}
          placeholder="Filter by title..."
          className="relative w-full"
          inputClassName="h-7 pl-9 text-xs"
          debounceMs={200}
        />
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
                visibleIds={visibleIds}
                operationId={operationId}
                activeId={activeId}
                dropTarget={dropTarget}
              />
            ))}
            <DragOverlay dropAnimation={null}>
              {activeDoc && (
                <div className="flex items-center gap-1.5 rounded-md bg-popover px-2 py-1 text-sm shadow-md">
                  <span className="shrink-0">{activeDoc.emoji || "\u{1F4C4}"}</span>
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
