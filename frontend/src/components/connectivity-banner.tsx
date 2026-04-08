import { useConnectivityStore } from "@/stores/connectivity"

// Thin banner shown at the top of the viewport whenever the backend has been
// observed to be unreachable (network error, 5xx, gateway timeout). Flips
// back to hidden on the first successful response. Decouples "backend is
// down" from "user is logged out" in the UX.
export function ConnectivityBanner() {
  const showBanner = useConnectivityStore((s) => s.showBanner)
  if (!showBanner) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[100] bg-amber-500 px-4 py-1.5 text-center text-sm font-medium text-amber-950 shadow"
    >
      Backend unreachable — reconnecting…
    </div>
  )
}
