import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso"
import {
  CheckIcon,
  SwordsIcon,
  LoaderIcon,
  SearchIcon,
  TerminalSquareIcon,
  XIcon,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { useInfiniteOperations } from "@/graphql/hooks/operations"
import { useScopedOperationStore } from "@/stores/scoped-operation"

export function OperationSwitcher() {
  const scopedOperation = useScopedOperationStore((s) => s.scopedOperation)
  const scopeOperation = useScopedOperationStore((s) => s.scopeOperation)
  const unscopeOperation = useScopedOperationStore((s) => s.unscopeOperation)
  const { toggleSidebar, isMobile } = useSidebar()

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const virtuosoRef = useRef<VirtuosoHandle>(null)

  // Callback ref — focuses the search input when the popover mounts it.
  const inputCallbackRef = useCallback((node: HTMLInputElement | null) => {
    if (node) node.focus()
  }, [])

  // Debounce search — fires query 300ms after the user stops typing.
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timeout)
  }, [search])

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useInfiniteOperations({
    search: debouncedSearch || null,
    first: 20,
  })

  const operations = useMemo(
    () => data?.pages.flatMap((page) => page.operations.edges.map((e) => e.node)) ?? [],
    [data],
  )

  // Reset search and highlight when popover opens/closes.
  useEffect(() => {
    if (open) {
      setSearch("")
      setDebouncedSearch("")
      setHighlightedIndex(-1)
    }
  }, [open])

  // Reset highlight when operations list changes.
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [operations])

  // Scroll highlighted item into view via Virtuoso.
  useEffect(() => {
    if (highlightedIndex >= 0) {
      virtuosoRef.current?.scrollToIndex({ index: highlightedIndex, behavior: "auto" })
    }
  }, [highlightedIndex])

  function selectOperation(op: (typeof operations)[number]) {
    scopeOperation({ id: op.id, name: op.name, description: op.description })
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlightedIndex((prev) =>
        prev < operations.length - 1 ? prev + 1 : 0,
      )
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : operations.length - 1,
      )
    } else if (e.key === "Escape") {
      e.preventDefault()
      setOpen(false)
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (highlightedIndex >= 0 && highlightedIndex < operations.length) {
        selectOperation(operations[highlightedIndex])
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <SidebarMenuButton
            size="lg"
            tooltip={scopedOperation ? scopedOperation.name : "Vibe C2"}
          />
        }
      >
        {scopedOperation ? (
          <>
            <div
              className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                toggleSidebar()
              }}
            >
              <SwordsIcon className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{scopedOperation.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {scopedOperation.description || "Active operation"}
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                unscopeOperation()
              }}
              className="ml-auto flex size-6 items-center justify-center rounded-md text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
            >
              <XIcon className="size-3.5" />
            </button>
          </>
        ) : (
          <>
            <div
              className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground cursor-pointer"
              onClick={(e) => {
                e.stopPropagation()
                toggleSidebar()
              }}
            >
              <TerminalSquareIcon className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">Vibe C2</span>
              <span className="truncate text-xs text-muted-foreground">
                Command &amp; Control
              </span>
            </div>
          </>
        )}
      </PopoverTrigger>

      <PopoverContent
        className="!w-[var(--anchor-width)] p-1.5 overflow-hidden"
        side="bottom"
        align="start"
        sideOffset={4}
      >
        {/* Search input */}
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputCallbackRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search operations..."
            className="h-7 pl-7 text-xs"
          />
        </div>

        {/* Operations list */}
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <LoaderIcon className="size-3.5 animate-spin" />
          </div>
        )}

        {!isLoading && operations.length === 0 && (
          <div className="py-4 text-center text-sm text-muted-foreground">
            No operations found
          </div>
        )}

        {!isLoading && operations.length > 0 && (
          <Virtuoso
            ref={virtuosoRef}
            data={operations}
            style={{ height: "256px" }}
            endReached={() => {
              if (hasNextPage && !isFetchingNextPage) fetchNextPage()
            }}
            overscan={100}
            role="listbox"
            itemContent={(index, op) => {
              const isActive = scopedOperation?.id === op.id

              return (
                <button
                  key={op.id}
                  role="option"
                  aria-selected={index === highlightedIndex}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm",
                    index === highlightedIndex
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent/50",
                  )}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectOperation(op)
                  }}
                >
                  <SwordsIcon className="size-5 shrink-0 text-muted-foreground" />
                  <div className="grid flex-1 min-w-0 leading-tight">
                    <span className="truncate text-sm font-medium">{op.name}</span>
                    {op.description && (
                      <span className="truncate text-xs text-muted-foreground">
                        {op.description}
                      </span>
                    )}
                  </div>
                  {isActive && (
                    <CheckIcon className="size-3.5 shrink-0 text-primary" />
                  )}
                </button>
              )
            }}
            components={{
              Footer: () => {
                if (isFetchingNextPage) {
                  return (
                    <div className="flex items-center justify-center py-2">
                      <LoaderIcon className="size-3.5 animate-spin" />
                    </div>
                  )
                }
                return null
              },
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}
