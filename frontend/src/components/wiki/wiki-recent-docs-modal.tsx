import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react"
import { useConnectionNodes } from "@/hooks/use-connection-nodes"
import { Link, useNavigate } from "react-router"
import { ClockIcon, XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Button } from "@/components/ui/button"
import { DialogOverlay } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { WikiAncestorBreadcrumb } from "@/components/wiki/wiki-ancestor-breadcrumb"
import { useWikiRecentDocuments } from "@/graphql/hooks/wiki"
import { useWikiStore } from "@/stores/wiki"
import { relativeTime } from "@/lib/relative-time"
import { cn, isPlainLeftClick } from "@/lib/utils"
import type { WikiDocumentSort } from "@/graphql/gql/graphql"

interface WikiRecentDocsModalProps {
  operationId: string
}

// Latest-documents modal anchored in the wiki tree sidebar. Same visual
// shape as WikiCommandPalette (base-ui Dialog with backdrop + popup), but
// the body is a virtualized list — operations with thousands of docs render
// only a small window of rows at any time.
//
// Lazy-fetched: the underlying hook is gated on `recentDocsOpen`, so a user
// who never opens this modal pays zero round-trips. Cache invalidation is
// driven by the wikiDocumentChanged subscription (see useWikiDocumentChangedSubscription)
// which clears the entire `recents` cache subtree on any document CRUD.
export function WikiRecentDocsModal({ operationId }: WikiRecentDocsModalProps) {
  const open = useWikiStore((s) => s.recentDocsOpen)
  const closeRecentDocs = useWikiStore((s) => s.closeRecentDocs)

  // Keep the body alive during the exit animation so the popup doesn't
  // collapse to an empty box. Mirrors the pattern used in
  // wiki-command-palette.tsx.
  const [wasOpen, setWasOpen] = useState(open)
  if (open && !wasOpen) setWasOpen(true)

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) closeRecentDocs()
      }}
    >
      <DialogPrimitive.Portal>
        <DialogOverlay />
        <DialogPrimitive.Popup className="fixed left-1/2 top-[15%] z-50 flex max-h-[70vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 flex-col rounded-xl bg-popover ring-1 ring-foreground/10 outline-none shadow-xl duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0">
          {wasOpen && (
            <ModalBody
              operationId={operationId}
              isOpen={open}
              onClose={closeRecentDocs}
            />
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

interface ModalBodyProps {
  operationId: string
  isOpen: boolean
  onClose: () => void
}

// Row height estimate used by the virtualizer. The actual row renders icon +
// title + breadcrumb + attribution at ~72px; the estimate just needs to be
// in the ballpark, react-virtual measures real heights via the row's ref.
const ROW_HEIGHT = 72
// How many rows from the bottom of the rendered window trigger the next
// page fetch. Small enough to feel responsive on fast scroll, large enough
// that the user doesn't see the loading-skeleton row.
const PREFETCH_THRESHOLD = 10

function ModalBody({ operationId, isOpen, onClose }: ModalBodyProps) {
  const navigate = useNavigate()
  const sort = useWikiStore((s) => s.recentDocsSort)
  const setRecentDocsSort = useWikiStore((s) => s.setRecentDocsSort)

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useWikiRecentDocuments({ operationId, sort, enabled: isOpen })

  const hits = useConnectionNodes(data, (p) => p.wikiDocuments)
  const total = data?.pages[0]?.wikiDocuments.totalCount ?? 0

  const [activeIndex, setActiveIndex] = useState(0)

  // Reset cursor when sort changes — the active row would otherwise point
  // into a stale result list. Mirrors the prev-value pattern used by the
  // command palette.
  const [lastSort, setLastSort] = useState(sort)
  if (lastSort !== sort) {
    setLastSort(sort)
    setActiveIndex(0)
  }

  // Clamp once the list arrives so the cursor never points past the end.
  const boundedActive =
    hits.length === 0 ? 0 : Math.min(Math.max(0, activeIndex), hits.length - 1)

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: hits.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  })

  // Infinite scroll: when the bottom of the rendered window approaches the
  // end of the loaded set, fetch the next page. Skipped while a fetch is in
  // flight to avoid duplicate requests during fast scroll.
  const virtualItems = virtualizer.getVirtualItems()
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return
    const last = virtualItems[virtualItems.length - 1]
    if (!last) return
    if (last.index >= hits.length - PREFETCH_THRESHOLD) {
      fetchNextPage()
    }
  }, [virtualItems, hits.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  // Keep the keyboard-active row in view. `scrollToIndex` with `auto` is a
  // no-op when the row is already visible.
  useEffect(() => {
    if (hits.length === 0) return
    virtualizer.scrollToIndex(boundedActive, { align: "auto" })
  }, [boundedActive, hits.length, virtualizer])

  const openHit = useCallback(
    (docId: string) => {
      navigate(`/wiki/${docId}`)
      onClose()
    },
    [navigate, onClose],
  )

  // Shared handler for the doc-opening <Link>s in a row (icon, title,
  // attribution, timestamp). Modifier-clicks fall through to the browser's
  // new-tab/new-window behavior so the modal only closes on plain navigation.
  // Mirrors PaletteRow's handleOpenClick in wiki-command-palette.tsx.
  const handleOpenClick = useCallback(
    (e: ReactMouseEvent) => {
      if (isPlainLeftClick(e)) onClose()
    },
    [onClose],
  )

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(hits.length - 1, 0)))
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === "Enter") {
        e.preventDefault()
        const hit = hits[boundedActive]
        if (hit) openHit(hit.id)
      }
    },
    [hits, boundedActive, openHit],
  )

  // Stable per-render `now` so every row's relative-time label is anchored
  // to the same instant — matches the wiki-history-dropdown pattern.
  const now = new Date()

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown} tabIndex={-1}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <ClockIcon className="size-4 shrink-0 text-muted-foreground" />
        <DialogPrimitive.Title className="text-sm font-medium">
          Latest documents
        </DialogPrimitive.Title>
        <Tabs
          value={sort}
          onValueChange={(v) => setRecentDocsSort(v as WikiDocumentSort)}
          className="ml-2"
        >
          <TabsList className="h-7 p-0.5">
            <TabsTrigger value="RECENTLY_CREATED" className="h-6 px-2 text-xs">
              Created
            </TabsTrigger>
            <TabsTrigger value="RECENTLY_UPDATED" className="h-6 px-2 text-xs">
              Updated
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex-1" />
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <XIcon className="size-4" />
        </Button>
      </div>

      {/* List */}
      <div
        ref={scrollRef}
        className="min-h-32 flex-1 overflow-y-auto"
      >
        {isLoading && hits.length === 0 ? (
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12 rounded" />
            ))}
          </div>
        ) : hits.length === 0 ? (
          <EmptyState sort={sort} />
        ) : (
          <div
            style={{ height: virtualizer.getTotalSize() }}
            className="relative w-full"
          >
            {virtualItems.map((item) => {
              const hit = hits[item.index]
              if (!hit) return null
              const isActive = item.index === boundedActive
              const timestampSource =
                sort === "RECENTLY_UPDATED"
                  ? hit.lastUpdatedAt ?? hit.updatedAt
                  : hit.createdAt
              // Attribution mirrors the active sort tab. lastUpdatedBy falls
              // back to createdBy for legacy documents that predate the
              // attribution field (see wiki.graphql comment on lastUpdatedBy).
              const attributionUser =
                sort === "RECENTLY_UPDATED"
                  ? hit.lastUpdatedBy ?? hit.createdBy
                  : hit.createdBy
              const attributionLabel =
                sort === "RECENTLY_UPDATED" ? "Updated by" : "Created by"
              return (
                <div
                  key={hit.id}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  {/* Plain div row — never a single Link — so the title,
                      attribution, timestamp, and each breadcrumb crumb are
                      their own interactive elements without nesting anchors.
                      The doc-opening areas are <Link>s; the breadcrumb crumbs
                      are their own <Link>s to the ancestor (onCrumbClick). This
                      mirrors PaletteRow so opening a parent from the breadcrumb
                      works the same here as in the search modal. */}
                  <div
                    onMouseMove={() => setActiveIndex(item.index)}
                    className={cn(
                      "mx-1 flex items-start gap-2 rounded px-3 py-2 text-left",
                      isActive ? "bg-accent" : "hover:bg-muted/60",
                    )}
                  >
                    <Link
                      to={`/wiki/${hit.id}`}
                      onClick={handleOpenClick}
                      className="shrink-0"
                    >
                      <DocumentIcon
                        emoji={hit.emoji}
                        icon={hit.icon}
                        color={hit.color}
                        className="mt-0.5"
                      />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/wiki/${hit.id}`}
                        onClick={handleOpenClick}
                        className="block truncate text-sm font-medium"
                      >
                        {hit.title || "Untitled"}
                      </Link>
                      <WikiAncestorBreadcrumb
                        ancestors={hit.ancestors}
                        collapseAfter={3}
                        onCrumbClick={onClose}
                      />
                      <Link
                        to={`/wiki/${hit.id}`}
                        onClick={handleOpenClick}
                        className="block truncate text-[11px] text-muted-foreground"
                      >
                        {attributionLabel} {attributionUser.username}
                      </Link>
                    </div>
                    <Link
                      to={`/wiki/${hit.id}`}
                      onClick={handleOpenClick}
                      className="mt-0.5 shrink-0 text-[11px] tabular-nums text-muted-foreground"
                    >
                      {relativeTime(timestampSource, now)}
                    </Link>
                  </div>
                </div>
              )
            })}
            {isFetchingNextPage && (
              <div className="absolute bottom-0 left-0 right-0 flex justify-center py-2 text-xs text-muted-foreground">
                Loading more…
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
        <span>
          <kbd className="rounded border px-1">↑</kbd>{" "}
          <kbd className="rounded border px-1">↓</kbd> to navigate{" "}
          <kbd className="rounded border px-1">Enter</kbd> to open{" "}
          <kbd className="rounded border px-1">Esc</kbd> to close
        </span>
        {total > 0 && (
          <span>
            {total} document{total === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </div>
  )
}

function EmptyState({ sort }: { sort: WikiDocumentSort }) {
  const label =
    sort === "RECENTLY_UPDATED"
      ? "No documents have been edited yet."
      : "No documents yet."
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <ClockIcon className="size-4 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground">
        Create a new document or pick a different sort.
      </p>
    </div>
  )
}
