import { useState } from "react"
import { toast } from "sonner"
import { AlertTriangleIcon, CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Shows a freshly-minted credential exactly once. Shared by the API key and
 * agent key surfaces — both mint tokens the server never stores, so both need
 * identical copy-it-now semantics.
 *
 * Defaults to masked to discourage shoulder-surfing; the user reveals it
 * deliberately, then must confirm "I've saved it" to dismiss, which prevents
 * closing over an uncopied secret.
 */
export function FreshTokenBanner({
  token,
  onDismiss,
}: {
  token: string
  onDismiss: () => void
}) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Failed to copy to clipboard")
    }
  }

  return (
    <div className="min-w-0 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 space-y-2">
      <div className="flex items-start gap-2 text-sm text-yellow-700 dark:text-yellow-400">
        <AlertTriangleIcon className="size-4 mt-0.5 shrink-0" />
        <span>
          Copy this token now — it won&apos;t be shown again. If you lose it,
          you&apos;ll need to regenerate the key.
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <code className="flex-1 min-w-0 truncate rounded bg-background/80 px-2 py-1.5 font-mono text-xs">
          {revealed ? token : maskToken(token)}
        </code>
        <Button
          size="icon-sm"
          variant="outline"
          onClick={() => setRevealed((v) => !v)}
          title={revealed ? "Hide" : "Reveal"}
        >
          {revealed ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </Button>
        <Button size="icon-sm" variant="outline" onClick={handleCopy} title="Copy">
          {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
        </Button>
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          I&apos;ve saved it
        </Button>
      </div>
    </div>
  )
}

/**
 * Keeps the public prefix visible — so the user can confirm which key was
 * minted — while hiding the secret tail. Both token formats are
 * `<prefix>_<key_id>_<secret>`, so the last separator is the boundary.
 * Unexported: the banner is the only thing that should be deciding how much
 * of a live secret to put on screen.
 */
function maskToken(token: string): string {
  const lastSep = token.lastIndexOf("_")
  if (lastSep === -1) return "•".repeat(token.length)
  return token.slice(0, lastSep + 1) + "•".repeat(Math.max(8, token.length - lastSep - 1))
}
