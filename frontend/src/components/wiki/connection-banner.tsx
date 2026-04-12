import { LoaderIcon } from "lucide-react"
import type { ConnectionStatus } from "@/hooks/use-hocuspocus"

interface ConnectionBannerProps {
  connectionStatus: ConnectionStatus
  isSynced: boolean
  isReady: boolean
}

export function ConnectionBanner({ connectionStatus, isSynced, isReady }: ConnectionBannerProps) {
  if (!isReady) return null
  if (connectionStatus === "connected" && isSynced) return null

  return (
    <div
      className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
      role="status"
    >
      <LoaderIcon className="size-4 animate-spin" />
      {connectionStatus === "disconnected"
        ? "Reconnecting\u2026 your edits are saved locally."
        : "Syncing\u2026"}
    </div>
  )
}
