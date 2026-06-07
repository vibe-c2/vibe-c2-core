import { useMemo } from "react"
import {
  PlusIcon,
  FilterIcon,
  DownloadIcon,
  Loader2Icon,
  SlidersHorizontalIcon,
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
import { Switch } from "@/components/ui/switch"
import { TagFilterPanel } from "@/components/findings/tag-filter-panel"
import { useCredentialStore } from "@/stores/credentials"
import { useCredentialExport } from "@/hooks/use-credential-export"
import {
  useCredentialTags,
  useMyCredentialTags,
} from "@/graphql/hooks/credentials"
import type { CredentialType } from "@/graphql/gql/graphql"
import {
  CREDENTIAL_TYPES,
  credentialTypeLabel,
} from "@/components/findings/credential-type-utils"
import type { FindingsMode } from "@/components/findings/findings-mode"
import { OperationMultiSelect } from "@/components/findings/operation-multi-select"
import { useFindingsOpsParam } from "@/hooks/use-findings-ops-param"
import {
  CREDENTIAL_SEARCH_FIELDS,
  credentialSearchFieldLabel,
  describeSearchFields,
} from "@/components/findings/credential-search-fields"
import type { CredentialSearchField } from "@/graphql/gql/graphql"

const ALL_TYPES_VALUE = "__all__"

interface CredentialsToolbarProps {
  mode: FindingsMode
}

export function CredentialsToolbar({ mode }: CredentialsToolbarProps) {
  const filters = useCredentialStore((s) => s.filters)
  const setSearch = useCredentialStore((s) => s.setSearch)
  const setSearchFields = useCredentialStore((s) => s.setSearchFields)
  const setType = useCredentialStore((s) => s.setType)
  const toggleTag = useCredentialStore((s) => s.toggleTag)
  const setTags = useCredentialStore((s) => s.setTags)
  const setValidOnly = useCredentialStore((s) => s.setValidOnly)
  const openCreate = useCredentialStore((s) => s.openCreateDialog)

  // Each branch only fetches when its mode is active; the other hook stays
  // disabled. React Query's `enabled` flag gates the network call.
  const scopedTags = useCredentialTags(
    mode.kind === "scoped" ? mode.operationId : "",
  )
  const myTags = useMyCredentialTags(
    mode.kind === "global" ? mode.operationIds : null,
    { enabled: mode.kind === "global" },
  )
  const tagsData = mode.kind === "scoped" ? scopedTags.data : myTags.data
  const availableTags = useMemo(() => {
    if (!tagsData) return []
    return "credentialTags" in tagsData
      ? tagsData.credentialTags
      : tagsData.myCredentialTags
  }, [tagsData])

  // Toggle semantics: switch ON = hide invalid (default), switch OFF = show
  // both. We deliberately don't expose "only invalid" here to keep the
  // toolbar simple; the backend still accepts that mode if ever needed.
  const showInvalid = filters.validOnly === null
  function onShowInvalidChange(next: boolean) {
    setValidOnly(next ? null : true)
  }

  // Search-field toggle semantics. The store keeps an empty list as the
  // canonical "all fields" state, but the picker shows every box checked in
  // that state — so a click there means "deselect this one, keep the rest".
  // We resolve the empty list to the full set, flip the clicked field, then
  // re-normalize: a full set collapses back to empty, and deselecting the last
  // remaining field also resets to "all" (searching zero fields is a dead end).
  function onToggleSearchField(field: CredentialSearchField) {
    const effective =
      filters.searchFields.length > 0
        ? filters.searchFields
        : CREDENTIAL_SEARCH_FIELDS
    const next = effective.includes(field)
      ? effective.filter((f) => f !== field)
      : [...effective, field]
    setSearchFields(
      next.length === 0 || next.length === CREDENTIAL_SEARCH_FIELDS.length
        ? []
        : next,
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {mode.kind === "global" && <GlobalOperationPicker />}
      <div className="flex w-full max-w-md items-center gap-1.5">
        <SearchInput
          value={filters.search}
          onValueChange={setSearch}
          placeholder={`Search ${describeSearchFields(filters.searchFields)}...`}
          className="relative min-w-0 flex-1"
        />
        <SearchFieldsPicker
          selected={filters.searchFields}
          onToggle={onToggleSearchField}
          onReset={() => setSearchFields([])}
        />
      </div>

      <Select
        value={filters.type ?? ALL_TYPES_VALUE}
        onValueChange={(v) =>
          setType(v === ALL_TYPES_VALUE ? null : (v as CredentialType))
        }
      >
        <SelectTrigger className="min-w-[10rem]">
          <SelectValue placeholder="All types">
            {(v) =>
              !v || v === ALL_TYPES_VALUE
                ? "All types"
                : credentialTypeLabel(v as CredentialType)
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_TYPES_VALUE}>All types</SelectItem>
          {CREDENTIAL_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {credentialTypeLabel(t)}
            </SelectItem>
          ))}
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
            itemNoun="credentials"
          />
        </PopoverContent>
      </Popover>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <Switch
          checked={showInvalid}
          onCheckedChange={onShowInvalidChange}
        />
        Show invalid
      </label>

      {/* Credentials are created against a specific operation. In scoped mode
          the parent passes the op id straight to the dialog. In global mode
          the dialog renders an inline op picker so the user can choose. */}
      <div className="ms-auto flex items-center gap-2">
        <ExportMenu mode={mode} />
        <Button onClick={openCreate}>
          <PlusIcon className="size-4" />
          Add credential
        </Button>
      </div>
    </div>
  )
}

// Lets the user scope the text search to specific credential fields. An empty
// selection means "search all fields" — the backend default — so the trigger
// badge and the placeholder both reflect that. Kept adjacent to the search
// input so the relationship between the query and its target fields is obvious.
function SearchFieldsPicker({
  selected,
  onToggle,
  onReset,
}: {
  selected: readonly CredentialSearchField[]
  onToggle: (field: CredentialSearchField) => void
  onReset: () => void
}) {
  const isScoped = selected.length > 0
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            title="Choose which fields the search matches"
            aria-label="Search fields"
          >
            <SlidersHorizontalIcon className="size-4" />
            {isScoped && (
              <Badge variant="secondary" className="ml-1">
                {selected.length}
              </Badge>
            )}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-56 p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-sm font-medium">Search in</span>
          {isScoped && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onReset}
              className="h-7 px-2 text-xs"
            >
              All fields
            </Button>
          )}
        </div>
        <div className="py-1">
          {CREDENTIAL_SEARCH_FIELDS.map((field) => {
            // Empty selection = all fields active; render every box checked so
            // the default state reads as "searching everything", not "nothing".
            const active = !isScoped || selected.includes(field)
            return (
              <button
                key={field}
                type="button"
                onClick={() => onToggle(field)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:outline-none"
              >
                <Checkbox
                  checked={active}
                  tabIndex={-1}
                  aria-hidden
                  className="pointer-events-none"
                />
                <span>{credentialSearchFieldLabel(field)}</span>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Export the current (filtered) credential set as JSON or CSV. Paginates
// through the same `credentials` / `myCredentials` query the table uses, so
// authorization and filter semantics are identical to what's on screen.
function ExportMenu({ mode }: { mode: FindingsMode }) {
  const { exportCredentials, isExporting, progress } = useCredentialExport(mode)
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
        <DropdownMenuItem onClick={() => exportCredentials("json")}>
          Export as JSON
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportCredentials("csv")}>
          Export as CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Thin wrapper so the URL hook is only subscribed to from inside the toolbar
// when we're actually in global mode (the parent GlobalCredentialsTab is the
// other consumer; both observe the same source of truth — react-router params).
function GlobalOperationPicker() {
  const { operationIds, setOperationIds } = useFindingsOpsParam()
  return <OperationMultiSelect value={operationIds} onChange={setOperationIds} />
}
