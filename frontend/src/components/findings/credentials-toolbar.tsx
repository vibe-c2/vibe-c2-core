import { useMemo, useState } from "react"
import { PlusIcon, FilterIcon, SearchIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
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
import { SearchInput } from "@/components/ui/search-input"
import { Switch } from "@/components/ui/switch"
import { useCredentialStore } from "@/stores/credentials"
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

const ALL_TYPES_VALUE = "__all__"

interface CredentialsToolbarProps {
  mode: FindingsMode
}

export function CredentialsToolbar({ mode }: CredentialsToolbarProps) {
  const filters = useCredentialStore((s) => s.filters)
  const setSearch = useCredentialStore((s) => s.setSearch)
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

  return (
    <div className="flex flex-wrap items-center gap-3">
      {mode.kind === "global" && <GlobalOperationPicker />}
      <SearchInput
        value={filters.search}
        onValueChange={setSearch}
        placeholder="Search name, username, password..."
        className="relative w-full max-w-md"
      />

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
      <div className="ms-auto">
        <Button onClick={openCreate}>
          <PlusIcon className="size-4" />
          Add credential
        </Button>
      </div>
    </div>
  )
}

// Thin wrapper so the URL hook is only subscribed to from inside the toolbar
// when we're actually in global mode (the parent GlobalCredentialsTab is the
// other consumer; both observe the same source of truth — react-router params).
function GlobalOperationPicker() {
  const { operationIds, setOperationIds } = useFindingsOpsParam()
  return <OperationMultiSelect value={operationIds} onChange={setOperationIds} />
}

interface TagFilterPanelProps {
  availableTags: readonly string[]
  selectedTags: readonly string[]
  onToggle: (tag: string) => void
  onClear: () => void
}

// Renders tags as a searchable, scrollable list rather than a bubble cloud so
// operations with many tags stay manageable. Selected tags float to the top so
// the current filter set stays visible after the user scrolls.
function TagFilterPanel({
  availableTags,
  selectedTags,
  onToggle,
  onClear,
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
          No tags yet. Add tags to credentials to filter by them.
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
