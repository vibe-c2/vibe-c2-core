import { LoaderIcon } from "lucide-react"

interface ConnectionBannerProps {
  isConnected: boolean
  isSynced: boolean
}

export function ConnectionBanner({ isConnected, isSynced }: ConnectionBannerProps) {
  if (isConnected && isSynced) return null

  return (
    <div
      className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
      role="status"
    >
      <LoaderIcon className="size-4 animate-spin" />
      {!isConnected
        ? "Reconnecting\u2026 your edits are saved locally."
        : "Syncing\u2026"}
    </div>
  )
}
