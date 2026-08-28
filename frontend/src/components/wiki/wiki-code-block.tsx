import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type ReactNodeViewProps,
} from "@tiptap/react"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
} from "react"
import { ChevronsDownUpIcon, ChevronsUpDownIcon, WrapTextIcon } from "lucide-react"
import { CODE_LANGUAGES } from "@/lib/wiki-lowlight"
import { CodeCopyButton } from "@/components/wiki/wiki-code-copy-button"
import { useWikiCodeExpansionStore } from "@/stores/wiki-code-expansion"

// Code blocks taller than this many logical lines render collapsed by default
// to a fixed-height preview (see wiki-editor.css), with a toolbar toggle to
// expand to full height.
//
// Kept well above a typical function length: every collapsed block is a
// reading interruption, so collapsing should signal "this one is genuinely
// long", not "this one is a normal snippet".
//
// Logical-line count is computed synchronously from the text so the collapse
// decision is flash-free on first paint (unlike the wrap-aware wrap marks,
// which require DOM measurement).
const COLLAPSE_LINES = 35

// How tall that preview is — deliberately NOT COLLAPSE_LINES. The threshold
// answers "is this block long enough to be worth interrupting for?"; the
// preview answers "how much do we show of one we interrupted for?". Tying
// them together makes the preview grow with the threshold, and a 35-line
// preview is ~730px — most of the editor pane, so a "collapsed" block still
// costs a full screen to scroll past and collapsing buys nothing. Must stay
// below COLLAPSE_LINES or a collapsed block would hide no lines at all.
const PREVIEW_LINES = 16

// Constant, so it is built once for the whole app rather than per block per
// render. Handing the number to CSS keeps `--wiki-code-collapsed-max` and
// PREVIEW_LINES from drifting apart.
const COLLAPSE_STYLE = {
  "--wiki-code-preview-lines": PREVIEW_LINES,
} as CSSProperties

// One row in the line-number gutter. `number` is the leading row of a logical
// line; `wrap` is a continuation marker rendered where a number would be when
// soft-wrap pushed the previous logical line onto another visual row.
type LineMark = { kind: "number"; value: number } | { kind: "wrap" }

function marksEqual(a: LineMark[], b: LineMark[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]
    const y = b[i]
    if (x.kind !== y.kind) return false
    if (x.kind === "number" && y.kind === "number" && x.value !== y.value) return false
  }
  return true
}

// Count how many *visual* rows a slice [startChar, endChar) of `root`'s text
// content occupies. With `pre-wrap`, a single logical line can wrap to N rows
// when its rendered width exceeds the container — we detect that by walking
// the rendered text nodes, building a Range over the slice, and counting
// distinct `top` values across its client rects.
function countVisualLines(root: Element, startChar: number, endChar: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let pos = 0
  let startNode: Text | null = null
  let startOffset = 0
  let endNode: Text | null = null
  let endOffset = 0
  let node: Node | null = walker.nextNode()
  while (node) {
    const text = node as Text
    const len = text.nodeValue?.length ?? 0
    if (!startNode && pos + len >= startChar) {
      startNode = text
      startOffset = startChar - pos
    }
    if (startNode && pos + len >= endChar) {
      endNode = text
      endOffset = endChar - pos
      break
    }
    pos += len
    node = walker.nextNode()
  }
  if (!startNode || !endNode) return 1
  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  const rects = range.getClientRects()
  if (rects.length === 0) return 1
  const tops = new Set<number>()
  for (let i = 0; i < rects.length; i++) {
    tops.add(Math.round(rects[i].top))
  }
  return Math.max(1, tops.size)
}

// Soft-wrap gutter: one row per *visual* line, so the numbers stay pinned to
// the code even where a logical line broke across several rows. Only wrap mode
// needs this — see `numberedMarks` for the measurement-free case.
function computeWrapMarks(codeEl: Element): LineMark[] {
  const logicalLines = (codeEl.textContent ?? "").split("\n")
  const marks: LineMark[] = []
  let pos = 0
  for (let i = 0; i < logicalLines.length; i++) {
    const lineLen = logicalLines[i].length
    const visual = lineLen === 0 ? 1 : countVisualLines(codeEl, pos, pos + lineLen)
    marks.push({ kind: "number", value: i + 1 })
    for (let j = 1; j < visual; j++) {
      marks.push({ kind: "wrap" })
    }
    pos += lineLen + 1
  }
  return marks
}

export function WikiCodeBlock({ node, updateAttributes, editor, getPos }: ReactNodeViewProps) {
  const language: string = node.attrs.language ?? "plaintext"
  const languageLabel =
    CODE_LANGUAGES.find((l) => l.value === language)?.label ?? language
  const wrap: boolean = node.attrs.wrap ?? false
  const isEditable = editor.isEditable
  const preRef = useRef<HTMLPreElement>(null)
  const text = node.textContent

  // Collapse state. A block is collapsible only when it exceeds the line
  // threshold; collapsed-by-default until the viewer expands it. Expansion is
  // keyed by the stable `blockId` attr and lives in a per-viewer store so it
  // survives remote edits recreating this NodeView. Blocks authored before
  // this feature (or seen in read-only mode where we never mutate the doc)
  // have no id yet — those fall back to local component state, which is reset
  // by a remote-edit re-render but is otherwise correct.
  const lineCount = text.split("\n").length // "".split("\n") is [""] → 1
  const collapsible = lineCount > COLLAPSE_LINES
  // Resolved from the persisted attr; the assigning effect below dispatches an
  // updateAttributes that refreshes this prop (blockId is part of the
  // NodeView's update guard in wiki-editor.tsx), so no local mirror is needed.
  const blockId: string | null = node.attrs.blockId
  const assignedIdRef = useRef(false)
  const [localExpanded, setLocalExpanded] = useState(false)
  const setStoredExpanded = useWikiCodeExpansionStore((s) => s.setExpanded)
  const storedExpanded = useWikiCodeExpansionStore((s) =>
    blockId ? s.expanded.has(blockId) : false,
  )
  // Either source counts as expanded, and both are written on every change.
  // The id is backfilled from an effect a tick after mount, so a block can be
  // expanded while `blockId` is still null — OR-ing means that expansion
  // isn't silently dropped the moment the id lands, and writing both means
  // the stale source can never outvote a later collapse.
  const expanded = storedExpanded || localExpanded
  const collapsed = collapsible && !expanded

  const setExpanded = useCallback(
    (next: boolean) => {
      if (blockId) setStoredExpanded(blockId, next)
      setLocalExpanded(next)
    },
    [blockId, setStoredExpanded],
  )

  // Lazily backfill a stable id on the first edit-mode mount of a block that
  // lacks one. Write-once: guarded on both the persisted attr and the local
  // ref so it never loops or re-assigns. Read-only viewers never run this
  // (they must not mutate the shared document).
  useEffect(() => {
    if (!isEditable) return
    if (node.attrs.blockId || assignedIdRef.current) return
    assignedIdRef.current = true
    updateAttributes({ blockId: crypto.randomUUID() })
  }, [isEditable, node.attrs.blockId, updateAttributes])

  // Subscribe to editor state so the toolbar reactively appears whenever the
  // cursor enters the text range of THIS node and hides when it leaves.
  const cursorInside =
    useEditorState({
      editor,
      selector: ({ editor: e }) => {
        if (!e.isEditable) return false
        const pos = typeof getPos === "function" ? getPos() : undefined
        if (pos == null) return false
        const { from, to } = e.state.selection
        return from >= pos && to <= pos + node.nodeSize
      },
    }) ?? false

  // Entering a collapsed block with the caret expands it. Editing through a
  // fixed-height porthole is miserable on its own, but the load-bearing
  // reason is that a collapsed block is inert (not a scroll container) until
  // engaged — so the caret must never be able to land in the clipped region,
  // where ProseMirror's scrollIntoView would have nothing to scroll and would
  // walk up to the document scroller instead, chasing a caret that is not
  // visible. Expanding on entry keeps the caret and the clip apart entirely.
  //
  // Fires only on the false→true edge, so hitting Collapse while the caret is
  // still inside isn't immediately undone. Read-only viewers have no caret
  // (`cursorInside` is pinned false there), so this never runs for them.
  const wasCursorInsideRef = useRef(false)
  useEffect(() => {
    const entered = cursorInside && !wasCursorInsideRef.current
    wasCursorInsideRef.current = cursorInside
    if (entered && collapsible) setExpanded(true)
  }, [cursorInside, collapsible, setExpanded])

  // Without soft wrap, one logical line is one visual row, so the gutter is
  // fully determined by `lineCount` — derive it in render rather than
  // measuring the DOM. That is the common case, and keeping it out of an
  // effect means a code block paints its final gutter on the first render
  // instead of rendering once with a seed value and again from the effect.
  const numberedMarks = useMemo<LineMark[]>(
    () =>
      Array.from({ length: lineCount }, (_, i) => ({
        kind: "number" as const,
        value: i + 1,
      })),
    [lineCount],
  )

  // Soft wrap is the only case that needs the layout engine: where a line
  // broke is a rendered-DOM fact, not derivable from the text. Only read while
  // wrap is on, and the layout effect below re-measures before the first paint
  // of any render that turns wrap on — so a measurement left over from an
  // earlier wrap session can never reach the screen.
  const [wrapMarks, setWrapMarks] = useState<LineMark[] | null>(null)
  const marks = wrap ? (wrapMarks ?? numberedMarks) : numberedMarks

  // `useLayoutEffect` so the gutter is corrected before the browser paints the
  // new code content — otherwise it would briefly desync from the lines.
  // The marksEqual guard makes this idempotent, so no cascading-render risk.
  useLayoutEffect(() => {
    if (!wrap) return
    const codeEl = preRef.current?.querySelector("code")
    if (!codeEl) return
    const next = computeWrapMarks(codeEl)
    setWrapMarks((prev) => (prev && marksEqual(prev, next) ? prev : next))
  }, [text, wrap, language])

  // Wrap mode only: re-measure on container resize. Width changes alone don't
  // touch ProseMirror state, so without this the gutter would lag behind the
  // wrap point until the user typed again.
  useEffect(() => {
    if (!wrap) return
    const codeEl = preRef.current?.querySelector("code")
    if (!codeEl) return
    const recompute = () => {
      const next = computeWrapMarks(codeEl)
      setWrapMarks((prev) => (prev && marksEqual(prev, next) ? prev : next))
    }
    const observer = new ResizeObserver(recompute)
    observer.observe(codeEl)
    return () => observer.disconnect()
  }, [wrap])

  return (
    <NodeViewWrapper
      className="wiki-code-block"
      style={COLLAPSE_STYLE}
      data-editable={isEditable ? "true" : "false"}
      data-cursor-inside={cursorInside ? "true" : "false"}
      data-wrap={wrap ? "true" : "false"}
      data-collapsed={collapsed ? "true" : "false"}
    >
      <div className="wiki-code-block__toolbar" contentEditable={false}>
        <CodeCopyButton getText={() => node.textContent ?? ""} />
        {collapsible && (
          <button
            type="button"
            className="wiki-code-block__collapse"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setExpanded(collapsed)}
            aria-label={collapsed ? `Show all ${lineCount} lines` : "Collapse code"}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronsUpDownIcon size={13} />
            ) : (
              <ChevronsDownUpIcon size={13} />
            )}
            <span>{collapsed ? `Show all ${lineCount}` : "Collapse"}</span>
          </button>
        )}
        {isEditable && (
          <button
            type="button"
            className="wiki-code-block__wrap"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => updateAttributes({ wrap: !wrap })}
            aria-label={wrap ? "Disable soft wrap" : "Enable soft wrap"}
            aria-pressed={wrap}
          >
            <WrapTextIcon size={14} />
          </button>
        )}
        {isEditable ? (
          <select
            className="wiki-code-block__select"
            value={language}
            onChange={(e) => updateAttributes({ language: e.target.value })}
            aria-label="Code language"
          >
            {CODE_LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="wiki-code-block__language">
            {languageLabel}
          </span>
        )}
      </div>
      {/* Read mode has no caret, so focus is what marks a collapsed block as
          "engaged" and turns its inert preview back into a scroll viewport
          (see wiki-editor.css). Making it focusable is also the standing a11y
          fix for a scroll region keyboard users otherwise cannot reach — once
          focused, the arrow and page keys scroll it natively.
          `group` rather than the usual `region` because a code-heavy document
          holds dozens of these, and each one as a landmark would swamp
          landmark navigation; `group` still carries the accessible name. */}
      <div
        className="wiki-code-block__body"
        {...(!isEditable && collapsed
          ? {
              tabIndex: 0,
              role: "group",
              "aria-label": `${languageLabel} code block, ${lineCount} lines`,
              // Disengaging rewinds the preview. A hidden overflow keeps its
              // scroll offset, so without this a block left mid-scroll would
              // rest on some arbitrary interior window — reading as a broken
              // block that starts at line 60. At rest the preview always
              // shows the block's start; holding a position is what the
              // "Show all N" expand is for.
              onBlur: (e: FocusEvent<HTMLDivElement>) => {
                if (e.currentTarget.contains(e.relatedTarget)) return
                e.currentTarget.scrollTop = 0
              },
            }
          : {})}
      >
        <div className="wiki-code-block__gutter" contentEditable={false} aria-hidden="true">
          {marks.map((m, i) =>
            m.kind === "number" ? (
              <span key={i} className="wiki-code-block__line">
                {m.value}
              </span>
            ) : (
              <span
                key={i}
                className="wiki-code-block__line wiki-code-block__line--wrap"
              >
                ↪
              </span>
            ),
          )}
        </div>
        <pre className="wiki-code-block__pre" ref={preRef}>
          {/* `style.whiteSpace` is set inline because `NodeViewContent` from
              @tiptap/react hardcodes `whiteSpace: 'pre-wrap'` as an inline
              style — that beats any class-based CSS rule, so toggling wrap
              via `data-wrap` alone has no effect on `<code>`. Setting our own
              `style.whiteSpace` lets the wrap toggle actually do what it
              says. The companion `word-break` / `overflow-wrap` declarations
              still come from CSS via the `data-wrap` attribute. */}
          <NodeViewContent<"code">
            as="code"
            className={`hljs language-${language}`}
            style={{ whiteSpace: wrap ? "pre-wrap" : "pre" }}
          />
        </pre>
      </div>
    </NodeViewWrapper>
  )
}
