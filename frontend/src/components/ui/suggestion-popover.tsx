import { useEffect, useRef, useState } from "react"
import { PlusIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  SuggestionListbox,
  useSuggestionListboxHighlight,
  type SuggestionOption,
} from "@/components/ui/suggestion-input"
import { cn } from "@/lib/utils"

interface SuggestionPopoverProps {
  /** Current search input value (controlled by caller). */
  search: string
  onSearchChange: (search: string) => void

  /** Available options to display. */
  options: SuggestionOption[]

  /** Fired when the operator picks one. The popover closes itself. */
  onSelect: (option: SuggestionOption) => void

  /** Whether options are still loading. */
  loading?: boolean

  /** Search input placeholder. */
  placeholder?: string

  /** Empty state message when no options match. */
  emptyMessage?: string

  /** Aria-label for the compact "+" trigger button. */
  triggerAriaLabel: string

  /** Optional className on the trigger. */
  triggerClassName?: string

  /**
   * Optional className on the popover content panel. Use to override the
   * default `w-72` width when the option labels are wide (e.g. wiki document
   * titles with breadcrumb subtitles).
   */
  contentClassName?: string
}

/**
 * Compact "+" button that opens a popover containing a search input + the
 * shared SuggestionListbox. Drop-in alternative to `SuggestionInput` for
 * pickers where the always-on input field would crowd the layout (e.g. the
 * task create/edit dialog's assignees / wiki refs / credential refs).
 *
 * Search state is owned by the caller (same shape as `SuggestionInput`) so
 * the parent can debounce, gate queries, or react to typing. The search
 * input clears whenever the popover closes so a fresh open never inherits
 * stale text.
 */
export function SuggestionPopover({
  search,
  onSearchChange,
  options,
  onSelect,
  loading = false,
  placeholder,
  emptyMessage = "No results found",
  triggerAriaLabel,
  triggerClassName,
  contentClassName,
}: SuggestionPopoverProps) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { highlightedIndex, setHighlightedIndex, moveHighlight, listRef } =
    useSuggestionListboxHighlight({ itemCount: options.length })

  // Clear the search on close so the next open starts empty. Auto-focus the
  // input on open so the operator can start typing immediately.
  useEffect(() => {
    if (!open) {
      onSearchChange("")
      setHighlightedIndex(-1)
      return
    }
    // Focus after the popover content mounts. requestAnimationFrame avoids a
    // race with base-ui's autofocus/portal mount sequence.
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [open, onSearchChange, setHighlightedIndex])

  function pick(option: SuggestionOption) {
    onSelect(option)
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      moveHighlight(1)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      moveHighlight(-1)
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (highlightedIndex >= 0 && highlightedIndex < options.length) {
        pick(options[highlightedIndex])
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          triggerClassName,
        )}
        aria-label={triggerAriaLabel}
      >
        <PlusIcon className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className={cn("w-72 gap-2 p-2", contentClassName)}
      >
        <Input
          ref={inputRef}
          value={search}
          onChange={(e) => {
            onSearchChange(e.target.value)
            setHighlightedIndex(-1)
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          role="combobox"
          aria-expanded
          aria-autocomplete="list"
          aria-activedescendant={
            highlightedIndex >= 0
              ? `suggestion-popover-${options[highlightedIndex]?.value}`
              : undefined
          }
          className="h-8"
        />
        <SuggestionListbox
          options={options}
          highlightedIndex={highlightedIndex}
          onHighlight={setHighlightedIndex}
          onSelect={pick}
          loading={loading}
          emptyMessage={emptyMessage}
          listRef={listRef}
          idPrefix="suggestion-popover"
          className="static max-h-60 w-full border-0 shadow-none"
        />
      </PopoverContent>
    </Popover>
  )
}
