import { createRoot, type Root } from "react-dom/client"
import { Extension } from "@tiptap/core"
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionOptions,
  type SuggestionProps,
} from "@tiptap/suggestion"
import { createElement } from "react"
import { SlashMenu, type SlashMenuHandle } from "./slash-menu"
import { filterItems, type SlashItem, type SlashItemContext } from "./items"

interface SlashCommandOptions {
  /** Runtime context exposed to slash-item commands (e.g. the current
   *  documentId for the /image upload flow). */
  context: SlashItemContext
  suggestion: Omit<SuggestionOptions<SlashItem, SlashItem>, "editor">
}

export const WikiSlashCommand = Extension.create<SlashCommandOptions>({
  name: "wikiSlashCommand",

  addOptions() {
    return {
      context: { documentId: "", operationId: "" },
      suggestion: {
        char: "/",
        startOfLine: false,
        allowSpaces: false,
        items: ({ query }) => filterItems(query),
        // Default no-op; the real command is installed in
        // addProseMirrorPlugins below, which can close over this.options to
        // forward the per-editor context.
        command: () => {},
        allow: ({ editor }) => editor.isEditable,
        render: renderSlashMenu,
      },
    }
  },

  addProseMirrorPlugins() {
    const context = this.options.context
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        command: ({ editor, range, props }) => {
          props.command({ editor, range, context })
        },
      }),
    ]
  },
})

function itemsEqual(a: SlashItem[], b: SlashItem[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].title !== b[i].title) return false
  }
  return true
}

function rectsEqual(a: DOMRect | null, b: DOMRect | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom
}

function renderSlashMenu() {
  let container: HTMLDivElement | null = null
  let root: Root | null = null
  const handleRef = { current: null as SlashMenuHandle | null }
  // Always points at the current `props.command` from @tiptap/suggestion.
  // The plugin rebuilds `command` on every update with the *current* range
  // captured in its closure, so we must refresh this ref on every onUpdate.
  // SlashMenu's onSelect calls through this ref instead of capturing
  // `props.command` at render time — otherwise the render-skip optimization
  // below would leave onSelect pointing at a stale range, deleting too few
  // characters when the user keeps typing into an already-narrow filter
  // (e.g. `/cred` narrows to one item at `/cr` already, so typing `ed`
  // produces no re-render — the captured command would still target `/cr`).
  const commandRef = {
    current: null as ((item: SlashItem) => void) | null,
  }
  // Cache last-rendered inputs so transactions that don't change the items
  // list or screen position skip the React render + DOM reposition entirely.
  // Without this guard, every remote keystroke caused @tiptap/suggestion to
  // call onUpdate, which reconciled the React tree even when nothing visible
  // changed. The `command` ref above keeps this safe across local typing
  // that narrows the filter to a stable set.
  let lastItems: SlashItem[] | null = null
  let lastRect: DOMRect | null = null

  function mount() {
    if (container) return
    container = document.createElement("div")
    container.style.position = "absolute"
    container.style.zIndex = "50"
    container.style.top = "0"
    container.style.left = "0"
    document.body.appendChild(container)
    root = createRoot(container)
  }

  function unmount() {
    root?.unmount()
    root = null
    container?.remove()
    container = null
    handleRef.current = null
    commandRef.current = null
    lastItems = null
    lastRect = null
  }

  function position(rect: DOMRect | null) {
    if (!container || !rect) return
    const menuHeight = container.offsetHeight || 288 // max-h-72
    const spaceBelow = window.innerHeight - rect.bottom
    const placeAbove = spaceBelow < menuHeight + 8 && rect.top > menuHeight
    const top = placeAbove
      ? rect.top + window.scrollY - menuHeight - 4
      : rect.bottom + window.scrollY + 4
    container.style.top = `${top}px`
    container.style.left = `${rect.left + window.scrollX}px`
  }

  function render(props: SuggestionProps<SlashItem, SlashItem>) {
    root?.render(
      createElement(SlashMenu, {
        ref: (handle: SlashMenuHandle | null) => {
          handleRef.current = handle
        },
        items: props.items,
        // Read through commandRef so subsequent transactions that update the
        // range can keep onSelect pointing at the fresh command without
        // forcing a React re-render.
        onSelect: (item) => commandRef.current?.(item),
      }),
    )
    lastItems = props.items
  }

  return {
    onStart: (props: SuggestionProps<SlashItem, SlashItem>) => {
      mount()
      commandRef.current = props.command
      render(props)
      const rect = props.clientRect?.() ?? null
      position(rect)
      lastRect = rect
    },

    onUpdate: (props: SuggestionProps<SlashItem, SlashItem>) => {
      // Always refresh the command — its closure carries the suggestion's
      // current range, so dropping this stales the deletion range whenever
      // items happen to match (e.g. user keeps typing into a filter that
      // already narrowed to one item).
      commandRef.current = props.command
      const itemsSame = lastItems !== null && itemsEqual(lastItems, props.items)
      const rect = props.clientRect?.() ?? null
      const rectSame = rectsEqual(lastRect, rect)
      // Identical inputs from the previous render (typical of remote-typing
      // transactions): no-op.
      if (itemsSame && rectSame) return
      if (!itemsSame) render(props)
      if (!rectSame) {
        position(rect)
        lastRect = rect
      }
    },

    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (props.event.key === "Escape") {
        unmount()
        return true
      }
      return handleRef.current?.onKeyDown(props.event) ?? false
    },

    onExit: () => {
      unmount()
    },
  }
}
