import type { ReactNode } from "react"
import { TerminalSquareIcon } from "lucide-react"
import { AuthBackground } from "@/components/auth-background"
import { ModeToggle } from "@/components/mode-toggle"
import { useScrambleText } from "@/hooks/use-scramble-text"

const WORDMARK = "Vibe C2"

// Shared frame for the unauthenticated pages (login, enroll): digital-rain
// background, wordmark that resolves out of scrambled glyphs, theme toggle
// in the corner. Keeps the two pages from drifting apart visually.
export function AuthShell({ children }: { children: ReactNode }) {
  const wordmark = useScrambleText(WORDMARK)

  return (
    <div className="relative isolate flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <AuthBackground />
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-start font-medium">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <TerminalSquareIcon className="size-4" aria-hidden="true" />
          </div>
          {/* Screen readers get the real name; the scramble is visual only. */}
          <span aria-label={WORDMARK} className="tabular-nums">
            <span aria-hidden="true">{wordmark}</span>
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}
