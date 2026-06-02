import { useMemo, useState } from "react"
import { SearchIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"

interface TagFilterPanelProps {
  availableTags: readonly string[]
  selectedTags: readonly string[]
  onToggle: (tag: string) => void
  onClear: () => void
  /** Noun shown in the empty-state hint, e.g. "credentials" or "hashes". */
  itemNoun?: string
}

// Renders tags as a searchable, scrollable list rather than a bubble cloud so
// operations with many tags stay manageable. Selected tags float to the top so
// the current filter set stays visible after the user scrolls. Shared by the
// credentials and hashes toolbars.
export function TagFilterPanel({
  availableTags,
  selectedTags,
  onToggle,
  onClear,
  itemNoun = "items",
}: TagFilterPanelProps) {
  const [query, setQuery] = useState("")
  const selectedSet = useMemo(() => new Set(selectedTags), [selectedTags])

  const filteredTags = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matching = q
      ? availableTags.filter((tag) => tag.toLowerCase().includes(q))
      : availableTags
    return [...matching].sort((a, b) => {
      const aSel = selectedSet.has(a)
      const bSel = selectedSet.has(b)
      if (aSel !== bSel) return aSel ? -1 : 1
      return a.localeCompare(b)
    })
  }, [availableTags, query, selectedSet])

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-sm font-medium">Filter by tag</span>
        {selectedTags.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="h-7 px-2 text-xs"
          >
            Clear ({selectedTags.length})
          </Button>
        )}
      </div>

      {availableTags.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          No tags yet. Add tags to {itemNoun} to filter by them.
        </p>
      ) : (
        <>
          <div className="relative border-b px-2 py-2">
            <SearchIcon className="absolute left-4 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search tags..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={query ? "pl-7 pr-7" : "pl-7"}
              autoFocus
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {filteredTags.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                No tags match "{query}".
              </p>
            ) : (
              filteredTags.map((tag) => {
                const active = selectedSet.has(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onToggle(tag)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
                  >
                    <Checkbox
                      checked={active}
                      tabIndex={-1}
                      aria-hidden
                      className="pointer-events-none"
                    />
                    <span className="truncate">{tag}</span>
                  </button>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}
