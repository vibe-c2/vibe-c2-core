import { useEffect, useRef, useState, type ReactNode } from "react"
import { LoaderIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface SuggestionOption {
  value: string
  label: string
  /** Optional leading visual rendered before the label (e.g. a wiki document icon). */
  icon?: ReactNode
}

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
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Scroll highlighted option into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const el = listRef.current.children[highlightedIndex] as HTMLElement | undefined
      el?.scrollIntoView({ block: "nearest" })
    }
  }, [highlightedIndex])

  // Reset highlight when the options array reference changes. Done during
  // render via the prev-value pattern rather than a setState-in-effect.
  const [lastOptions, setLastOptions] = useState(options)
  if (lastOptions !== options) {
    setLastOptions(options)
    setHighlightedIndex(-1)
  }

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
        setHighlightedIndex((prev) =>
          prev < options.length - 1 ? prev + 1 : 0
        )
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      if (isOpen) {
        setHighlightedIndex((prev) =>
          prev > 0 ? prev - 1 : options.length - 1
        )
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
        <div
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-40 overflow-y-auto"
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
                key={option.value}
                id={`suggestion-${option.value}`}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-sm text-left",
                  index === highlightedIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent"
                )}
                onMouseEnter={() => setHighlightedIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  selectOption(option)
                }}
              >
                {option.icon}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
