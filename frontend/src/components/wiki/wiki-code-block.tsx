import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { WrapTextIcon } from "lucide-react"
import { CODE_LANGUAGES } from "@/lib/wiki-lowlight"
import { CodeCopyButton } from "@/components/wiki/wiki-code-copy-button"

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

function computeLineMarks(codeEl: Element, wrap: boolean): LineMark[] {
  const logicalLines = (codeEl.textContent ?? "").split("\n")
  if (!wrap) {
    return logicalLines.map((_, i) => ({ kind: "number", value: i + 1 }))
  }
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
  const wrap: boolean = node.attrs.wrap ?? false
  const isEditable = editor.isEditable
  const preRef = useRef<HTMLPreElement>(null)
  const [marks, setMarks] = useState<LineMark[]>([{ kind: "number", value: 1 }])
  const text = node.textContent

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

  // Recompute marks after every text/wrap/language change. `useLayoutEffect`
  // because we want the gutter updated before the browser paints the new
  // code content — otherwise the gutter would briefly desync from the lines.
  useLayoutEffect(() => {
    const codeEl = preRef.current?.querySelector("code")
    if (!codeEl) return
    const next = computeLineMarks(codeEl, wrap)
    setMarks((prev) => (marksEqual(prev, next) ? prev : next))
  }, [text, wrap, language])

  // Wrap mode only: re-measure on container resize. Width changes alone don't
  // touch ProseMirror state, so without this the gutter would lag behind the
  // wrap point until the user typed again.
  useEffect(() => {
    if (!wrap) return
    const codeEl = preRef.current?.querySelector("code")
    if (!codeEl) return
    const recompute = () => {
      const next = computeLineMarks(codeEl, true)
      setMarks((prev) => (marksEqual(prev, next) ? prev : next))
    }
    const observer = new ResizeObserver(recompute)
    observer.observe(codeEl)
    return () => observer.disconnect()
  }, [wrap])

  return (
    <NodeViewWrapper
      className="wiki-code-block"
      data-editable={isEditable ? "true" : "false"}
      data-cursor-inside={cursorInside ? "true" : "false"}
      data-wrap={wrap ? "true" : "false"}
    >
      <div className="wiki-code-block__toolbar" contentEditable={false}>
        <CodeCopyButton getText={() => node.textContent ?? ""} />
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
            {CODE_LANGUAGES.find((l) => l.value === language)?.label ?? language}
          </span>
        )}
      </div>
      <div className="wiki-code-block__body">
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
