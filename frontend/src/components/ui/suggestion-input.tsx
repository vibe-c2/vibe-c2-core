import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import { LoaderIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface SuggestionOption {
  value: string
  label: string
  /** Optional leading visual rendered before the label (e.g. a wiki document icon). */
  icon?: ReactNode
  /** Optional trailing hint rendered after the label (e.g. "Create new tag"). */
  hint?: string
}

// --- Shared listbox primitives --------------------------------------------------
//
// The same dropdown shell powers two surfaces today:
//   • `SuggestionInput` — single-select picker for wiki document / user search.
//   • `TagComboboxInput` — multi-select tag chip input on credential dialogs.
// Both share keyboard navigation, scroll-into-view, ARIA wiring, and the visual
// pop-over panel. The hook owns highlight state; the component owns rendering.

interface UseSuggestionListboxHighlightOptions {
  itemCount: number
}

export interface SuggestionListboxHighlight {
  highlightedIndex: number
  setHighlightedIndex: (index: number) => void
  moveHighlight: (direction: 1 | -1) => void
  listRef: RefObject<HTMLDivElement | null>
}

/**
 * Owns highlight index for a suggestion listbox. Auto-scrolls the highlighted
 * option into view and clears the highlight if the item count drops below it
 * (e.g. the filtered list shrinks while typing).
 */
export function useSuggestionListboxHighlight({
  itemCount,
}: UseSuggestionListboxHighlightOptions): SuggestionListboxHighlight {
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const el = listRef.current.children[highlightedIndex] as
        | HTMLElement
        | undefined
      el?.scrollIntoView({ block: "nearest" })
    }
  }, [highlightedIndex])

  // Reset highlight when the item count changes in a way that invalidates the
  // current index. Done during render via the prev-value pattern rather than
  // a setState-in-effect.
  const [lastCount, setLastCount] = useState(itemCount)
  if (lastCount !== itemCount) {
    setLastCount(itemCount)
    if (highlightedIndex >= itemCount) setHighlightedIndex(-1)
  }

  function moveHighlight(direction: 1 | -1) {
    if (itemCount === 0) return
    setHighlightedIndex((prev) => {
      if (direction === 1) return prev < itemCount - 1 ? prev + 1 : 0
      return prev > 0 ? prev - 1 : itemCount - 1
    })
  }

  return { highlightedIndex, setHighlightedIndex, moveHighlight, listRef }
}

interface SuggestionListboxProps {
  options: SuggestionOption[]
  highlightedIndex: number
  onHighlight: (index: number) => void
  onSelect: (option: SuggestionOption, index: number) => void
  loading?: boolean
  emptyMessage?: string
  listRef: RefObject<HTMLDivElement | null>
  idPrefix?: string
  className?: string
}

/**
 * The floating dropdown panel. Pure presentation + a11y; state lives in the
 * caller (and in `useSuggestionListboxHighlight`). Uses onMouseDown with
 * preventDefault so clicking an option doesn't blur the input first.
 */
export function SuggestionListbox({
  options,
  highlightedIndex,
  onHighlight,
  onSelect,
  loading = false,
  emptyMessage = "No results found",
  listRef,
  idPrefix = "suggestion",
  className,
}: SuggestionListboxProps) {
  return (
    <div
      ref={listRef}
      role="listbox"
      className={cn(
        "absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-popover shadow-md",
        className,
      )}
    >
      {loading && (
        <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
          <LoaderIcon className="size-3 animate-spin" />
          Loading...
        </div>
      )}

      {!loading && options.length === 0 && (
        <div className="px-3 py-2 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      )}

      {!loading &&
        options.map((option, index) => (
          <button
            key={`${option.value}-${index}`}
            id={`${idPrefix}-${option.value}`}
            type="button"
            role="option"
            aria-selected={index === highlightedIndex}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-sm text-left",
              index === highlightedIndex
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent",
            )}
            onMouseEnter={() => onHighlight(index)}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(option, index)
            }}
          >
            {option.icon}
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            {option.hint && (
              <span className="text-xs text-muted-foreground">
                {option.hint}
              </span>
            )}
          </button>
        ))}
    </div>
  )
}

// --- Single-select facade --------------------------------------------------------

interface SuggestionInputProps {
  /** Current search input value (controlled) */
  search: string
  onSearchChange: (search: string) => void

  /** The currently selected option (null if none) */
  selected: SuggestionOption | null
  onSelect: (option: SuggestionOption | null) => void

  /** Available options to display in the dropdown */
  options: SuggestionOption[]

  /** Whether options are still loading */
  loading?: boolean

  /** Placeholder text for the input */
  placeholder?: string

  /** Empty state message when search has no results */
  emptyMessage?: string

  /** Additional className for the wrapper */
  className?: string

  /** Disable the input */
  disabled?: boolean
}

export function SuggestionInput({
  search,
  onSearchChange,
  selected,
  onSelect,
  options,
  loading = false,
  placeholder,
  emptyMessage = "No results found",
  className,
  disabled = false,
}: SuggestionInputProps) {
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { highlightedIndex, setHighlightedIndex, moveHighlight, listRef } =
    useSuggestionListboxHighlight({ itemCount: options.length })

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    onSearchChange(val)
    // Clear selection if user edits after selecting
    if (selected) {
      onSelect(null)
    }
    setIsOpen(true)
    setHighlightedIndex(-1)
  }

  function selectOption(option: SuggestionOption) {
    onSelect(option)
    onSearchChange("")
    setIsOpen(false)
    setHighlightedIndex(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        setHighlightedIndex(0)
      } else {
        moveHighlight(1)
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (isOpen) {
        moveHighlight(-1)
      }
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (isOpen && highlightedIndex >= 0 && highlightedIndex < options.length) {
        selectOption(options[highlightedIndex])
      }
    } else if (e.key === "Escape") {
      setIsOpen(false)
      setHighlightedIndex(-1)
      inputRef.current?.blur()
    }
  }

  // Close dropdown when focus leaves the component entirely.
  // Options use onMouseDown with preventDefault to avoid triggering blur before click.
  function handleBlur(e: React.FocusEvent) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsOpen(false)
      setHighlightedIndex(-1)
    }
  }

  const displayValue = selected ? selected.label : search
  const showDropdown = isOpen && !selected && search.length > 0

  return (
    <div className={cn("relative", className)} onBlur={handleBlur}>
      <Input
        ref={inputRef}
        value={displayValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (search && !selected) setIsOpen(true)
        }}
        placeholder={placeholder}
        disabled={disabled}
        role="combobox"
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-activedescendant={
          showDropdown && highlightedIndex >= 0
            ? `suggestion-${options[highlightedIndex]?.value}`
            : undefined
        }
      />

      {showDropdown && (
        <SuggestionListbox
          options={options}
          highlightedIndex={highlightedIndex}
          onHighlight={setHighlightedIndex}
          onSelect={selectOption}
          loading={loading}
          emptyMessage={emptyMessage}
          listRef={listRef}
        />
      )}
    </div>
  )
}
