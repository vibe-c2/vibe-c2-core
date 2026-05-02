import { useState } from "react"
import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { CheckIcon, CopyIcon, WrapTextIcon } from "lucide-react"
import { toast } from "sonner"
import { CODE_LANGUAGES } from "@/lib/wiki-lowlight"

const COPIED_RESET_MS = 1500

export function WikiCodeBlock({ node, updateAttributes, editor, getPos }: ReactNodeViewProps) {
  const [copied, setCopied] = useState(false)
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

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(node.textContent ?? "")
      setCopied(true)
      setTimeout(() => setCopied(false), COPIED_RESET_MS)
    } catch {
      toast.error("Failed to copy code")
    }
  }

  return (
    <NodeViewWrapper
      className="wiki-code-block wiki-node--toolbar-top"
      data-editable={isEditable ? "true" : "false"}
      data-cursor-inside={cursorInside ? "true" : "false"}
      data-wrap={wrap ? "true" : "false"}
    >
      <div className="wiki-code-block__toolbar" contentEditable={false}>
        <button
          type="button"
          className="wiki-code-block__copy"
          // Prevent mousedown from stealing ProseMirror selection; otherwise
          // the cursor leaves the code block, data-cursor-inside flips to
          // "false", and the toolbar's pointer-events get killed before the
          // click lands. See wiki-image-node.tsx for the same pattern.
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
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
