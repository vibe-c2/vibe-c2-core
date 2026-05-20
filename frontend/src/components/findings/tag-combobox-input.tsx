import { useMemo, useRef, useState } from "react"
import { XIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  SuggestionListbox,
  useSuggestionListboxHighlight,
  type SuggestionOption,
} from "@/components/ui/suggestion-input"
import { parseTagsText } from "@/components/findings/credential-type-utils"
import { cn } from "@/lib/utils"

interface TagComboboxInputProps {
  /** Currently selected tags. */
  value: string[]
  onChange: (next: string[]) => void
  /** Pool of existing tags to surface as suggestions. */
  suggestions: string[]
  /** Whether the suggestions query is still loading. */
  loading?: boolean
  /** Placeholder for the inline input. */
  placeholder?: string
  /** id forwarded to the inline input — paired with the parent's <FieldLabel htmlFor>. */
  inputId?: string
  /** Disable the whole control. */
  disabled?: boolean
  className?: string
}

// Cap the dropdown so it stays usable even when an operation has hundreds of
// tags. Backed by client-side filtering on a small string array; no debouncing
// needed at this size.
const MAX_SUGGESTIONS = 50

export function TagComboboxInput({
  value,
  onChange,
  suggestions,
  loading = false,
  placeholder = "Type and press Enter",
  inputId,
  disabled = false,
  className,
}: TagComboboxInputProps) {
  const [input, setInput] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedSet = useMemo(() => new Set(value), [value])
  const trimmed = input.trim().toLowerCase()
  // When the user is mid-paste of `foo, bar, baz`, the substring filter is
  // ambiguous — suppress the dropdown and let parseTagsText handle commit on
  // Enter / blur, same as the pre-autocomplete behavior.
  const hasComma = input.includes(",")

  const filteredSuggestions = useMemo(() => {
    const out: string[] = []
    for (const tag of suggestions) {
      if (selectedSet.has(tag)) continue
      if (trimmed !== "" && !tag.toLowerCase().includes(trimmed)) continue
      out.push(tag)
      if (out.length >= MAX_SUGGESTIONS) break
    }
    return out
  }, [suggestions, selectedSet, trimmed])

  // "Create new: foo" pseudo-option appears when the user is typing a tag that
  // isn't already in the suggestion set and isn't already selected. Mirrors
  // the way `parseTagsText` normalizes the value (lowercase + trim).
  const exactMatch = filteredSuggestions.some(
    (t) => t.toLowerCase() === trimmed,
  )
  const showCreateNew =
    trimmed.length > 0 && !exactMatch && !selectedSet.has(trimmed) && !hasComma

  const items = useMemo<SuggestionOption[]>(() => {
    const opts: SuggestionOption[] = filteredSuggestions.map((tag) => ({
      value: tag,
      label: tag,
    }))
    if (showCreateNew) {
      opts.push({
        value: trimmed,
        label: trimmed,
        hint: "Create new tag",
      })
    }
    return opts
  }, [filteredSuggestions, showCreateNew, trimmed])

  const { highlightedIndex, setHighlightedIndex, moveHighlight, listRef } =
    useSuggestionListboxHighlight({ itemCount: items.length })

  // The popup is visible when the menu is open AND there's something to show
  // (an option or a loading spinner). Used for both ARIA and the JSX guard so
  // they can't drift apart.
  const listboxVisible =
    isOpen && !hasComma && !disabled && (loading || items.length > 0)

  function addTag(tag: string) {
    const normalized = tag.trim().toLowerCase()
    if (!normalized) return
    if (selectedSet.has(normalized)) {
      setInput("")
      setHighlightedIndex(-1)
      return
    }
    onChange([...value, normalized])
    setInput("")
    setHighlightedIndex(-1)
  }

  function addTagsFromInput() {
    const next = new Set(value)
    let added = false
    for (const t of parseTagsText(input)) {
      if (!next.has(t)) {
        next.add(t)
        added = true
      }
    }
    if (added) onChange(Array.from(next))
    setInput("")
    setHighlightedIndex(-1)
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag))
    // Refocus the input so the dropdown stays in the "interactive" state.
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        if (items.length > 0) setHighlightedIndex(0)
      } else if (items.length > 0) {
        moveHighlight(1)
      }
      return
    }
    if (e.key === "ArrowUp") {
      e.preventDefault()
      if (isOpen && items.length > 0) moveHighlight(-1)
      return
    }
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      if (
        listboxVisible &&
        highlightedIndex >= 0 &&
        highlightedIndex < items.length
      ) {
        addTag(items[highlightedIndex].value)
      } else if (input.trim() !== "") {
        addTagsFromInput()
      }
      return
    }
    if (e.key === "Escape") {
      if (isOpen) {
        e.preventDefault()
        setIsOpen(false)
        setHighlightedIndex(-1)
      }
      return
    }
    if (e.key === "Backspace" && input === "" && value.length > 0) {
      removeTag(value[value.length - 1])
    }
  }

  function handleBlur(e: React.FocusEvent) {
    // Stay open while focus moves to the X buttons / dropdown items inside the
    // wrapper. The listbox uses onMouseDown+preventDefault, so a click on a
    // suggestion never triggers this branch.
    if (e.currentTarget.contains(e.relatedTarget)) return
    if (input.trim() !== "") addTagsFromInput()
    setIsOpen(false)
    setHighlightedIndex(-1)
  }

  return (
    <div className={cn("relative", className)} onBlur={handleBlur}>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((t) => (
          <Badge key={t} variant="secondary" className="gap-1">
            {t}
            <button
              type="button"
              onClick={() => removeTag(t)}
              aria-label={`Remove tag ${t}`}
              className="rounded-full hover:bg-muted-foreground/20"
            >
              <XIcon className="size-3" />
            </button>
          </Badge>
        ))}
        <Input
          ref={inputRef}
          id={inputId}
          className="h-7 flex-1 min-w-[10rem]"
          value={input}
          onChange={(e) => {
            setInput(e.target.value)
            setIsOpen(true)
            setHighlightedIndex(-1)
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-expanded={listboxVisible}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-activedescendant={
            listboxVisible && highlightedIndex >= 0
              ? `tag-suggestion-${items[highlightedIndex]?.value}`
              : undefined
          }
        />
      </div>

      {listboxVisible && (
        <SuggestionListbox
          options={items}
          highlightedIndex={highlightedIndex}
          onHighlight={setHighlightedIndex}
          onSelect={(opt) => addTag(opt.value)}
          loading={loading}
          listRef={listRef}
          idPrefix="tag-suggestion"
        />
      )}
    </div>
  )
}
