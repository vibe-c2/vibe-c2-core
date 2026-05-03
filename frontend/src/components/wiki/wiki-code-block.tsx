import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { WrapTextIcon } from "lucide-react"
import { CODE_LANGUAGES } from "@/lib/wiki-lowlight"
import { CodeCopyButton } from "@/components/wiki/wiki-code-copy-button"

export function WikiCodeBlock({ node, updateAttributes, editor, getPos }: ReactNodeViewProps) {
  const language: string = node.attrs.language ?? "plaintext"
  const wrap: boolean = node.attrs.wrap ?? false
  const isEditable = editor.isEditable

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

  return (
    <NodeViewWrapper
      className="wiki-code-block wiki-node--toolbar-top"
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
      <pre className="wiki-code-block__pre">
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
    </NodeViewWrapper>
  )
}
