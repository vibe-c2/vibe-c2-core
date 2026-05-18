import { useMemo, useState, useTransition } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  DownloadIcon,
  Loader2Icon,
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
import {
  useEnsureWikiTree,
  useWikiDocumentChildren,
  useWikiDocumentTrashCount,
  useUpdateWikiDocument,
  wikiKeys,
} from "@/graphql/hooks/wiki"
import { WikiTreeNode } from "@/components/wiki/wiki-tree-node"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { WikiHistoryDropdown } from "@/components/wiki/wiki-history-dropdown"
import {
  collectExpandableIdsFromFlat,
  rowToTreeNode,
  sortByOrder,
} from "@/components/wiki/wiki-tree-helpers"
import type {
  WikiDocumentChildrenQuery,
  WikiDocumentTreeFieldsFragment,
} from "@/graphql/gql/graphql"

export interface TreeNode {
  id: string
  title: string
  emoji: string
  icon: string
  color: string
  sortOrder: string
  parentId: string | null
  childCount: number
  // Children are lazy — empty until the branch is expanded and its
  // useWikiDocumentChildren query returns. `childCount` drives the expand
  // caret independently so leaves can be distinguished without a fetch.
  children: TreeNode[]
}

// Read the (parentId → rows) slice for an op out of the React Query cache.
// Used by DnD math (descendant exclusion, sibling reorder) which has to
// walk loaded branches without re-rendering on every children fetch.
function readChildrenFromCache(
  queryClient: ReturnType<typeof useQueryClient>,
  operationId: string,
  parentId: string | null,
): WikiDocumentTreeFieldsFragment[] {
  const data = queryClient.getQueryData<WikiDocumentChildrenQuery>(
    wikiKeys.children(operationId, parentId),
  )
  return data?.wikiDocumentChildren ?? []
}

/** Collect a document's ID and all *already-loaded* descendant IDs (BFS). */
function collectLoadedDescendantIds(
  queryClient: ReturnType<typeof useQueryClient>,
  operationId: string,
  docId: string,
): Set<string> {
  const ids = new Set<string>([docId])
  const queue = [docId]
  while (queue.length > 0) {
    const current = queue.pop()!
    const kids = readChildrenFromCache(queryClient, operationId, current)
    for (const kid of kids) {
      if (!ids.has(kid.id)) {
        ids.add(kid.id)
        queue.push(kid.id)
      }
    }
  }
  return ids
}

/**
 * Compute a sort string between two adjacent strings.
 * Uses simple midpoint character approach for fractional indexing.
 */
function midSortOrder(before: string | null, after: string | null): string {
  const a = before ?? ""
  const b = after ?? ""
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
  // Forwarded to the wrapper div so ResizeHandle can imperatively mutate
  // `--wiki-sidebar-width` during a drag without going through React.
  ref?: React.Ref<HTMLDivElement>
}

export function WikiTreeSidebar({
  operationId,
  isEditor,
  ref,
}: WikiTreeSidebarProps) {
  const sidebarWidth = useWikiStore((s) => s.sidebarWidth)
  const openCreateDialog = useWikiStore((s) => s.openCreateDialog)
  const openImportOutlineDialog = useWikiStore((s) => s.openImportOutlineDialog)
  const openTrashPanel = useWikiStore((s) => s.openTrashPanel)
  const openContentSearch = useWikiStore((s) => s.openContentSearch)
  const expandMany = useWikiStore((s) => s.expandMany)
  const collapseMany = useWikiStore((s) => s.collapseMany)

  // Trash count for badge — scalar query, not the full list.
  const { data: trashCountData } = useWikiDocumentTrashCount(operationId)
  const trashCount = trashCountData?.wikiDocumentTrashCount ?? 0

  // Roots only — each WikiTreeNode fetches its own children on expand.
  const { data: rootsData, isLoading: rootsLoading } = useWikiDocumentChildren(
    operationId,
    null,
  )
  const roots = useMemo(
    () => sortByOrder(rootsData?.wikiDocumentChildren ?? []).map(rowToTreeNode),
    [rootsData?.wikiDocumentChildren],
  )

  // DnD math (descendant exclusion, sibling reorder) reads the per-parent
  // cache directly — branches that aren't expanded simply aren't in the
  // exclusion set, but dnd-kit only proposes drop targets among rendered
  // (= expanded) nodes anyway, so unloaded subtrees can't be drop targets.
  const queryClient = useQueryClient()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const updateDocument = useUpdateWikiDocument()

  const activeId = useWikiDragStore((s) => s.activeId)

  // Descendants of the dragged node — cannot drop onto these. Computed at
  // drag start by walking only the loaded per-parent slices.
  const excludedIds = useMemo(
    () =>
      activeId
        ? collectLoadedDescendantIds(queryClient, operationId, activeId)
        : new Set<string>(),
    [activeId, queryClient, operationId],
  )

  // Root drop zone so items can be dropped to top level.
  const { setNodeRef: setRootDropRef } = useDroppable({ id: "root" })

  // Find the active document for the drag overlay. Walk the roots first, then
  // every loaded children entry — DnD can only drag visible (= rendered) rows
  // so the row must live in at least one cached slice.
  const activeDoc = useMemo<WikiDocumentTreeFieldsFragment | null>(() => {
    if (!activeId) return null
    const rootHit = (rootsData?.wikiDocumentChildren ?? []).find(
      (d) => d.id === activeId,
    )
    if (rootHit) return rootHit
    const all = queryClient.getQueriesData<WikiDocumentChildrenQuery>({
      queryKey: wikiKeys.childrenByOp(operationId),
    })
    for (const [, data] of all) {
      const hit = data?.wikiDocumentChildren.find((d) => d.id === activeId)
      if (hit) return hit
    }
    return null
  }, [activeId, rootsData?.wikiDocumentChildren, queryClient, operationId])

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
    const dragStore = useWikiDragStore.getState()
    const draggedId = dragStore.activeId
    const target = dragStore.dropTarget

    dragStore.reset()

    if (!draggedId || !target) return

    // Locate the dragged row by scanning loaded children slices. Drag is
    // only possible on visible rows, so it must be in at least one slice.
    let draggedDoc: WikiDocumentTreeFieldsFragment | null = null
    const allSlices = queryClient.getQueriesData<WikiDocumentChildrenQuery>({
      queryKey: wikiKeys.childrenByOp(operationId),
    })
    for (const [, data] of allSlices) {
      const hit = data?.wikiDocumentChildren.find((d) => d.id === draggedId)
      if (hit) {
        draggedDoc = hit
        break
      }
    }
    if (!draggedDoc) return

    // "After" an expanded node with children = visually "before its first child".
    let resolvedTarget = target
    if (target.position === "after" && target.id !== "root") {
      const { expandedNodes } = useWikiStore.getState()
      if (expandedNodes.has(target.id)) {
        const firstChild = readChildrenFromCache(
          queryClient,
          operationId,
          target.id,
        )[0]
        if (firstChild) {
          resolvedTarget = { id: firstChild.id, position: "before" }
        }
      }
    }

    if (resolvedTarget.position === "inside") {
      const newParentId = resolvedTarget.id === "root" ? "" : resolvedTarget.id
      const parentIdForSiblings =
        resolvedTarget.id === "root" ? null : resolvedTarget.id
      const siblings = readChildrenFromCache(
        queryClient,
        operationId,
        parentIdForSiblings,
      ).filter((d) => d.id !== draggedId)
      const sorted = sortByOrder(siblings)
      const lastSort = sorted.length > 0 ? sorted[sorted.length - 1].sortOrder : null

      updateDocument.mutate({
        id: draggedId,
        input: {
          parentDocumentId: newParentId,
          sortOrder: midSortOrder(lastSort, null),
        },
      })
    } else {
      // Reorder: insert before/after the target among its siblings.
      // Locate the over-doc by scanning loaded slices (same shape as the
      // dragged-doc lookup above).
      let overDoc: WikiDocumentTreeFieldsFragment | null = null
      for (const [, data] of allSlices) {
        const hit = data?.wikiDocumentChildren.find(
          (d) => d.id === resolvedTarget.id,
        )
        if (hit) {
          overDoc = hit
          break
        }
      }
      if (!overDoc) return

      const parentId = overDoc.parentDocumentId ?? ""
      const parentIdForFilter = overDoc.parentDocumentId ?? null

      const allSiblings = sortByOrder(
        readChildrenFromCache(queryClient, operationId, parentIdForFilter),
      )
      const withoutDragged = allSiblings.filter((d) => d.id !== draggedId)
      const insertAt =
        resolvedTarget.position === "before"
          ? withoutDragged.findIndex((d) => d.id === resolvedTarget.id)
          : withoutDragged.findIndex((d) => d.id === resolvedTarget.id) + 1
      const reordered = [...withoutDragged]
      reordered.splice(insertAt, 0, draggedDoc)

      const count = reordered.length
      for (let i = 0; i < count; i++) {
        const fraction = (i + 1) / (count + 1)
        const newSort = String.fromCharCode(65 + Math.floor(fraction * 57))
        if (reordered[i].sortOrder !== newSort) {
          updateDocument.mutate({
            id: reordered[i].id,
            input: {
              ...(reordered[i].id === draggedId
                ? { parentDocumentId: parentId }
                : {}),
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

  // "Expand all" fetches the operation's full flat tree once (cached after
  // first call, invalidated by the SSE subscription) and seeds every per-
  // parent children cache entry as a side effect. With the cache primed, we
  // can hand expandMany() every non-leaf id — including branches the user
  // has never opened, which was the pre-fix gap.
  const ensureWikiTree = useEnsureWikiTree(operationId)

  // Two phases dominate on huge trees: the GraphQL fetch (network/server)
  // and the React commit that mounts every newly-expanded row. `isFetching`
  // covers the first; `useTransition`'s pending flag covers the second. We
  // OR them together so the spinner stays visible from click until the last
  // row paints.
  const [isFetching, setIsFetching] = useState(false)
  const [isExpanding, startExpandTransition] = useTransition()
  const expandAllLoading = isFetching || isExpanding

  async function handleExpandAll() {
    if (expandAllLoading) return
    setIsFetching(true)
    try {
      const rows = await ensureWikiTree()
      const ids = collectExpandableIdsFromFlat(rows, null)
      // startTransition keeps the spinner responsive while React commits the
      // (potentially thousands of) newly-rendered rows in the background.
      startExpandTransition(() => expandMany(ids))
    } finally {
      setIsFetching(false)
    }
  }

  return (
    <div
      ref={ref}
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
                onClick={handleExpandAll}
                disabled={expandAllLoading}
              />
            }
          >
            {expandAllLoading ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <ChevronsUpDownIcon className="size-3.5" />
            )}
          </TooltipTrigger>
          <TooltipContent>
            {expandAllLoading ? "Expanding…" : "Expand all"}
          </TooltipContent>
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
        {rootsLoading ? (
          <div className="flex flex-col gap-1 px-1">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-7 rounded" />
            ))}
          </div>
        ) : roots.length === 0 ? (
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
            {roots.map((node) => (
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
