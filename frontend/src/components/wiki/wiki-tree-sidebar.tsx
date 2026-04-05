import { useMemo, useState } from "react"
import { PlusIcon, SearchIcon, Trash2Icon } from "lucide-react"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useWikiStore } from "@/stores/wiki"
import { useWikiDocumentTrash, useUpdateWikiDocument } from "@/graphql/hooks/wiki"
import { WikiTreeNode } from "@/components/wiki/wiki-tree-node"
import type { WikiDocumentTreeFieldsFragment } from "@/graphql/gql/graphql"

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
      .sort((a, b) => a.sortOrder.localeCompare(b.sortOrder))
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

  // Flat list of all node IDs for SortableContext.
  const allIds = useMemo(() => documents.map((d) => d.id), [documents])

  // DnD sensors with activation distance to distinguish click from drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const updateDocument = useUpdateWikiDocument()

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeId = active.id as string
    const overId = over.id as string

    // Find the active node's current parent and the over node's parent.
    const activeDoc = documents.find((d) => d.id === activeId)
    const overDoc = documents.find((d) => d.id === overId)
    if (!activeDoc || !overDoc) return

    // Reparent into the same parent as the drop target and reorder.
    const newParentId = overDoc.parentDocument?.id ?? null
    const siblings = documents
      .filter((d) => (d.parentDocument?.id ?? null) === newParentId && d.id !== activeId)
      .sort((a, b) => a.sortOrder.localeCompare(b.sortOrder))

    const overIndex = siblings.findIndex((d) => d.id === overId)
    const before = overIndex > 0 ? siblings[overIndex - 1].sortOrder : null
    const after = siblings[overIndex]?.sortOrder ?? null
    const newSortOrder = midSortOrder(before, after)

    updateDocument.mutate({
      id: activeId,
      input: {
        parentDocumentId: newParentId,
        sortOrder: newSortOrder,
      },
    })
  }

  return (
    <div
      style={{ width: sidebarWidth }}
      className="flex shrink-0 flex-col border-r bg-background"
    >
      {/* Header */}
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <span className="flex-1 truncate px-1 text-sm font-medium">Documents</span>
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
      <div className="border-b px-2 py-1.5">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by title..."
          className="h-7 text-xs"
        />
      </div>

      {/* Tree body */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
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
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={allIds} strategy={verticalListSortingStrategy}>
              {tree.map((node) => (
                <WikiTreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  isEditor={isEditor}
                  visibleIds={visibleIds}
                  operationId={operationId}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}
