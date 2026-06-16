import { useEffect, useRef, useState } from "react"
import { useConnectionNodes } from "@/hooks/use-connection-nodes"
import { SearchIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { HostIcon } from "@/components/findings/host-icon"
import { hostAddresses } from "@/components/findings/host-address-utils"
import { useInfiniteHosts } from "@/graphql/hooks/hosts"
import { cn } from "@/lib/utils"

/**
 * Searchable host list with keyboard navigation and infinite scroll. Mirrors
 * {@link HashPickerList} so the wiki "Insert host reference" picker reads
 * identically to the hash / credential ones. The search input is owned by the
 * caller. Each row shows the host's own glyph (emoji / icon / OS-derived) plus
 * its first IP address for disambiguation.
 */
interface HostPickerListProps {
  operationId: string
  search: string
  onSearchChange: (search: string) => void
  onPick: (hostId: string) => void
}

export function HostPickerList({
  operationId,
  search,
  onSearchChange,
  onPick,
}: HostPickerListProps) {
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
    useInfiniteHosts({
      operationId,
      search: debounced || null,
      first: 20,
    })

  const hosts = useConnectionNodes(data, (p) => p.hosts)

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(hosts.length - 1, 0)))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const h = hosts[activeIndex]
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
          placeholder="Search hosts by name…"
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
        {isLoading && hosts.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">Loading…</div>
        ) : hosts.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">
            {debounced
              ? "No hosts match this search."
              : "No hosts in this operation yet."}
          </div>
        ) : (
          hosts.map((h, i) => {
            const isActive = i === activeIndex
            const addr = hostAddresses(h)[0]
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
                <HostIcon
                  emoji={h.emoji}
                  icon={h.icon}
                  color={h.color}
                  os={h.os}
                  size={14}
                  className="shrink-0 text-muted-foreground"
                />
                <span
                  className="min-w-0 flex-1 truncate font-mono text-xs"
                  title={h.hostname}
                >
                  {h.hostname || "Unnamed host"}
                </span>
                {addr && (
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {addr}
                  </span>
                )}
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
