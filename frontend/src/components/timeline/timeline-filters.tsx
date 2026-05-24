import { useState } from "react"
import { CalendarIcon, FilterIcon, UsersIcon, XIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  SuggestionInput,
  type SuggestionOption,
} from "@/components/ui/suggestion-input"
import { useUserSuggestions } from "@/graphql/hooks/operations"
import { cn } from "@/lib/utils"
import { dayjs } from "./dayjs-setup"

// Single source of truth for the filter options surfaced in the UI. Backend
// also whitelists these values in `parseSubjectKinds`, so adding a third
// option requires changes in both places.
export const SUBJECT_KIND_OPTIONS: ReadonlyArray<{
  value: string
  label: string
}> = [
  { value: "credential", label: "Credentials" },
  { value: "wiki_document", label: "Wiki documents" },
]

// --- Types filter --------------------------------------------------------

interface TypesFilterProps {
  value: string[]
  onChange: (next: string[]) => void
}

// TypesFilter is a popover with one checkbox per supported subject kind.
// Empty selection == "no filter" — the backend treats an empty list the
// same as a missing argument.
export function TypesFilter({ value, onChange }: TypesFilterProps) {
  const allOff = value.length === 0
  const label = allOff
    ? "All types"
    : value.length === SUBJECT_KIND_OPTIONS.length
      ? "All types"
      : value.length === 1
        ? SUBJECT_KIND_OPTIONS.find((o) => o.value === value[0])?.label ??
          "1 type"
        : `${value.length} types`

  function toggle(opt: string) {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt))
    } else {
      onChange([...value, opt])
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <FilterIcon className="size-3.5" />
            <span className="text-xs">Types</span>
            <Badge
              variant={allOff ? "outline" : "secondary"}
              className="ml-0.5 h-4 px-1.5 text-[10px]"
            >
              {label}
            </Badge>
          </Button>
        }
      />
      <PopoverContent align="start" className="w-56">
        <div className="text-xs font-medium text-muted-foreground">Show</div>
        <div className="flex flex-col gap-1.5">
          {SUBJECT_KIND_OPTIONS.map((opt) => {
            const checked = value.includes(opt.value)
            return (
              <label
                key={opt.value}
                className="flex items-center gap-2 cursor-pointer text-sm py-1"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(opt.value)}
                />
                {opt.label}
              </label>
            )
          })}
        </div>
        {value.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-7 text-xs"
            onClick={() => onChange([])}
          >
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

// --- Actors filter -------------------------------------------------------

export interface ActorChip {
  id: string
  username: string
}

interface ActorsFilterProps {
  value: ActorChip[]
  onChange: (next: ActorChip[]) => void
}

// ActorsFilter wraps the user suggestion picker so the timeline can scope
// to events originated by specific operators. Chips render inside the
// popover; the trigger shows a compact count. Suggestion list filters out
// already-selected actors so adding the same user twice is impossible.
export function ActorsFilter({ value, onChange }: ActorsFilterProps) {
  const [search, setSearch] = useState("")
  const { data: suggestionsData } = useUserSuggestions(search)

  const selectedIds = new Set(value.map((a) => a.id))
  const options: SuggestionOption[] = (suggestionsData?.userSuggestions ?? [])
    .filter((u) => !selectedIds.has(u.id))
    .map((u) => ({ value: u.id, label: u.username }))

  function addActor(opt: SuggestionOption | null) {
    if (!opt) return
    onChange([...value, { id: opt.value, username: opt.label }])
  }

  function removeActor(id: string) {
    onChange(value.filter((a) => a.id !== id))
  }

  const triggerLabel =
    value.length === 0
      ? "Anyone"
      : value.length === 1
        ? value[0].username
        : `${value.length} actors`

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <UsersIcon className="size-3.5" />
            <span className="text-xs">Actors</span>
            <Badge
              variant={value.length === 0 ? "outline" : "secondary"}
              className="ml-0.5 h-4 px-1.5 text-[10px]"
            >
              {triggerLabel}
            </Badge>
          </Button>
        }
      />
      <PopoverContent align="start" className="w-72">
        <div className="text-xs font-medium text-muted-foreground">
          Filter by actor
        </div>
        <SuggestionInput
          search={search}
          onSearchChange={setSearch}
          selected={null}
          onSelect={(opt) => {
            addActor(opt)
            setSearch("")
          }}
          options={options}
          placeholder="Search users..."
          emptyMessage="No users found"
        />
        {value.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {value.map((a) => (
              <Badge
                key={a.id}
                variant="secondary"
                className="gap-1 pr-1 h-5 text-[10px]"
              >
                {a.username}
                <button
                  type="button"
                  onClick={() => removeActor(a.id)}
                  aria-label={`Remove ${a.username}`}
                  className="rounded-full hover:bg-foreground/10 p-0.5"
                >
                  <XIcon className="size-2.5" />
                </button>
              </Badge>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[10px] px-1.5"
              onClick={() => onChange([])}
            >
              Clear all
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// --- Date range filter --------------------------------------------------

interface DateRangeFilterProps {
  from: string | null
  to: string | null
  onChange: (next: { from: string | null; to: string | null }) => void
}

// DateRangeFilter exposes two native date inputs. Either bound can be left
// empty: the backend treats a zero time as "no bound on that edge". Inputs
// emit RFC3339-compatible "YYYY-MM-DD" strings; the resolver's parseTime
// already accepts that bare-date form.
export function DateRangeFilter({ from, to, onChange }: DateRangeFilterProps) {
  const hasRange = !!from || !!to
  const triggerLabel = !hasRange
    ? "All time"
    : `${from ? dayjs(from).format("MMM D") : "…"} – ${to ? dayjs(to).format("MMM D") : "…"}`

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <CalendarIcon className="size-3.5" />
            <span className="text-xs">Range</span>
            <Badge
              variant={hasRange ? "secondary" : "outline"}
              className="ml-0.5 h-4 px-1.5 text-[10px]"
            >
              {triggerLabel}
            </Badge>
          </Button>
        }
      />
      <PopoverContent align="start" className="w-64">
        <div className="text-xs font-medium text-muted-foreground">
          Date range
        </div>
        <div className="grid gap-2">
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">From</span>
            <Input
              type="date"
              value={from ?? ""}
              onChange={(e) =>
                onChange({ from: e.target.value || null, to })
              }
            />
          </label>
          <label className="grid gap-1 text-xs">
            <span className="text-muted-foreground">To</span>
            <Input
              type="date"
              value={to ?? ""}
              onChange={(e) =>
                onChange({ from, to: e.target.value || null })
              }
            />
          </label>
          {hasRange && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onChange({ from: null, to: null })}
            >
              Clear range
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// --- Reset --------------------------------------------------------------

interface ResetButtonProps {
  visible: boolean
  onClick: () => void
  className?: string
}

export function ResetFiltersButton({
  visible,
  onClick,
  className,
}: ResetButtonProps) {
  if (!visible) return null
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn("h-8 text-xs gap-1", className)}
    >
      <XIcon className="size-3.5" />
      Reset
    </Button>
  )
}
