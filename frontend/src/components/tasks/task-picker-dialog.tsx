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
import { ClipboardListIcon, LoaderIcon, SearchIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useDebounced } from "@/hooks/use-debounced"
import { useInfiniteTasks } from "@/graphql/hooks/tasks"
import { TaskStageBadge, TaskStatusBadge } from "@/components/tasks/task-badges"
import type { TaskFieldsFragment } from "@/graphql/gql/graphql"
import { cn } from "@/lib/utils"

// Shape passed back to the caller on pick. Matches the subset of TaskFields
// every consuming surface needs — the wiki "Add to task" trigger uses
// `name` for the toast, the rest is there for completeness in case future
// callers want to render extra context post-pick.
export interface PickedTask {
  id: string
  name: string
  stage: TaskFieldsFragment["stage"]
  status: TaskFieldsFragment["status"]
}

interface OpenArgs {
  operationId: string
  /** Task IDs that should appear muted and reject clicks (e.g. tasks that
   *  already reference the current wiki document). */
  excludeIds?: string[]
  /** Optional override for the dialog title — defaults to "Link to a task". */
  title?: string
  /** Optional override for the dialog description. */
  description?: string
  onPick: (task: PickedTask) => void
}

interface PickerState {
  open: boolean
  operationId: string
  excludeIds: string[]
  title: string
  description: string
  onPick: ((task: PickedTask) => void) | null
  openPicker: (args: OpenArgs) => void
  closePicker: () => void
}

// Singleton store — same pattern as the wiki document picker. Any surface
// that needs to pick a task (today: the wiki editor's "Add to task"
// button; later potentially the timeline / matrix views) calls
// `openTaskPicker` to trigger it.
const useTaskPickerStore = create<PickerState>((set) => ({
  open: false,
  operationId: "",
  excludeIds: [],
  title: "Link to a task",
  description: "Pick a task in this operation.",
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
      title: title ?? "Link to a task",
      description: description ?? "Pick a task in this operation.",
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
export function openTaskPicker(args: OpenArgs) {
  useTaskPickerStore.getState().openPicker(args)
}

export function TaskPickerDialog() {
  const open = useTaskPickerStore((s) => s.open)
  const title = useTaskPickerStore((s) => s.title)
  const description = useTaskPickerStore((s) => s.description)
  const closePicker = useTaskPickerStore((s) => s.closePicker)

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
            <ClipboardListIcon className="size-4" />
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
// stage badge + name + status badge lands at ~44px in practice.
const ROW_HEIGHT = 44

// Fetch one page of this size. Matches the wiki picker — enough to fill the
// visible window (~5 rows in max-h-72) with a few in reserve.
const PAGE_SIZE = 30

// How close to the tail we trigger the next-page fetch (in row indices).
const PREFETCH_THRESHOLD = 8

function PickerBody() {
  const operationId = useTaskPickerStore((s) => s.operationId)
  const excludeIds = useTaskPickerStore((s) => s.excludeIds)
  const onPick = useTaskPickerStore((s) => s.onPick)
  const closePicker = useTaskPickerStore((s) => s.closePicker)

  const [search, setSearch] = useState("")
  const debounced = useDebounced(search.trim(), 180)

  const {
    data,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteTasks({
    operationId,
    search: debounced || null,
    first: PAGE_SIZE,
  })

  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds])

  // Flatten paginated edges into a single row list. Server already sorts
  // by createAt DESC and filters by name/description — no client ranking.
  const rows = useMemo(
    () =>
      data?.pages.flatMap((p) =>
        p.tasks.edges.map((e) => e.node),
      ) ?? [],
    [data],
  )

  const [rawActiveIndex, setRawActiveIndex] = useState(0)
  const activeIndex =
    rows.length === 0
      ? 0
      : Math.min(Math.max(0, rawActiveIndex), rows.length - 1)

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

  useEffect(() => {
    if (rows.length === 0) return
    virtualizer.scrollToIndex(activeIndex, { align: "auto" })
  }, [activeIndex, rows.length, virtualizer])

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

  function pick(task: PickedTask) {
    if (excludeSet.has(task.id)) return
    if (!onPick) {
      closePicker()
      return
    }
    onPick(task)
    closePicker()
  }

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
      const task = rows[activeIndex]
      if (task) {
        pick({
          id: task.id,
          name: task.name,
          stage: task.stage,
          status: task.status,
        })
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      closePicker()
    }
  }

  const showInitialLoading = isLoading && rows.length === 0
  const showEmpty = !isLoading && rows.length === 0

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="relative min-w-0">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search tasks by name or description…"
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
              ? "No tasks match this search."
              : "No tasks in this operation yet."}
          </div>
        ) : (
          <div
            style={{ height: virtualizer.getTotalSize() }}
            className="relative w-full"
          >
            {virtualItems.map((item) => {
              const t = rows[item.index]
              if (!t) return null
              const isActive = item.index === activeIndex
              const isExcluded = excludeSet.has(t.id)
              return (
                <button
                  key={t.id}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  type="button"
                  disabled={isExcluded}
                  onMouseEnter={() =>
                    !isExcluded && setRawActiveIndex(item.index)
                  }
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() =>
                    pick({
                      id: t.id,
                      name: t.name,
                      stage: t.stage,
                      status: t.status,
                    })
                  }
                  aria-selected={isActive}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${item.start}px)`,
                  }}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-2 border-b px-3 py-2 text-left text-sm outline-hidden last:border-b-0",
                    isExcluded
                      ? "cursor-not-allowed text-muted-foreground"
                      : isActive
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/60",
                  )}
                >
                  <TaskStageBadge stage={t.stage} />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {t.name || "Untitled"}
                  </span>
                  <TaskStatusBadge status={t.status} />
                  {isExcluded && (
                    <span className="shrink-0 text-xs text-muted-foreground">
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
      "[TaskPickerDialog] render error:",
      error,
      info.componentStack,
    )
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <p className="font-medium text-destructive">
            Task picker crashed
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
