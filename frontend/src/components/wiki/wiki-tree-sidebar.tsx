import { useMemo, useTransition } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  ArrowDownAZIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  ClockIcon,
  DownloadIcon,
  Loader2Icon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
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
  useWikiDocumentChildren,
  useWikiDocumentTrashCount,
  useReorderWikiDocumentSiblings,
  wikiKeys,
} from "@/graphql/hooks/wiki"
import { WikiTreeNode } from "@/components/wiki/wiki-tree-node"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { WikiHistoryDropdown } from "@/components/wiki/wiki-history-dropdown"
import { WikiTreeModeToggle } from "@/components/wiki/wiki-tree-mode-toggle"
import { useScopedOperation } from "@/hooks/use-scoped-operation"
import {
  rowToTreeNode,
  sortByOrder,
} from "@/components/wiki/wiki-tree-helpers"
import { useWikiSubtreeExpansion } from "@/components/wiki/use-wiki-subtree-expansion"
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
 * Resolve the drop target (id + position) from a dnd-kit drag event.
 *
 * Single source of truth used by both pointermove (to drive the highlight)
 * and dragend (to drive the actual mutation). Reading the store at dragend
 * time was a race — pointerup can land before the latest pointermove tick
 * flushes — so we always derive from the event itself.
 *
 * Zone split: 20/60/20 for expanded parents (leaves enough edge to drop
 * "before"/"after" between rendered siblings), 5/90/5 for collapsed/leaf
 * rows (where "inside" is overwhelmingly the user's intent — there's no
 * children to insert between).
 */
function resolveDropTargetFromEvent(
  event: DragMoveEvent | DragEndEvent,
  excludedIds: Set<string>,
  expandedNodes: Set<string>,
): DropTarget | null {
  const over = event.over
  if (!over) return null
  const id = over.id as string
  if (excludedIds.has(id)) return null
  if (id === "root") return { id, position: "inside" }

  const activator = event.activatorEvent as PointerEvent
  const pointerY = activator.clientY + event.delta.y
  const rect = over.rect
  const fraction = (pointerY - rect.top) / rect.height

  const isExpanded = expandedNodes.has(id)
  const beforeEdge = isExpanded ? 0.2 : 0.05
  const afterEdge = isExpanded ? 0.8 : 0.95

  let position: DropPosition = "inside"
  if (fraction < beforeEdge) position = "before"
  else if (fraction > afterEdge) position = "after"
  return { id, position }
}

interface WikiTreeSidebarProps {
  operationId: string
  isEditor: boolean
  /**
   * True when the tree is rendering against the synthetic Public operation
   * (either because no operation is scoped, or because the user toggled to
   * Public while a scope exists). Drives the mode toggle's selected state.
   */
  isPublicMode: boolean
  /** True when there's a real scoped operation (independent of mode). */
  hasRealScope: boolean
  // Forwarded to the wrapper div so ResizeHandle can imperatively mutate
  // `--wiki-sidebar-width` during a drag without going through React.
  ref?: React.Ref<HTMLDivElement>
}

export function WikiTreeSidebar({
  operationId,
  isEditor,
  isPublicMode,
  hasRealScope,
  ref,
}: WikiTreeSidebarProps) {
  // Operation name for the toggle's "Operation" segment. Read directly here so
  // the toggle stays a presentational component.
  const scopedOperation = useScopedOperation()
  const sidebarWidth = useWikiStore((s) => s.sidebarWidth)
  const openCreateDialog = useWikiStore((s) => s.openCreateDialog)
  const openImportOutlineDialog = useWikiStore((s) => s.openImportOutlineDialog)
  const openExportDialog = useWikiStore((s) => s.openExportDialog)
  const openTrashPanel = useWikiStore((s) => s.openTrashPanel)
  const openContentSearch = useWikiStore((s) => s.openContentSearch)
  const openRecentDocs = useWikiStore((s) => s.openRecentDocs)
  // expandMany lives inside useWikiSubtreeExpansion; only collapseMany is
  // used directly here, by the no-fetch Collapse-all handler.
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

  const reorderSiblings = useReorderWikiDocumentSiblings()

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
    const expandedNodes = useWikiStore.getState().expandedNodes
    const next = resolveDropTargetFromEvent(event, excludedIds, expandedNodes)

    const prev = dragStore.dropTarget
    if (next === null) {
      if (prev) dragStore.setDropTarget(null)
      return
    }
    if (!prev || prev.id !== next.id || prev.position !== next.position) {
      dragStore.setDropTarget(next)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const dragStore = useWikiDragStore.getState()
    const draggedId = event.active.id as string
    const expandedNodes = useWikiStore.getState().expandedNodes
    // Derive the drop target from the event itself, not from our pointermove-
    // populated store: pointerup can land between pointermove ticks and the
    // store would carry a stale (or null) value, silently dropping the move.
    const target = resolveDropTargetFromEvent(event, excludedIds, expandedNodes)

    dragStore.reset()

    if (!draggedId || !target) return

    const mutationOptions = {
      onError: (err: unknown) =>
        toast.error(err instanceof Error ? err.message : "Failed to move document"),
    }

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

    // Compute the final orderedIds for the destination parent in one place,
    // then ship one bulk mutation. The server rebalances sortOrders, handles
    // reparents, and fans out exactly one wikiDocumentChanged event per
    // affected parent bucket — replacing the N-mutation rebalance loop that
    // used to fire 18+ refetches per drop.
    let destinationParentId: string | null
    let destinationOrderedIds: string[]

    if (resolvedTarget.position === "inside") {
      destinationParentId = resolvedTarget.id === "root" ? null : resolvedTarget.id
      const siblings = sortByOrder(
        readChildrenFromCache(queryClient, operationId, destinationParentId),
      ).filter((d) => d.id !== draggedId)
      // Drop-into-folder places the dragged row at the TOP of the
      // destination — matches the historical computeTopPlacement behaviour.
      destinationOrderedIds = [draggedId, ...siblings.map((d) => d.id)]
    } else {
      // Reorder: insert before/after the target among its siblings.
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

      destinationParentId = overDoc.parentDocumentId ?? null

      const allSiblings = sortByOrder(
        readChildrenFromCache(queryClient, operationId, destinationParentId),
      )
      const withoutDragged = allSiblings.filter((d) => d.id !== draggedId)
      const insertAt =
        resolvedTarget.position === "before"
          ? withoutDragged.findIndex((d) => d.id === resolvedTarget.id)
          : withoutDragged.findIndex((d) => d.id === resolvedTarget.id) + 1
      const reordered = [
        ...withoutDragged.slice(0, insertAt),
        draggedDoc,
        ...withoutDragged.slice(insertAt),
      ]
      destinationOrderedIds = reordered.map((d) => d.id)
    }

    reorderSiblings.mutate(
      {
        input: {
          operationId,
          parentDocumentId: destinationParentId,
          orderedIds: destinationOrderedIds,
        },
      },
      mutationOptions,
    )
  }

  function handleDragCancel() {
    useWikiDragStore.getState().reset()
  }

  // "Expand all" primes the full operation tree (one cached GraphQL fetch)
  // and expands every non-leaf id — including branches the user has never
  // opened. The hook also covers the React commit phase via useTransition.
  const { loading: expandAllLoading, run: runSubtreeAction } =
    useWikiSubtreeExpansion(operationId)

  // Collapse-all has no fetch phase — `expandedNodes` already lists every id
  // we need to drop. Just a transition around the unmount commit.
  const [isCollapsing, startCollapseTransition] = useTransition()

  function handleCollapseAll() {
    if (isCollapsing) return
    const ids = [...useWikiStore.getState().expandedNodes]
    if (ids.length === 0) return
    startCollapseTransition(() => collapseMany(ids))
  }

  // Sort the root documents alphabetically. Mirrors the per-node "Sort" action
  // in wiki-tree-row-menu-items.tsx but targets parentDocumentId: null.
  function handleSortRoots() {
    if (roots.length < 2) return
    const sorted = [...roots].sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
    )
    reorderSiblings.mutate(
      {
        input: {
          operationId,
          parentDocumentId: null,
          orderedIds: sorted.map((n) => n.id),
        },
      },
      {
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Failed to sort"),
      },
    )
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
      {/* Header — mode toggle/pill on the left (acts as the title), action
          icons on the right. Toggle takes the title slot so the row stays a
          single line; the "Operation"/"Public" segment selection itself
          communicates which tree the user is looking at. */}
      <div className="flex h-10 items-center gap-0.5 border-b px-2">
        <WikiTreeModeToggle
          hasRealScope={hasRealScope}
          operationName={scopedOperation?.name}
        />
        <span className="flex-1 min-w-1" />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => void runSubtreeAction("expand", null)}
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
                onClick={handleCollapseAll}
                disabled={isCollapsing}
              />
            }
          >
            {isCollapsing ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <ChevronsDownUpIcon className="size-3.5" />
            )}
          </TooltipTrigger>
          <TooltipContent>
            {isCollapsing ? "Collapsing…" : "Collapse all"}
          </TooltipContent>
        </Tooltip>
        {isEditor && roots.length >= 2 && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleSortRoots}
                  disabled={reorderSiblings.isPending}
                  aria-label="Sort root documents alphabetically"
                />
              }
            >
              <ArrowDownAZIcon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent>Sort root documents A–Z</TooltipContent>
          </Tooltip>
        )}
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
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={openRecentDocs}
                aria-label="Latest documents"
              />
            }
          >
            <ClockIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>Latest documents</TooltipContent>
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
                onClick={() => openExportDialog()}
                aria-label="Export wiki"
              />
            }
          >
            <UploadIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>Export wiki</TooltipContent>
        </Tooltip>
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
            {isPublicMode
              ? "No public documents yet"
              : "No documents yet"}
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
                    hasChildren={activeDoc.childCount > 0}
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
