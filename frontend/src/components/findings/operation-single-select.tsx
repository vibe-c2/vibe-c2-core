import { useCallback, useEffect, useMemo, useState } from "react"
import { Virtuoso } from "react-virtuoso"
import { CheckIcon, LoaderIcon, SearchIcon, SwordsIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useInfiniteOperations } from "@/graphql/hooks/operations"

export interface OperationSinglePickerValue {
  id: string
  name: string
}

interface OperationSinglePickerProps {
  value: OperationSinglePickerValue | null
  onChange: (op: OperationSinglePickerValue) => void
  placeholder?: string
  className?: string
}

// Single-select operation picker for dialog contexts. Pairs with the
// multi-select used in the global Findings toolbar — same Virtuoso-backed
// infinite list + search, but commits a single op and closes on selection.
// Used by the global-mode "Add credential" flow so the user can choose the
// target op without leaving the dialog.
export function OperationSinglePicker({
  value,
  onChange,
  placeholder = "Select operation",
  className,
}: OperationSinglePickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } =
    useInfiniteOperations({ search: debouncedSearch || null, first: 20 })

  const operations = useMemo(
    () =>
      data?.pages.flatMap((page) => page.operations.edges.map((e) => e.node)) ??
      [],
    [data],
  )

  // Reset search when popover opens.
  const [lastOpen, setLastOpen] = useState(open)
  if (lastOpen !== open) {
    setLastOpen(open)
    if (open) {
      setSearch("")
      setDebouncedSearch("")
    }
  }

  const inputCallbackRef = useCallback((node: HTMLInputElement | null) => {
    if (node) node.focus()
  }, [])

  function selectOp(op: OperationSinglePickerValue) {
    onChange({ id: op.id, name: op.name })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn("justify-start gap-2 font-normal", className)}
            type="button"
          >
            <SwordsIcon className="size-4 text-muted-foreground" />
            <span className="truncate">
              {value ? value.name : placeholder}
            </span>
          </Button>
        }
      />

      <PopoverContent
        className="w-(--anchor-width)! min-w-72 p-1.5 overflow-hidden"
        side="bottom"
        align="start"
        sideOffset={4}
      >
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
              const active = value?.id === op.id
              return (
                <button
                  key={op.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-sm",
                    "hover:bg-accent/50",
                  )}
                  onClick={() => selectOp(op)}
                >
                  <SwordsIcon className="size-4 shrink-0 text-muted-foreground" />
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
                  {active && (
                    <CheckIcon className="size-3.5 shrink-0 text-primary" />
                  )}
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
