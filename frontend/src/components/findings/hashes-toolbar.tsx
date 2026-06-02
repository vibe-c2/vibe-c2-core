import { useMemo } from "react"
import {
  PlusIcon,
  FilterIcon,
  UploadIcon,
  DownloadIcon,
  Loader2Icon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SearchInput } from "@/components/ui/search-input"
import { TagFilterPanel } from "@/components/findings/tag-filter-panel"
import { useHashStore } from "@/stores/hashes"
import { useHashExport } from "@/hooks/use-hash-export"
import { useHashTags, useMyHashTags } from "@/graphql/hooks/hashes"
import {
  HASH_STATUSES,
  hashStatusLabel,
} from "@/components/findings/hash-status-utils"
import type { FindingsMode } from "@/components/findings/findings-mode"
import { OperationMultiSelect } from "@/components/findings/operation-multi-select"
import { useFindingsOpsParam } from "@/hooks/use-findings-ops-param"

const HAS_CRED_VALUES = {
  all: "__all__",
  cracked: "__cracked__",
  uncracked: "__uncracked__",
} as const

const HAS_CRED_LABELS: Record<string, string> = {
  [HAS_CRED_VALUES.all]: "All hashes",
  [HAS_CRED_VALUES.cracked]: "Cracked only",
  [HAS_CRED_VALUES.uncracked]: "Uncracked only",
}

interface HashesToolbarProps {
  mode: FindingsMode
}

export function HashesToolbar({ mode }: HashesToolbarProps) {
  const filters = useHashStore((s) => s.filters)
  const setSearch = useHashStore((s) => s.setSearch)
  const setStatuses = useHashStore((s) => s.setStatuses)
  const setHasCredential = useHashStore((s) => s.setHasCredential)
  const toggleTag = useHashStore((s) => s.toggleTag)
  const setTags = useHashStore((s) => s.setTags)
  const openCreate = useHashStore((s) => s.openCreateDialog)
  const openBulk = useHashStore((s) => s.openBulkImportDialog)

  const scopedTags = useHashTags(mode.kind === "scoped" ? mode.operationId : "")
  const myTags = useMyHashTags(
    mode.kind === "global" ? mode.operationIds : null,
    { enabled: mode.kind === "global" },
  )
  const tagsData = mode.kind === "scoped" ? scopedTags.data : myTags.data
  const availableTags = useMemo(() => {
    if (!tagsData) return []
    return "hashTags" in tagsData ? tagsData.hashTags : tagsData.myHashTags
  }, [tagsData])

  // Map the tri-state hasCredential filter to / from the single-select value.
  const hasCredValue =
    filters.hasCredential === true
      ? HAS_CRED_VALUES.cracked
      : filters.hasCredential === false
        ? HAS_CRED_VALUES.uncracked
        : HAS_CRED_VALUES.all

  function onHasCredChange(v: string | null) {
    if (v === HAS_CRED_VALUES.cracked) setHasCredential(true)
    else if (v === HAS_CRED_VALUES.uncracked) setHasCredential(false)
    else setHasCredential(null)
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {mode.kind === "global" && <GlobalOperationPicker />}
      <SearchInput
        value={filters.search}
        onValueChange={setSearch}
        placeholder="Search hash value or comment..."
        className="relative w-full max-w-md"
      />

      <Popover>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm">
              <FilterIcon className="size-4" />
              Status
              {filters.statuses.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {filters.statuses.length}
                </Badge>
              )}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-56 p-1">
          {HASH_STATUSES.map((s) => {
            const active = filters.statuses.includes(s)
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStatuses(
                    active
                      ? filters.statuses.filter((x) => x !== s)
                      : [...filters.statuses, s],
                  )
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <Checkbox
                  checked={active}
                  tabIndex={-1}
                  aria-hidden
                  className="pointer-events-none"
                />
                <span>{hashStatusLabel(s)}</span>
              </button>
            )
          })}
          {filters.statuses.length > 0 && (
            <div className="border-t pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStatuses([])}
                className="w-full justify-start text-xs"
              >
                Clear
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <Select value={hasCredValue} onValueChange={onHasCredChange}>
        <SelectTrigger className="min-w-[12rem]">
          <SelectValue>{(value: string) => HAS_CRED_LABELS[value] ?? value}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={HAS_CRED_VALUES.all}>All hashes</SelectItem>
          <SelectItem value={HAS_CRED_VALUES.cracked}>Cracked only</SelectItem>
          <SelectItem value={HAS_CRED_VALUES.uncracked}>Uncracked only</SelectItem>
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger
          render={
            <Button variant="outline" size="sm">
              <FilterIcon className="size-4" />
              Tags
              {filters.tags.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {filters.tags.length}
                </Badge>
              )}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-72 p-0">
          <TagFilterPanel
            availableTags={availableTags}
            selectedTags={filters.tags}
            onToggle={toggleTag}
            onClear={() => setTags([])}
            itemNoun="hashes"
          />
        </PopoverContent>
      </Popover>

      <div className="ms-auto flex items-center gap-2">
        {/* Bulk import only makes sense once a target operation is fixed.
            In global mode we hide the button rather than show a disabled-state
            tooltip because the action's destination would otherwise be
            ambiguous (which op to import into?). */}
        {mode.kind === "scoped" && (
          <Button variant="outline" onClick={openBulk}>
            <UploadIcon className="size-4" />
            Bulk import
          </Button>
        )}
        <ExportMenu mode={mode} />
        <Button onClick={openCreate}>
          <PlusIcon className="size-4" />
          Add hash
        </Button>
      </div>
    </div>
  )
}

// Export the current (filtered) hash set as JSON or CSV. Paginates through the
// same `hashes` / `myHashes` query the table uses, so authorization and filter
// semantics are identical to what's on screen. Mirrors the credentials toolbar.
function ExportMenu({ mode }: { mode: FindingsMode }) {
  const { exportHashes, isExporting, progress } = useHashExport(mode)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" disabled={isExporting}>
            {isExporting ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <DownloadIcon className="size-4" />
            )}
            {isExporting ? `Exporting ${progress}…` : "Export"}
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportHashes("json")}>
          Export as JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportHashes("csv")}>
          Export as CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function GlobalOperationPicker() {
  const { operationIds, setOperationIds } = useFindingsOpsParam()
  return <OperationMultiSelect value={operationIds} onChange={setOperationIds} />
}
