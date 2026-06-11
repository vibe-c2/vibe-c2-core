import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useParams } from "react-router"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import {
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  EllipsisIcon,
  Loader2Icon,
  PlusIcon,
  SearchIcon,
} from "lucide-react"
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { WikiTreeRowMenuItems } from "@/components/wiki/wiki-tree-row-menu-items"
import { openWikiSearch } from "@/components/wiki/wiki-command-palette"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useWikiStore } from "@/stores/wiki"
import { useWikiDragStore } from "@/stores/wiki-drag"
import {
  useUpdateWikiDocument,
  useWikiDocumentChildren,
} from "@/graphql/hooks/wiki"
import { useWikiSubtreeExpansion } from "@/components/wiki/use-wiki-subtree-expansion"
import {
  DocumentIconPicker,
  type DocumentIconValue,
} from "@/components/wiki/document-icon-picker"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { cn } from "@/lib/utils"
import { rowToTreeNode, sortByOrder } from "@/components/wiki/wiki-tree-helpers"
import type { TreeNode } from "@/components/wiki/wiki-tree-sidebar"

interface WikiTreeNodeProps {
  node: TreeNode
  depth: number
  isEditor: boolean
  operationId: string
}

/** Is the row entirely inside the container's visible viewport? */
function isFullyVisibleIn(row: Element, container: Element): boolean {
  const rowRect = row.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  return (
    rowRect.top >= containerRect.top && rowRect.bottom <= containerRect.bottom
  )
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

  // DnD: each node is both draggable and a drop target. The activator is the
  // leading icon/chevron slot — NOT the whole row — so the title <Link> stays
  // a normal clickable element. If listeners lived on the row, dnd-kit's
  // sub-threshold pointerup (drag never activated) would fall through to a
  // <Link> click and yank the user away to the dragged doc on every misclick.
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    setActivatorNodeRef,
  } = useDraggable({ id: node.id })
  const { setNodeRef: setDropRef } = useDroppable({ id: node.id })

  // When the row becomes the selected document — usually because the user
  // navigated from search or pasted a deep link — bring it into view. The
  // page-level effect already expanded the ancestors by the time this fires.
  // Center the row in the tree's scroll container instead of `block:
  // "nearest"`: nearest scrolls minimally, so on large expanded trees the
  // row lands pinned at the very bottom edge. Skip entirely when the row is
  // already fully visible — clicking a visible row must not yank the tree.
  const rowRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!isSelected) return
    const row = rowRef.current
    if (!row) return
    const container = row.closest("[data-wiki-tree-scroll]")
    if (container && isFullyVisibleIn(row, container)) return
    row.scrollIntoView({ block: "center", behavior: "smooth" })
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
    // Don't force-close: the picker keeps itself open on color picks (so the
    // user can browse icons in the new color) and closes itself on emoji/icon
    // picks via onOpenChange. Closing here would collapse the popover the
    // instant the user clicked a color swatch.
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

  // Tree connector lines: vertical guide for each ancestor depth + short
  // horizontal stub joining the immediate parent's guide to this row's icon.
  // Geometry: indent = depth*16 + 4, icon span is size-5 (20px) so icon centers
  // fall at x = i*16 + 14. Vertical guide is a 1px line at x = 13-14 within
  // each 16px slot; horizontal stub is 7px wide at y=50% from x=(depth-1)*16+14
  // to x=(depth-1)*16+21 — meets the icon's left edge at indent.
  // Done with layered backgrounds (no per-ancestor DOM) so memoized rows stay
  // cheap on large trees. background-color from hover/select classes sits
  // beneath and remains visible around the lines.
  const treeLineStyle =
    depth > 0
      ? {
          backgroundImage:
            "repeating-linear-gradient(to right, transparent 0, transparent 13px, var(--border) 13px, var(--border) 14px, transparent 14px, transparent 16px), linear-gradient(var(--border), var(--border))",
          backgroundSize: `${depth * 16}px 100%, 7px 1px`,
          backgroundPosition: `0 0, ${(depth - 1) * 16 + 14}px 50%`,
          backgroundRepeat: "no-repeat" as const,
        }
      : undefined

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

      {/* ContextMenu wraps the row so right-click anywhere on it opens the
          same actions as the 3-dots dropdown. The trigger is rendered with
          `display: contents` so the row's flex layout is unaffected — events
          still bubble to the wrapper for Base UI's contextmenu handler. */}
      <ContextMenu>
        <ContextMenuTrigger className="contents">
          <div
            ref={(el) => {
              rowRef.current = el
              setDropRef(el)
              if (isEditor) setDragRef(el)
            }}
            style={{ paddingLeft: indent, ...treeLineStyle }}
            className={cn(
              "group flex h-7 items-center gap-0.5 rounded-md px-1 text-sm",
              isDropInside && "bg-primary/10 ring-1 ring-primary",
              !isDropInside && isSelected && "bg-accent text-accent-foreground",
              !isDropInside && !isSelected && "hover:bg-muted",
            )}
          >
            {/* Chevron/emoji shared slot: emoji by default, chevron on hover.
                Leaves render just the emoji (no trigger). This span is also the
                drag activator — pointer listeners live here, NOT on the row, so
                the <Link> below is a sibling rather than a descendant. */}
            <span
              ref={isEditor ? setActivatorNodeRef : undefined}
              {...(isEditor ? attributes : {})}
              {...(isEditor ? listeners : {})}
              className={cn(
                "flex size-5 shrink-0 items-center justify-center",
                isEditor && "cursor-grab active:cursor-grabbing",
              )}
            >
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
                      hasChildren
                      isExpanded={isExpanded}
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
                <DocumentIcon
                  emoji={node.emoji}
                  icon={node.icon}
                  color={node.color}
                />
              )}
            </span>

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
                // (which would let the user drag the URL as text). The dnd-kit
                // activator is the leading icon slot, not this <Link>, so a
                // plain click on the title always reaches react-router.
                draggable={false}
                className="flex h-full flex-1 items-center truncate px-1 text-left text-sm"
              >
                {node.title}
              </Link>
            )}

            {/* Quick actions + context menu — extracted so this expensive subtree
                (a DropdownMenu + buttons) bails out via memo when the row re-renders
                for unrelated reasons (drag highlight flips, dnd-kit measurement
                passes, expansion cascades). The profile showed this block dominated
                spike-commit time; memoizing it here is the highest-leverage win. */}
            <WikiTreeRowQuickActions
              node={node}
              operationId={operationId}
              isEditor={isEditor}
              onStartRename={handleStartRename}
              onStartIconPicker={handleStartIconPicker}
            />
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <WikiTreeRowMenuItems
            Item={ContextMenuItem}
            Separator={ContextMenuSeparator}
            node={node}
            operationId={operationId}
            isEditor={isEditor}
            onStartRename={handleStartRename}
            onStartIconPicker={handleStartIconPicker}
          />
        </ContextMenuContent>
      </ContextMenu>

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
  const openCreateDialog = useWikiStore((s) => s.openCreateDialog)

  // Menu state tracks both `open` (Base UI's controlled state) AND `closing`
  // — a brief tail that stays true while the popup animates out. Without the
  // tail, `menuOpen` flips false the moment the user dismisses the menu and
  // the trigger button immediately collapses to `display:none` (hover lost).
  // Base UI's positioner, still running the exit animation, loses its anchor
  // mid-frame and re-anchors to (0,0) — visible as the "blink in the upper
  // corner" the user reported. Keeping the trigger laid out for ~exit-duration
  // gives the positioner a stable anchor through the animation.
  const [menuOpen, setMenuOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const closeTimerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
      }
    },
    [],
  )

  const handleMenuOpenChange = useCallback((open: boolean) => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setMenuOpen(open)
    if (open) {
      setClosing(false)
      return
    }
    setClosing(true)
    // dropdown-menu.tsx uses duration-100 on the exit animation; 200ms is
    // a safety margin in case the browser delays the timer under load.
    closeTimerRef.current = window.setTimeout(() => {
      setClosing(false)
      closeTimerRef.current = null
    }, 200)
  }, [])

  const triggerVisible = menuOpen || closing

  // One loading flag shared across Expand/Collapse subtree: they hit the
  // same tree-fetch + transition pipeline and only one runs at a time.
  const { loading: subtreeLoading, run: runSubtreeAction } =
    useWikiSubtreeExpansion(operationId)

  // childCount is the canonical "has any children?" signal (cheap, comes
  // from the server). The "Expand/Collapse subtree" buttons prime the full
  // operation tree on click so they cover unloaded branches.
  const hasChildren = node.childCount > 0

  return (
    <>
      {hasChildren && (
        <>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={subtreeLoading ? "Working" : "Expand subtree"}
            className={cn(
              "shrink-0",
              // Keep the spinner visible during the long-running case
              // even when the cursor is no longer hovering the row.
              subtreeLoading
                ? "inline-flex"
                : "hidden group-hover:inline-flex",
            )}
            disabled={subtreeLoading}
            onClick={(e) => {
              e.stopPropagation()
              void runSubtreeAction("expand", node.id)
            }}
          >
            {subtreeLoading ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <ChevronsUpDownIcon className="size-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Collapse subtree"
            className="shrink-0 hidden group-hover:inline-flex"
            disabled={subtreeLoading}
            onClick={(e) => {
              e.stopPropagation()
              void runSubtreeAction("collapse", node.id)
            }}
          >
            <ChevronsDownUpIcon className="size-3.5" />
          </Button>
        </>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Search in ${node.title}`}
        className="shrink-0 hidden group-hover:inline-flex"
        onClick={() =>
          openWikiSearch({
            operationId,
            parentDocumentId: node.id,
            parentTitle: node.title,
          })
        }
      >
        <SearchIcon className="size-3.5" />
      </Button>
      {isEditor && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="New child document"
          className="shrink-0 hidden group-hover:inline-flex"
          onClick={() => openCreateDialog(node.id)}
        >
          <PlusIcon className="size-3.5" />
        </Button>
      )}

      <DropdownMenu open={menuOpen} onOpenChange={handleMenuOpenChange}>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn(
                "shrink-0",
                triggerVisible
                  ? "inline-flex"
                  : "hidden group-hover:inline-flex",
              )}
            />
          }
        >
          <EllipsisIcon className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          <WikiTreeRowMenuItems
            Item={DropdownMenuItem}
            Separator={DropdownMenuSeparator}
            node={node}
            operationId={operationId}
            isEditor={isEditor}
            onStartRename={onStartRename}
            onStartIconPicker={onStartIconPicker}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

const WikiTreeRowQuickActions = memo(WikiTreeRowQuickActionsImpl)
