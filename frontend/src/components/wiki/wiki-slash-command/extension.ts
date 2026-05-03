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
      context: { documentId: "" },
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

function renderSlashMenu() {
  let container: HTMLDivElement | null = null
  let root: Root | null = null
  const handleRef = { current: null as SlashMenuHandle | null }

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

  return {
    onStart: (props: SuggestionProps<SlashItem, SlashItem>) => {
      mount()
      root?.render(
        createElement(SlashMenu, {
          ref: (handle: SlashMenuHandle | null) => {
            handleRef.current = handle
          },
          items: props.items,
          onSelect: (item) => props.command(item),
        }),
      )
      position(props.clientRect?.() ?? null)
    },

    onUpdate: (props: SuggestionProps<SlashItem, SlashItem>) => {
      root?.render(
        createElement(SlashMenu, {
          ref: (handle: SlashMenuHandle | null) => {
            handleRef.current = handle
          },
          items: props.items,
          onSelect: (item) => props.command(item),
        }),
      )
      position(props.clientRect?.() ?? null)
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
