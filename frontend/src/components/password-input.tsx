import { type KeyboardEvent, useState } from "react"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  // Shown below the field while Caps Lock is on. Pass false to disable.
  capsLockHint?: boolean
}

// Password field with a show/hide toggle and a Caps Lock warning. The toggle
// is excluded from the tab order so keyboard users move straight from the
// field to the submit button; it stays reachable by mouse and screen reader.
export function PasswordInput({
  className,
  capsLockHint = true,
  onKeyDown,
  onKeyUp,
  onBlur,
  ...props
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isCapsLockOn, setIsCapsLockOn] = useState(false)

  function trackCapsLock(e: KeyboardEvent<HTMLInputElement>) {
    // getModifierState is the only reliable signal; it is absent in some
    // synthetic events, hence the guard.
    if (typeof e.getModifierState === "function") {
      setIsCapsLockOn(e.getModifierState("CapsLock"))
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Input
          type={isVisible ? "text" : "password"}
          className={cn("pr-9", className)}
          onKeyDown={(e) => {
            trackCapsLock(e)
            onKeyDown?.(e)
          }}
          onKeyUp={(e) => {
            trackCapsLock(e)
            onKeyUp?.(e)
          }}
          onBlur={(e) => {
            setIsCapsLockOn(false)
            onBlur?.(e)
          }}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          tabIndex={-1}
          aria-label={isVisible ? "Hide password" : "Show password"}
          aria-pressed={isVisible}
          onClick={() => setIsVisible((v) => !v)}
          className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          {isVisible ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
        </Button>
      </div>
      {capsLockHint && isCapsLockOn && (
        <p role="status" className="text-xs text-muted-foreground">
          Caps Lock is on.
        </p>
      )}
    </div>
  )
}
