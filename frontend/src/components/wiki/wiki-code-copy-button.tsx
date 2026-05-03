import { useState } from "react"
import { CheckIcon, CopyIcon } from "lucide-react"
import { toast } from "sonner"

interface CodeCopyButtonProps {
  getText: () => string
}

const COPIED_RESET_MS = 1500

/**
 * Shared copy button for both the code-block toolbar (WikiCodeBlock) and the
 * inline-code popover (WikiInlineCodePopover). Owns its own copied state and
 * 1.5s reset timer so both surfaces stay visually identical.
 */
export function CodeCopyButton({ getText }: CodeCopyButtonProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(getText())
      setCopied(true)
      setTimeout(() => setCopied(false), COPIED_RESET_MS)
    } catch {
      toast.error("Failed to copy code")
    }
  }

  return (
    <button
      type="button"
      className="wiki-code-block__copy"
      // Prevent mousedown from stealing ProseMirror's selection: otherwise the
      // caret leaves the code node/mark, the toolbar/popover hides via its
      // cursor-inside trigger, and the click is dropped before it lands.
      onMouseDown={(e) => e.preventDefault()}
      onClick={handleCopy}
      aria-label={copied ? "Copied" : "Copy code"}
    >
      {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  )
}
