import { useState } from "react"
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react"
import { CheckIcon, CopyIcon } from "lucide-react"
import { toast } from "sonner"
import { CODE_LANGUAGES } from "@/lib/wiki-lowlight"

const COPIED_RESET_MS = 1500

export function WikiCodeBlock({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const [copied, setCopied] = useState(false)
  const language: string = node.attrs.language ?? "plaintext"
  const isEditable = editor.isEditable

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
    <NodeViewWrapper className="wiki-code-block">
      <div className="wiki-code-block__toolbar" contentEditable={false}>
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
        <button
          type="button"
          className="wiki-code-block__copy"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="wiki-code-block__pre">
        <NodeViewContent<"code"> as="code" className={`hljs language-${language}`} />
      </pre>
    </NodeViewWrapper>
  )
}
