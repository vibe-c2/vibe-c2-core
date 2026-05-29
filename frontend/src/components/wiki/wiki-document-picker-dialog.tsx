import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { create } from "zustand"
import { useVirtualizer } from "@tanstack/react-virtual"
import { FileTextIcon, LoaderIcon, SearchIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useWikiDocuments } from "@/graphql/hooks/wiki"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { WikiAncestorBreadcrumb } from "@/components/wiki/wiki-ancestor-breadcrumb"
import { cn } from "@/lib/utils"

// Shape passed back to the caller on pick. Matches what `useWikiDocuments`
// projects per row so any subset is enough for typical post-pick work
// (insert a wiki reference node, add a relation, render a chip).
export interface PickedWikiDocument {
  id: string
  title: string
  emoji: string
  icon: string
  color: string
}

interface OpenArgs {
  operationId: string
  /** Document IDs that should appear muted and reject clicks (e.g. the
   *  current doc when called from the /doc slash command, or already-added
   *  references when called from the task edit dialog). */
  excludeIds?: string[]
  /** Optional override for the dialog title — defaults to "Insert document reference". */
  title?: string
  /** Optional override for the dialog description. */
  description?: string
  onPick: (doc: PickedWikiDocument) => void
}

interface PickerState {
  open: boolean
  operationId: string
  excludeIds: string[]
  title: string
  description: string
  onPick: ((doc: PickedWikiDocument) => void) | null
  openPicker: (args: OpenArgs) => void
  closePicker: () => void
}

// Singleton store — the dialog is mounted once in AppLayout and any surface
// (slash command, task edit dialog, future credential dialogs, etc.) calls
// `openWikiDocumentPicker` to trigger it.
const useWikiDocumentPickerStore = create<PickerState>((set) => ({
  open: false,
  operationId: "",
  excludeIds: [],
  title: "Insert document reference",
  description: "Pick a wiki document in this operation.",
  onPick: null,
  openPicker: ({
    operationId,
    excludeIds,
    title,
    description,
    onPick,
  }) =>
    set({
      open: true,
      operationId,
      excludeIds: excludeIds ?? [],
      title: title ?? "Insert document reference",
      description:
        description ?? "Pick a wiki document in this operation.",
      onPick,
    }),
  closePicker: () =>
    set({
      open: false,
      operationId: "",
      excludeIds: [],
      onPick: null,
    }),
}))

/** Imperative entry point — same shape regardless of which surface opens it. */
// eslint-disable-next-line react-refresh/only-export-components
export function openWikiDocumentPicker(args: OpenArgs) {
  useWikiDocumentPickerStore.getState().openPicker(args)
}

export function WikiDocumentPickerDialog() {
  const open = useWikiDocumentPickerStore((s) => s.open)
  const title = useWikiDocumentPickerStore((s) => s.title)
  const description = useWikiDocumentPickerStore((s) => s.description)
  const closePicker = useWikiDocumentPickerStore((s) => s.closePicker)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closePicker()
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileTextIcon className="size-4" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open ? (
          <PickerErrorBoundary onClose={closePicker}>
            <PickerBody />
          </PickerErrorBoundary>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

// Row height estimate used by the virtualizer. Real rows are measured via
// `measureElement` so this only matters for the initial scrollbar sizing —
// icon + title + optional breadcrumb lands at ~52px in practice.
const ROW_HEIGHT = 52

// Fetch one page of this size. The picker shows ~5 rows before scrolling
// (max-h-72 ≈ 288px / ROW_HEIGHT), so this is enough to fill the visible
// window and have a few rows in reserve. Server-side scaling — the query
// already paginates.
const PAGE_SIZE = 30

// How close to the tail we trigger the next-page fetch (in row indices).
// Smaller = later fetch (more chance of the user seeing a loading row);
// larger = earlier fetch (smoother scroll).
const PREFETCH_THRESHOLD = 8

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function PickerBody() {
  const operationId = useWikiDocumentPickerStore((s) => s.operationId)
  const excludeIds = useWikiDocumentPickerStore((s) => s.excludeIds)
  const onPick = useWikiDocumentPickerStore((s) => s.onPick)
  const closePicker = useWikiDocumentPickerStore((s) => s.closePicker)

  const [search, setSearch] = useState("")
  const debounced = useDebounced(search.trim(), 180)

  const {
    data,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useWikiDocuments({
    operationId,
    search: debounced || null,
    first: PAGE_SIZE,
  })

  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds])

  // Flatten paginated edges into a single row list. Server already sorts
  // and filters — no client-side ranking pass.
  const rows = useMemo(
    () =>
      data?.pages.flatMap((p) =>
        p.wikiDocuments.edges.map((e) => e.node),
      ) ?? [],
    [data],
  )

  // rawActiveIndex is the last cursor value the user expressed via keyboard
  // or hover. The render path always reads `activeIndex` (derived below) so
  // a shrinking filtered set never points past the end.
  const [rawActiveIndex, setRawActiveIndex] = useState(0)
  const activeIndex =
    rows.length === 0
      ? 0
      : Math.min(Math.max(0, rawActiveIndex), rows.length - 1)

  // Reset cursor to the top whenever the search string changes — otherwise a
  // narrower result set would leave the cursor stranded in the middle.
  useEffect(() => {
    setRawActiveIndex(0)
  }, [debounced])

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  })

  // Keep the keyboard-active row in view. align: "auto" is a no-op when the
  // row is already visible.
  useEffect(() => {
    if (rows.length === 0) return
    virtualizer.scrollToIndex(activeIndex, { align: "auto" })
  }, [activeIndex, rows.length, virtualizer])

  // Pagination trigger: when the last rendered virtual row is within
  // PREFETCH_THRESHOLD of the end of the current set, fetch the next page.
  // Gated on hasNextPage and !isFetchingNextPage so we don't spam-call the
  // hook (it's idempotent but the extra render churn is wasted).
  const virtualItems = virtualizer.getVirtualItems()
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return
    if (virtualItems.length === 0) return
    const lastIndex = virtualItems[virtualItems.length - 1].index
    if (lastIndex >= rows.length - PREFETCH_THRESHOLD) {
      fetchNextPage()
    }
  }, [
    virtualItems,
    rows.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ])

  function pick(doc: PickedWikiDocument) {
    if (excludeSet.has(doc.id)) return
    if (!onPick) {
      closePicker()
      return
    }
    onPick(doc)
    closePicker()
  }

  // Helpers re-bound the stored rawActiveIndex against the current rows so
  // arrow-key navigation after a filter change moves from the bounded cursor.
  function clamp(i: number): number {
    if (rows.length === 0) return 0
    return Math.min(Math.max(0, i), rows.length - 1)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setRawActiveIndex((i) => {
        const cur = clamp(i)
        for (let next = cur + 1; next < rows.length; next++) {
          if (!excludeSet.has(rows[next].id)) return next
        }
        return cur
      })
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setRawActiveIndex((i) => {
        const cur = clamp(i)
        for (let next = cur - 1; next >= 0; next--) {
          if (!excludeSet.has(rows[next].id)) return next
        }
        return cur
      })
    } else if (e.key === "Enter") {
      e.preventDefault()
      const doc = rows[activeIndex]
      if (doc) pick(doc)
    } else if (e.key === "Escape") {
      e.preventDefault()
      closePicker()
    }
  }

  const showInitialLoading = isLoading && rows.length === 0
  const showEmpty = !isLoading && rows.length === 0

  return (
    // min-w-0 propagates so a long, unbreakable title can shrink past its
    // intrinsic size and `truncate` kicks in. Without it grid items default
    // to min-width: auto (=content width) and the row pushes past max-w.
    <div className="flex min-w-0 flex-col gap-2">
      <div className="relative min-w-0">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search documents by title…"
          className="pl-8"
        />
      </div>
      <div
        ref={scrollRef}
        className="max-h-72 min-w-0 overflow-x-hidden overflow-y-auto rounded-md border bg-card"
      >
        {showInitialLoading ? (
          <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
            <LoaderIcon className="size-3 animate-spin" />
            Loading…
          </div>
        ) : showEmpty ? (
          <div className="p-3 text-sm text-muted-foreground">
            {search.trim()
              ? "No documents match this search."
              : "No documents in this operation yet."}
          </div>
        ) : (
          <div
            style={{ height: virtualizer.getTotalSize() }}
            className="relative w-full"
          >
            {virtualItems.map((item) => {
              const d = rows[item.index]
              if (!d) return null
              const isActive = item.index === activeIndex
              const isExcluded = excludeSet.has(d.id)
              return (
                <button
                  key={d.id}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  type="button"
                  disabled={isExcluded}
                  onMouseEnter={() =>
                    !isExcluded && setRawActiveIndex(item.index)
                  }
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(d)}
                  aria-selected={isActive}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${item.start}px)`,
                  }}
                  className={cn(
                    "flex w-full min-w-0 items-start gap-2 border-b px-3 py-2 text-left text-sm outline-hidden last:border-b-0",
                    isExcluded
                      ? "cursor-not-allowed text-muted-foreground"
                      : isActive
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/60",
                  )}
                >
                  <DocumentIcon
                    emoji={d.emoji}
                    icon={d.icon}
                    color={d.color}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">
                      {d.title || "Untitled"}
                    </span>
                    {d.ancestors.length > 0 && (
                      <WikiAncestorBreadcrumb
                        ancestors={d.ancestors}
                        className="truncate"
                      />
                    )}
                  </span>
                  {isExcluded && (
                    <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">
                      already linked
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}
        {isFetchingNextPage && (
          <div className="flex items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
            <LoaderIcon className="size-3 animate-spin" />
            Loading more…
          </div>
        )}
      </div>
    </div>
  )
}

// Local error boundary. The picker dialog mounts at the app level — without
// this, a render error in the body would unwind the whole app and the user
// would see a blank screen with no clue what went wrong.
interface PickerErrorBoundaryProps {
  onClose: () => void
  children: ReactNode
}

interface PickerErrorBoundaryState {
  error: Error | null
}

class PickerErrorBoundary extends Component<
  PickerErrorBoundaryProps,
  PickerErrorBoundaryState
> {
  state: PickerErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): PickerErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "[WikiDocumentPickerDialog] render error:",
      error,
      info.componentStack,
    )
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <p className="font-medium text-destructive">
            Document picker crashed
          </p>
          <pre className="max-h-40 overflow-auto text-xs text-destructive/80">
            {this.state.error.message}
            {this.state.error.stack ? `\n\n${this.state.error.stack}` : ""}
          </pre>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null })
                this.props.onClose()
              }}
              className="rounded-md border bg-background px-3 py-1 text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
