import { useMemo, useState } from "react"
import { useTheme } from "next-themes"
import data from "@emoji-mart/data"
import Picker from "@emoji-mart/react"
import { SearchIcon, XIcon } from "lucide-react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import {
  ALL_LUCIDE_NAMES,
  ICON_CATALOG,
  ICON_LOOKUP,
  type IconEntry,
} from "@/components/wiki/icon-catalog"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { useWikiStore, type IconPickerTab } from "@/stores/wiki"
import { cn } from "@/lib/utils"

export interface DocumentIconValue {
  emoji: string
  icon: string
}

interface DocumentIconPickerProps {
  value: DocumentIconValue
  /** Always receives both fields — the unset side is empty string. Caller can pass straight to UpdateWikiDocumentInput. */
  onSelect: (value: DocumentIconValue) => void
  disabled?: boolean
  /** Controlled open state (used by tree node context menu). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function DocumentIconPicker({
  value,
  onSelect,
  disabled,
  open: controlledOpen,
  onOpenChange,
}: DocumentIconPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const { resolvedTheme } = useTheme()

  const isOpen = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  const lastIconPickerTab = useWikiStore((s) => s.lastIconPickerTab)
  const setLastIconPickerTab = useWikiStore((s) => s.setLastIconPickerTab)

  // Default tab on open: whichever side the current value is on, falling back
  // to the user's last-used tab when both sides are empty.
  const defaultTab: IconPickerTab = value.icon
    ? "icons"
    : value.emoji
      ? "emoji"
      : lastIconPickerTab

  function handleEmojiPick(native: string) {
    onSelect({ emoji: native, icon: "" })
    setLastIconPickerTab("emoji")
    setOpen(false)
  }

  function handleIconPick(name: string) {
    onSelect({ emoji: "", icon: name })
    setLastIconPickerTab("icons")
    setOpen(false)
  }

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            className="shrink-0 text-base"
          />
        }
      >
        <DocumentIcon emoji={value.emoji} icon={value.icon} />
      </PopoverTrigger>
      <PopoverContent
        className="w-[352px] border-none p-2 shadow-lg"
        align="start"
      >
        <Tabs defaultValue={defaultTab}>
          <TabsList className="mb-2 w-full">
            <TabsTrigger value="emoji" className="flex-1">
              Emoji
            </TabsTrigger>
            <TabsTrigger value="icons" className="flex-1">
              Icons
            </TabsTrigger>
          </TabsList>
          <TabsContent value="emoji" className="flex justify-center">
            <Picker
              data={data}
              onEmojiSelect={(e: { native: string }) => handleEmojiPick(e.native)}
              theme={resolvedTheme === "dark" ? "dark" : "light"}
              previewPosition="none"
              skinTonePosition="none"
            />
          </TabsContent>
          <TabsContent value="icons">
            <IconGrid selectedName={value.icon} onPick={handleIconPick} />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  )
}

interface IconGridProps {
  selectedName: string
  onPick: (name: string) => void
}

// Cap on the "More icons" section so a query like "a" doesn't try to lazy-load
// hundreds of icons at once. Users can refine the search to narrow further.
const EXTENDED_RESULTS_LIMIT = 64

function IconGrid({ selectedName, onPick }: IconGridProps) {
  const [search, setSearch] = useState("")

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return ICON_CATALOG
    return ICON_CATALOG.map((group) => ({
      ...group,
      icons: group.icons.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.keywords.some((k) => k.includes(q)),
      ),
    })).filter((g) => g.icons.length > 0)
  }, [search])

  // Extended results: full lucide set, search-only, capped, excluding curated
  // catalog hits already shown above. Each result lazy-loads on first render
  // via DocumentIcon's Suspense boundary.
  const extendedResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return { names: [] as string[], truncated: false }
    const names: string[] = []
    let total = 0
    for (const name of ALL_LUCIDE_NAMES.keys()) {
      if (ICON_LOOKUP[name]) continue
      if (!name.toLowerCase().includes(q)) continue
      total++
      if (names.length < EXTENDED_RESULTS_LIMIT) names.push(name)
    }
    return { names, truncated: total > names.length }
  }, [search])

  const totalShown =
    filteredGroups.reduce((n, g) => n + g.icons.length, 0) +
    extendedResults.names.length

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search icons…"
          className="h-8 px-7 text-sm"
        />
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearch("")}
            className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        )}
      </div>
      <div className="max-h-72 overflow-y-auto pr-1">
        {totalShown === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            No icons match "{search}".
          </p>
        ) : (
          <>
            {filteredGroups.map((group) => (
              <div key={group.label} className="mb-3 last:mb-0">
                <h4 className="mb-1 px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </h4>
                <div className="grid grid-cols-8 gap-0.5">
                  {group.icons.map((entry) => (
                    <IconButton
                      key={entry.name}
                      entry={entry}
                      selected={entry.name === selectedName}
                      onPick={onPick}
                    />
                  ))}
                </div>
              </div>
            ))}
            {extendedResults.names.length > 0 && (
              <div className="mb-3 last:mb-0">
                <h4 className="mb-1 px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  More icons
                  {extendedResults.truncated && (
                    <span className="ml-1.5 normal-case text-muted-foreground/70">
                      (top {EXTENDED_RESULTS_LIMIT} — refine to see more)
                    </span>
                  )}
                </h4>
                <div className="grid grid-cols-8 gap-0.5">
                  {extendedResults.names.map((name) => (
                    <ExtendedIconButton
                      key={name}
                      name={name}
                      selected={name === selectedName}
                      onPick={onPick}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

interface IconButtonProps {
  entry: IconEntry
  selected: boolean
  onPick: (name: string) => void
}

function IconButton({ entry, selected, onPick }: IconButtonProps) {
  const Icon = entry.component
  return (
    <button
      type="button"
      aria-label={entry.name}
      title={entry.name}
      onClick={() => onPick(entry.name)}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted",
        selected && "bg-primary/10 text-primary ring-1 ring-primary",
      )}
    >
      <Icon size={20} />
    </button>
  )
}

interface ExtendedIconButtonProps {
  name: string
  selected: boolean
  onPick: (name: string) => void
}

/**
 * Renders an icon from the lazy lucide registry. Each <DocumentIcon> creates
 * its own Suspense boundary, so a slow chunk for one icon doesn't block the
 * rest of the grid from rendering.
 */
function ExtendedIconButton({
  name,
  selected,
  onPick,
}: ExtendedIconButtonProps) {
  return (
    <button
      type="button"
      aria-label={name}
      title={name}
      onClick={() => onPick(name)}
      className={cn(
        "flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted",
        selected && "bg-primary/10 text-primary ring-1 ring-primary",
      )}
    >
      <DocumentIcon icon={name} size={20} />
    </button>
  )
}
