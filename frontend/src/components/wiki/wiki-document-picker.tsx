import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { create } from "zustand"
import type { Editor } from "@tiptap/core"
import { useVirtualizer } from "@tanstack/react-virtual"
import { FileTextIcon, SearchIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { WikiAncestorBreadcrumb } from "@/components/wiki/wiki-ancestor-breadcrumb"
import { useWikiDocumentTreeAncestors } from "@/components/wiki/use-wiki-document-tree-ancestors"
import type { WikiDocumentTreeFieldsFragment } from "@/graphql/gql/graphql"
import { cn } from "@/lib/utils"

/**
 * Singleton picker driven by a tiny Zustand store. The /doc slash command
 * opens it with the active editor + operation, the dialog renders inside
 * the React tree (so the GraphQL client / React Query providers are in
 * scope), and on pick it inserts a `wikiDocumentReference` node at the
 * captured insertion position.
 *
 * Source data is the wiki tree query that the surrounding page already
 * loaded — no extra network round trip. Filtering is case-insensitive
 * substring match on title, capped to a manageable visible list.
 */
interface PickerArgs {
  editor: Editor
  operationId: string
  insertPos: number
  /** Document IDs to disable in the picker — typically the currently open
   *  document, so users can't link a page to itself from the picker. */
  excludeIds?: string[]
}

interface PickerState {
  open: boolean
  editor: Editor | null
  operationId: string
  insertPos: number | null
  excludeIds: string[]
  openPicker: (args: PickerArgs) => void
  closePicker: () => void
}

const useWikiDocumentPickerStore = create<PickerState>((set) => ({
  open: false,
  editor: null,
  operationId: "",
  insertPos: null,
  excludeIds: [],
  openPicker: ({ editor, operationId, insertPos, excludeIds }) =>
    set({
      open: true,
      editor,
      operationId,
      insertPos,
      excludeIds: excludeIds ?? [],
    }),
  closePicker: () =>
    set({
      open: false,
      editor: null,
      operationId: "",
      insertPos: null,
      excludeIds: [],
    }),
}))

/** Imperative entry point — called from the slash-command item. */
// eslint-disable-next-line react-refresh/only-export-components
export function openDocumentPicker(args: PickerArgs) {
  useWikiDocumentPickerStore.getState().openPicker(args)
}

export function WikiDocumentPickerDialog() {
  const open = useWikiDocumentPickerStore((s) => s.open)
  const closePicker = useWikiDocumentPickerStore((s) => s.closePicker)
  const [search, setSearch] = useState("")

  // Reset transient UI when the picker reopens — prev-value pattern
  // (react.dev/.../useState#storing-information-from-previous-renders).
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setSearch("")
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closePicker()
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileTextIcon className="size-4" />
            Insert document reference
          </DialogTitle>
          <DialogDescription>
            Pick another wiki document in this operation to link inline.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <PickerErrorBoundary onClose={closePicker}>
            <PickerBody search={search} setSearch={setSearch} />
          </PickerErrorBoundary>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

interface PickerBodyProps {
  search: string
  setSearch: (s: string) => void
}

// Row height estimate used by the virtualizer. Real rows are measured via
// `measureElement` so this only matters for the initial scrollbar sizing —
// icon + title + breadcrumb lands at ~52px in practice.
const ROW_HEIGHT = 52

function PickerBody({ search, setSearch }: PickerBodyProps) {
  const operationId = useWikiDocumentPickerStore((s) => s.operationId)
  const excludeIds = useWikiDocumentPickerStore((s) => s.excludeIds)
  const closePicker = useWikiDocumentPickerStore((s) => s.closePicker)
  // rawActiveIndex is the last cursor value the user expressed via keyboard
  // or hover. The render path always reads `activeIndex` (derived below)
  // so a shrinking filtered set never points past the end — no setState
  // during render, no cascading-update edge cases on transitions to/from 0.
  const [rawActiveIndex, setRawActiveIndex] = useState(0)

  // Source data is the wiki tree the surrounding page already loaded, plus
  // a precomputed parent-chain lookup. Shared with the task editor's wiki
  // reference picker so both surfaces render identical rows.
  const {
    docs: allDocs,
    ancestorsByDocId,
    isLoading,
  } = useWikiDocumentTreeAncestors(operationId)

  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matches = allDocs.filter((d) => {
      if (!q) return true
      // Defensive ?? "" — schema says title: String! but a stale cache
      // entry from a partial fragment could surface as undefined and
      // crash the whole picker (and the page, with no boundary).
      return (d.title ?? "").toLowerCase().includes(q)
    })
    // Recency-first ordering mirrors the "Latest documents" modal: pick the
    // most recently touched timestamp (content edit via Hocuspocus, or
    // metadata change via GraphQL), newest first. Title is the tiebreaker so
    // same-timestamp rows stay deterministic.
    return [...matches].sort((a, b) => {
      const ta = a.lastUpdatedAt ?? a.updatedAt ?? ""
      const tb = b.lastUpdatedAt ?? b.updatedAt ?? ""
      if (ta !== tb) return ta < tb ? 1 : -1
      return (a.title ?? "").localeCompare(b.title ?? "", undefined, {
        sensitivity: "base",
      })
    })
  }, [allDocs, search])

  // Bound the cursor for rendering. `filtered.length === 0` keeps it at 0;
  // otherwise clamp into [0, len-1]. Pure derivation — no state churn.
  const activeIndex =
    filtered.length === 0
      ? 0
      : Math.min(Math.max(0, rawActiveIndex), filtered.length - 1)

  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  })

  // Keep the keyboard-active row in view via the virtualizer (DOM-level
  // scrollIntoView doesn't work for rows that aren't in the rendered window
  // yet — they don't exist as nodes). `align: "auto"` is a no-op when the
  // row is already visible.
  useEffect(() => {
    if (filtered.length === 0) return
    virtualizer.scrollToIndex(activeIndex, { align: "auto" })
  }, [activeIndex, filtered.length, virtualizer])

  function insertDocument(doc: WikiDocumentTreeFieldsFragment) {
    if (excludeSet.has(doc.id)) return
    const { editor, insertPos } = useWikiDocumentPickerStore.getState()
    if (!editor) {
      closePicker()
      return
    }
    const pos = insertPos ?? editor.state.selection.from
    editor
      .chain()
      .focus()
      .insertContentAt(pos, {
        type: "wikiDocumentReference",
        attrs: { documentId: doc.id },
      })
      .run()
    closePicker()
  }

  // Helpers re-bound the stored rawActiveIndex against the current filtered
  // set, so arrow-key navigation after a filter change moves from the
  // bounded cursor, not a stale out-of-range one.
  function clampToFiltered(i: number): number {
    if (filtered.length === 0) return 0
    return Math.min(Math.max(0, i), filtered.length - 1)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      // Skip over disabled rows when navigating.
      setRawActiveIndex((i) => {
        const cur = clampToFiltered(i)
        for (let next = cur + 1; next < filtered.length; next++) {
          if (!excludeSet.has(filtered[next].id)) return next
        }
        return cur
      })
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setRawActiveIndex((i) => {
        const cur = clampToFiltered(i)
        for (let next = cur - 1; next >= 0; next--) {
          if (!excludeSet.has(filtered[next].id)) return next
        }
        return cur
      })
    } else if (e.key === "Enter") {
      e.preventDefault()
      const doc = filtered[activeIndex]
      if (doc) insertDocument(doc)
    }
  }

  const virtualItems = virtualizer.getVirtualItems()

  return (
    // min-w-0 propagates down the flex/grid chain so a long, unbreakable
    // title can shrink past its intrinsic size and `truncate` actually
    // kicks in. Without it, grid items default to `min-width: auto`
    // (=content width) and the row pushes the dialog past its max-w.
    <div className="flex min-w-0 flex-col gap-2">
      <div className="relative min-w-0">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search documents by title…"
          className="pl-8"
        />
      </div>
      {/* overflow-x-hidden is a defensive clip: even if a single token in
          a title has no break opportunity and refuses to truncate, the row
          gets visually contained inside the bordered list area. */}
      <div
        ref={scrollRef}
        className="max-h-72 min-w-0 overflow-x-hidden overflow-y-auto rounded-md border bg-card"
      >
        {isLoading && filtered.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">
            {search.trim()
              ? "No documents match this search."
              : "No documents in this operation yet."}
          </div>
        ) : (
          <div
            style={{ height: virtualizer.getTotalSize() }}
            className="relative w-full"
          >
            {virtualItems.map((item) => {
              const d = filtered[item.index]
              if (!d) return null
              const isActive = item.index === activeIndex
              const isExcluded = excludeSet.has(d.id)
              const ancestors = ancestorsByDocId.get(d.id) ?? []
              return (
                <button
                  key={d.id}
                  ref={virtualizer.measureElement}
                  data-index={item.index}
                  type="button"
                  disabled={isExcluded}
                  onMouseEnter={() =>
                    !isExcluded && setRawActiveIndex(item.index)
                  }
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertDocument(d)}
                  aria-selected={isActive}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${item.start}px)`,
                  }}
                  className={cn(
                    "flex w-full min-w-0 items-start gap-2 border-b px-3 py-2 text-left text-sm outline-hidden last:border-b-0",
                    isExcluded
                      ? "cursor-not-allowed text-muted-foreground"
                      : isActive
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-accent/60",
                  )}
                >
                  <DocumentIcon
                    emoji={d.emoji}
                    icon={d.icon}
                    color={d.color}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">
                      {(d.title ?? "") || "Untitled"}
                    </span>
                    <WikiAncestorBreadcrumb
                      ancestors={ancestors}
                      className="truncate"
                    />
                  </span>
                  {isExcluded ? (
                    <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">
                      current document
                    </span>
                  ) : d.childCount > 0 ? (
                    <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">
                      {d.childCount}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Local error boundary. The picker dialog mounts at the page level, outside
// any other boundary — without this, a render error in the body would
// unwind the whole wiki page and the user would see a blank screen with no
// clue what went wrong. Logs to console.error so the surrounding window
// listeners can capture stack traces.
interface PickerErrorBoundaryProps {
  onClose: () => void
  children: ReactNode
}

interface PickerErrorBoundaryState {
  error: Error | null
}

class PickerErrorBoundary extends Component<
  PickerErrorBoundaryProps,
  PickerErrorBoundaryState
> {
  state: PickerErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): PickerErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "[WikiDocumentPicker] render error:",
      error,
      info.componentStack,
    )
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <p className="font-medium text-destructive">
            Document picker crashed
          </p>
          <pre className="max-h-40 overflow-auto text-xs text-destructive/80">
            {this.state.error.message}
            {this.state.error.stack ? `\n\n${this.state.error.stack}` : ""}
          </pre>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                this.setState({ error: null })
                this.props.onClose()
              }}
              className="rounded-md border bg-background px-3 py-1 text-xs"
            >
              Dismiss
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
