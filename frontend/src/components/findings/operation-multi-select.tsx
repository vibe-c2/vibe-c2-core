import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useConnectionNodes } from "@/hooks/use-connection-nodes"
import { Virtuoso } from "react-virtuoso"
import { CheckIcon, LoaderIcon, SearchIcon, SwordsIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useInfiniteOperations } from "@/graphql/hooks/operations"

interface OperationMultiSelectProps {
  // null  ⇒ "All my operations" (the implicit, full membership set)
  // []    ⇒ Explicit empty selection
  // [...] ⇒ Caller-picked subset (operation IDs)
  value: string[] | null
  onChange: (next: string[] | null) => void
}

export function OperationMultiSelect({ value, onChange }: OperationMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Debounce search 300ms — same cadence as OperationSwitcher.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteOperations({ search: debouncedSearch || null, first: 20 })

  const operations = useConnectionNodes(data, (p) => p.operations)

  // Cached operation metadata so we can render a friendly trigger label even
  // when the currently-selected ids aren't in the current search page.
  const opsById = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>()
    for (const o of operations) m.set(o.id, { id: o.id, name: o.name })
    return m
  }, [operations])

  // Reset search when popover opens.
  const [lastOpen, setLastOpen] = useState(open)
  if (lastOpen !== open) {
    setLastOpen(open)
    if (open) {
      setSearch("")
      setDebouncedSearch("")
    }
  }

  // Focus search on open.
  const inputCallbackRef = useCallback((node: HTMLInputElement | null) => {
    inputRef.current = node
    if (node) node.focus()
  }, [])

  const isAll = value === null
  const selectedSet = useMemo(
    () => (Array.isArray(value) ? new Set(value) : new Set<string>()),
    [value],
  )

  function toggleOp(id: string) {
    if (isAll) {
      onChange([id])
      return
    }
    const next = new Set(selectedSet)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(Array.from(next))
  }

  function selectAll() {
    onChange(null)
  }

  function clearSelection() {
    onChange([])
  }

  const triggerLabel = (() => {
    if (isAll) return "All my operations"
    if (selectedSet.size === 0) return "No operations selected"
    if (selectedSet.size === 1) {
      const id = Array.from(selectedSet)[0]
      const op = opsById.get(id)
      return op?.name ?? "1 operation"
    }
    return `${selectedSet.size} operations`
  })()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="gap-2">
            <SwordsIcon className="size-4" />
            <span className="truncate max-w-[16rem]">{triggerLabel}</span>
            {!isAll && selectedSet.size > 0 && (
              <Badge variant="secondary" className="ml-1">
                {selectedSet.size}
              </Badge>
            )}
          </Button>
        }
      />

      <PopoverContent
        className="w-80 p-1.5 overflow-hidden"
        side="bottom"
        align="start"
        sideOffset={4}
      >
        {/* Search */}
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputCallbackRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search operations..."
            className="h-7 pl-7 text-xs"
          />
        </div>

        {/* All / Clear header row */}
        <div className="mt-1.5 flex items-center justify-between gap-1 px-1.5">
          <button
            type="button"
            onClick={selectAll}
            className={cn(
              "flex flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm",
              isAll ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
            )}
          >
            <span className="flex size-4 items-center justify-center">
              {isAll && <CheckIcon className="size-3.5 text-primary" />}
            </span>
            <span className="font-medium">All my operations</span>
          </button>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            disabled={isAll || selectedSet.size === 0}
            className="h-7 px-2 text-xs"
          >
            Clear
          </Button>
        </div>

        <div className="mt-1 h-px bg-border" />

        {/* List */}
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
            data={operations}
            style={{ height: "240px" }}
            endReached={() => {
              if (hasNextPage && !isFetchingNextPage) fetchNextPage()
            }}
            overscan={100}
            role="listbox"
            itemContent={(_, op) => {
              const checked = isAll ? false : selectedSet.has(op.id)
              return (
                // Single click target: a button that owns the toggle. The
                // Checkbox is a presentation-only indicator — `readOnly` keeps
                // base-ui from invoking its own toggle on click, which would
                // otherwise race with the button's onClick and cancel out.
                <button
                  type="button"
                  key={op.id}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm",
                    "hover:bg-accent/50",
                  )}
                  onClick={() => toggleOp(op.id)}
                >
                  <Checkbox
                    checked={checked}
                    readOnly
                    tabIndex={-1}
                    aria-hidden
                  />
                  <div className="grid flex-1 min-w-0 leading-tight">
                    <span className="truncate text-sm font-medium">
                      {op.name}
                    </span>
                    {op.description && (
                      <span className="truncate text-xs text-muted-foreground">
                        {op.description}
                      </span>
                    )}
                  </div>
                </button>
              )
            }}
            components={{
              Footer: () =>
                isFetchingNextPage ? (
                  <div className="flex items-center justify-center py-2">
                    <LoaderIcon className="size-3.5 animate-spin" />
                  </div>
                ) : null,
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}
