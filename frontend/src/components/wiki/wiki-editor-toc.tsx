import { XIcon } from "lucide-react"
import { type Editor, useEditorState } from "@tiptap/react"
import { Button } from "@/components/ui/button"
import { useWikiStore } from "@/stores/wiki"
import { cn } from "@/lib/utils"

interface WikiEditorTocProps {
  editor: Editor | null
}

interface TocItem {
  level: number
  text: string
  pos: number
}

// Indent class per heading level. Kept as a static lookup so Tailwind's JIT
// can statically detect every class; computing pl-{n} dynamically would
// generate strings the compiler never sees.
const INDENT_BY_LEVEL: Record<number, string> = {
  1: "pl-2",
  2: "pl-4",
  3: "pl-6",
  4: "pl-8",
  5: "pl-10",
  6: "pl-12",
}

export function WikiEditorToc({ editor }: WikiEditorTocProps) {
  const setVisible = useWikiStore((s) => s.setEditorTocVisible)

  // Walk the doc on every transaction and collect headings. The custom
  // equalityFn avoids re-rendering on unrelated edits (typing inside a
  // paragraph, cursor moves) by shallow-comparing the heading triples.
  const items = useEditorState({
    editor,
    selector: ({ editor: e }): TocItem[] => {
      const out: TocItem[] = []
      if (!e) return out
      e.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") {
          out.push({
            level: Number(node.attrs.level ?? 1),
            text: node.textContent.trim() || "Untitled",
            pos,
          })
        }
      })
      return out
    },
    equalityFn: (a, b) => {
      if (a === b) return true
      if (!a || !b || a.length !== b.length) return false
      for (let i = 0; i < a.length; i++) {
        const x = a[i]
        const y = b[i]
        if (x.pos !== y.pos || x.level !== y.level || x.text !== y.text) {
          return false
        }
      }
      return true
    },
  }) ?? []

  function handleClick(pos: number) {
    if (!editor) return
    // Resolve the heading's DOM node and scroll it into view. nodeDOM is
    // null when the node hasn't been rendered yet (e.g. mid-transaction);
    // fall back to coordsAtPos + scrollTo on the editor's scroll ancestor
    // in that case.
    const dom = editor.view.nodeDOM(pos)
    if (dom instanceof HTMLElement) {
      dom.scrollIntoView({ behavior: "smooth", block: "start" })
      return
    }
    const coords = editor.view.coordsAtPos(pos)
    const scrollParent = findScrollParent(editor.view.dom as HTMLElement)
    if (scrollParent && coords) {
      const containerRect = scrollParent.getBoundingClientRect()
      const top = scrollParent.scrollTop + (coords.top - containerRect.top)
      scrollParent.scrollTo({ top, behavior: "smooth" })
    }
  }

  return (
    <div
      className="absolute right-3 top-3 z-20 flex max-h-[60vh] w-60 flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg"
      // Keep clicks inside the panel from being treated as gutter clicks
      // by the editor's onMouseDown handler, which would otherwise steal
      // focus away from the heading the user just navigated to.
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          On this page
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setVisible(false)}
          aria-label="Close table of contents"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {items.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            No headings yet.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {items.map((item) => (
              <li key={item.pos}>
                <button
                  type="button"
                  onClick={() => handleClick(item.pos)}
                  className={cn(
                    "block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground",
                    INDENT_BY_LEVEL[item.level] ?? "pl-2",
                    item.level === 1 && "font-medium text-foreground",
                    item.level >= 3 && "text-muted-foreground",
                  )}
                  title={item.text}
                >
                  {item.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// Walks up from the editor DOM until the nearest scrollable ancestor.
// The wiki editor lives inside `.flex-1.overflow-y-auto`, so the first
// ancestor with a scrolling overflow-y is the right target.
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node)
    if (style.overflowY === "auto" || style.overflowY === "scroll") {
      return node
    }
    node = node.parentElement
  }
  return null
}
