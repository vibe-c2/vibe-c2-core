import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { TaskFieldsFragment } from "@/graphql/gql/graphql"

// Estimated row height for the initial virtual measurement. Real heights
// vary per card (badges, assignees, references all push it taller), so
// the virtualizer falls back to measureElement on first render. Setting
// this close to the average avoids a noisy jump on first paint.
const ROW_ESTIMATE = 96

// Trigger the next-page fetch when the last rendered virtual item is
// within this many rows of the loaded set's end. 6 is roughly one
// viewport at average card height, which keeps the scroll feeling
// pre-loaded without burning bandwidth on initial mount.
const PREFETCH_THRESHOLD = 6

interface VirtualTaskListProps {
  tasks: TaskFieldsFragment[]
  renderItem: (task: TaskFieldsFragment) => ReactNode
  hasNextPage: boolean
  isFetchingNextPage: boolean
  isLoading: boolean
  fetchNextPage: () => void
  // emptyMessage shows when the list has loaded and is empty. Allows the
  // column / quadrant to phrase its own zero state ("Drop a task here" vs
  // "No tasks").
  emptyMessage: ReactNode
  // isOver renders a subtle highlight on the scroll container. The parent
  // (kanban column) gets this from useDroppable so the drop affordance
  // covers the whole column body, not just the cards inside.
  isOver?: boolean
  // lanes turns the list into a virtualized grid with N parallel columns.
  // Items flow lane-by-lane in source order (lane 0 takes index 0/N/2N,
  // lane 1 takes 1/N+1/2N+1, etc.). The kanban columns use lanes=1
  // (single-column list); the matrix quadrants use lanes=2 to match the
  // pre-virtualization sm:grid-cols-2 layout.
  lanes?: number
  className?: string
}

// VirtualTaskList renders a virtualized, infinite-scrolling list of tasks
// used by both the kanban column body and each matrix quadrant.
//
// Forwarding the scroll-container ref outwards lets the parent compose it
// with dnd-kit's setNodeRef so the same DOM node is the scroll viewport,
// the drop target, and the size reference for the virtualizer. Without
// this composition the droppable would either miss empty-column drops or
// the scroll bar would live on a different element than the drop target.
export const VirtualTaskList = forwardRef<HTMLDivElement, VirtualTaskListProps>(
  function VirtualTaskList(
    {
      tasks,
      renderItem,
      hasNextPage,
      isFetchingNextPage,
      isLoading,
      fetchNextPage,
      emptyMessage,
      isOver = false,
      lanes = 1,
      className,
    },
    forwardedRef,
  ) {
    const localRef = useRef<HTMLDivElement | null>(null)

    // Compose the forwarded ref (from the column's useDroppable) with the
    // local ref the virtualizer needs. Callback ref runs on every render
    // that changes the DOM node, which is exactly what useVirtualizer's
    // getScrollElement reads via the same closure.
    const setRef = useCallback(
      (node: HTMLDivElement | null) => {
        localRef.current = node
        if (typeof forwardedRef === "function") {
          forwardedRef(node)
        } else if (forwardedRef) {
          forwardedRef.current = node
        }
      },
      [forwardedRef],
    )

    const virtualizer = useVirtualizer({
      count: tasks.length,
      getScrollElement: () => localRef.current,
      estimateSize: () => ROW_ESTIMATE,
      overscan: 6,
      // Multi-lane mode arranges items into N parallel columns. The
      // virtualizer assigns each item to a lane (item.lane) and tracks
      // a separate vertical offset per lane so columns with taller cards
      // don't push their sibling column out of alignment.
      lanes,
      // Stable item key so DnD-driven re-orders don't unmount + remount
      // the wrong row while the virtualizer is mid-measure.
      getItemKey: (index) => tasks[index]?.id ?? index,
    })

    const virtualItems = virtualizer.getVirtualItems()

    // Trigger the next page fetch as soon as the last rendered item is
    // close to the end of the loaded set. Guarded against double-firing
    // by the inflight check.
    useEffect(() => {
      if (!hasNextPage || isFetchingNextPage) return
      const last = virtualItems[virtualItems.length - 1]
      if (!last) return
      if (last.index >= tasks.length - PREFETCH_THRESHOLD) {
        fetchNextPage()
      }
    }, [virtualItems, tasks.length, hasNextPage, isFetchingNextPage, fetchNextPage])

    // Empty / loading states get rendered as a centered message instead
    // of an empty virtual list — both because the virtualizer has nothing
    // to measure and because the message is the meaningful UI when there
    // are no cards.
    const showSpinner = isLoading && tasks.length === 0
    const showEmpty = !isLoading && tasks.length === 0

    const totalSize = virtualizer.getTotalSize()
    const widthPct = 100 / lanes

    return (
      <div
        ref={setRef}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto p-2 transition-colors",
          isOver && "bg-accent/40",
          className,
        )}
      >
        {showSpinner && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2Icon className="size-3 animate-spin" />
            Loading…
          </div>
        )}
        {showEmpty && (
          <div className="px-1 py-4 text-center text-xs text-muted-foreground">
            {emptyMessage}
          </div>
        )}
        {!showSpinner && !showEmpty && (
          <div style={{ height: totalSize }} className="relative w-full">
            {virtualItems.map((item) => {
              const task = tasks[item.index]
              if (!task) return null
              // In multi-lane mode the virtualizer assigns each item a
              // lane index; we slice the container width evenly and place
              // the item in its lane's column. paddingRight gives the
              // inter-column gutter for all lanes except the last so the
              // outer edges stay flush with the scroll container.
              const isLastLane = item.lane === lanes - 1
              return (
                <div
                  key={item.key}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: `${item.lane * widthPct}%`,
                    width: `${widthPct}%`,
                    transform: `translateY(${item.start}px)`,
                    paddingBottom: 8,
                    paddingRight: isLastLane ? 0 : 8,
                  }}
                >
                  {renderItem(task)}
                </div>
              )
            })}
            {isFetchingNextPage && (
              <div
                style={{
                  position: "absolute",
                  top: totalSize,
                  left: 0,
                  right: 0,
                }}
                className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground"
              >
                <Loader2Icon className="size-3 animate-spin" />
                Loading more…
              </div>
            )}
          </div>
        )}
      </div>
    )
  },
)
