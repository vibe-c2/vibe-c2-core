import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { SlashItem, TableSize } from "./items"
import { TableSizePicker, type TableSizePickerHandle } from "./table-size-picker"

export interface SlashMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

interface SlashMenuProps {
  items: SlashItem[]
  onSelect: (item: SlashItem, tableSize?: TableSize) => void
}

function itemsEqual(a: SlashItem[], b: SlashItem[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].title !== b[i].title) return false
  }
  return true
}

export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(function SlashMenu(
  { items, onSelect },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  // Item whose picker is showing in place of the list, or null for the list.
  const [pickerItem, setPickerItem] = useState<SlashItem | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<TableSizePickerHandle>(null)

  // Reset cursor when the result list changes. Done during render via the
  // prev-value pattern (react.dev/reference/react/useState#storing-information-from-previous-renders)
  // rather than a setState-in-effect, which the React Hooks lint flags.
  //
  // Compares by *content* (length + title sequence), not reference. A remote
  // collaborator typing before the local caret causes @tiptap/suggestion to
  // re-fetch items every transaction; even with a memoized filter the menu
  // would otherwise lose the user's keyboard selection on every remote
  // keystroke whenever the items array identity drifted for any reason.
  const [lastItems, setLastItems] = useState(items)
  if (!itemsEqual(lastItems, items)) {
    setLastItems(items)
    setSelectedIndex(0)
    // Typing past the picker (the query changed) drops back to the list.
    setPickerItem(null)
  }

  function choose(item: SlashItem) {
    if (item.picker) {
      setPickerItem(item)
      return
    }
    onSelect(item)
  }

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const active = list.querySelector<HTMLButtonElement>(`[data-index="${selectedIndex}"]`)
    active?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (pickerItem) {
        if (event.key === "Backspace") {
          setPickerItem(null)
          return true
        }
        return pickerRef.current?.onKeyDown(event) ?? false
      }
      if (items.length === 0) return false
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % items.length)
        return true
      }
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) => (i - 1 + items.length) % items.length)
        return true
      }
      if (event.key === "Enter") {
        choose(items[selectedIndex])
        return true
      }
      return false
    },
  }))

  if (pickerItem?.picker === "tableSize") {
    return (
      <TableSizePicker ref={pickerRef} onPick={(size) => onSelect(pickerItem, size)} />
    )
  }

  if (items.length === 0) {
    return (
      <div className="z-50 w-64 rounded-lg bg-popover p-2 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10">
        <div className="px-2 py-1.5 text-muted-foreground">No results</div>
      </div>
    )
  }

  return (
    <div
      ref={listRef}
      className="z-50 max-h-72 w-64 overflow-y-auto rounded-lg bg-popover p-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10"
      role="listbox"
    >
      {items.map((item, index) => {
        const Icon = item.icon
        const isActive = index === selectedIndex
        return (
          <button
            key={item.title}
            data-index={index}
            role="option"
            aria-selected={isActive}
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-hidden",
              isActive ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
            )}
            onMouseEnter={() => setSelectedIndex(index)}
            onMouseDown={(e) => {
              e.preventDefault()
              choose(item)
            }}
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" />
            <div className="flex flex-col overflow-hidden">
              <span className="truncate font-medium">{item.title}</span>
              <span className="truncate text-xs text-muted-foreground">{item.description}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
})
