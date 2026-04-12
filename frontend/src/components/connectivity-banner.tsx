import { useEffect, useState } from "react"
import { useConnectivityStore } from "@/stores/connectivity"

// Thin banner shown at the top of the viewport whenever the backend has been
// observed to be unreachable (network error, 5xx, gateway timeout). Flips
// back to hidden on the first successful response. Decouples "backend is
// down" from "user is logged out" in the UX.
export function ConnectivityBanner() {
  const showBanner = useConnectivityStore((s) => s.showBanner)
  const nextRetryAt = useConnectivityStore((s) => s.nextRetryAt)
  const retryNow = useConnectivityStore((s) => s.retryNow)

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!showBanner || nextRetryAt == null) {
      setSecondsLeft(null)
      return
    }

    function tick() {
      const remaining = Math.max(0, Math.ceil((nextRetryAt! - Date.now()) / 1000))
      setSecondsLeft(remaining)
    }

    tick()
    const id = setInterval(tick, 1_000)
    return () => clearInterval(id)
  }, [showBanner, nextRetryAt])

  if (!showBanner) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-sm font-medium text-amber-950 shadow"
    >
      <span>
        {secondsLeft != null && secondsLeft > 0
          ? `Backend unreachable \u2014 retrying in ${secondsLeft}s`
          : "Backend unreachable \u2014 retrying\u2026"}
      </span>
      <button
        type="button"
        onClick={retryNow}
        className="rounded bg-amber-950/15 px-2 py-0.5 text-xs font-semibold transition-colors hover:bg-amber-950/25"
      >
        Retry now
      </button>
    </div>
  )
}
