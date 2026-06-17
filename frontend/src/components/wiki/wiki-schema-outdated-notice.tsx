import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Blocking state shown in place of the editor when the backend refuses the
 * collab connection because this browser tab is running an outdated app
 * bundle (see SchemaOutdatedError / the collab-ticket schema gate). Editing is
 * withheld because a stale editor would prune document content it can't
 * represent; reloading pulls the current bundle and restores editing.
 */
export function WikiSchemaOutdatedNotice() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center"
      role="alert"
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
        <TriangleAlertIcon className="size-6" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-base font-semibold text-foreground">
          This page was updated in a newer version
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your app is out of date and can&apos;t safely edit this document.
          Reload to get the latest version and continue editing.
        </p>
      </div>
      <Button onClick={() => window.location.reload()}>
        <RefreshCwIcon className="size-4" />
        Reload
      </Button>
    </div>
  )
}
