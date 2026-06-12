import { useEffect, useRef, useState } from "react"
import { useConnectionNodes } from "@/hooks/use-connection-nodes"
import { HashIcon, SearchIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { useInfiniteHashes } from "@/graphql/hooks/hashes"
import {
  hashStatusBadgeClass,
  hashStatusLabel,
  truncateHashValue,
} from "@/components/findings/hash-status-utils"
import { cn } from "@/lib/utils"

/**
 * Searchable hash list with keyboard navigation and infinite scroll. Mirrors
 * {@link CredentialPickerList} so the wiki "Insert hash reference" picker reads
 * identically to the credential one. The search input is owned by the caller.
 */
interface HashPickerListProps {
  operationId: string
  search: string
  onSearchChange: (search: string) => void
  onPick: (hashId: string) => void
}

export function HashPickerList({
  operationId,
  search,
  onSearchChange,
  onPick,
}: HashPickerListProps) {
  const [debounced, setDebounced] = useState(search.trim())
  const [activeIndex, setActiveIndex] = useState(0)
  const activeItemRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 180)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  const [lastDebounced, setLastDebounced] = useState(debounced)
  if (lastDebounced !== debounced) {
    setLastDebounced(debounced)
    setActiveIndex(0)
  }

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useInfiniteHashes({
      operationId,
      search: debounced || null,
      first: 20,
    })

  const hashes = useConnectionNodes(data, (p) => p.hashes)

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(hashes.length - 1, 0)))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const h = hashes[activeIndex]
      if (h) onPick(h.id)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search hashes by value…"
          className="pl-8"
        />
      </div>
      <div
        className="max-h-72 overflow-y-auto rounded-md border bg-card"
        onScroll={(e) => {
          const el = e.currentTarget
          if (
            hasNextPage &&
            !isFetchingNextPage &&
            el.scrollTop + el.clientHeight >= el.scrollHeight - 32
          ) {
            void fetchNextPage()
          }
        }}
      >
        {isLoading && hashes.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">Loading…</div>
        ) : hashes.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">
            {debounced
              ? "No hashes match this search."
              : "No hashes in this operation yet."}
          </div>
        ) : (
          hashes.map((h, i) => {
            const isActive = i === activeIndex
            return (
              <button
                key={h.id}
                ref={(el) => {
                  if (isActive) activeItemRef.current = el
                }}
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(h.id)}
                aria-selected={isActive}
                className={cn(
                  "flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm outline-hidden last:border-b-0",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/60",
                )}
              >
                <HashIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span
                  className="min-w-0 flex-1 truncate font-mono text-xs"
                  title={h.value}
                >
                  {truncateHashValue(h.value)}
                </span>
                <Badge
                  variant="outline"
                  className={cn("shrink-0", hashStatusBadgeClass(h.status))}
                >
                  {hashStatusLabel(h.status)}
                </Badge>
              </button>
            )
          })
        )}
        {isFetchingNextPage && (
          <div className="p-2 text-center text-xs text-muted-foreground">
            Loading more…
          </div>
        )}
      </div>
    </div>
  )
}
