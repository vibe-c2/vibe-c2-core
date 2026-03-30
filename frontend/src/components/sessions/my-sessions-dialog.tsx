import { useMemo, useState } from "react"
import { LoaderIcon, ShieldXIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useSessionStore } from "@/stores/sessions"
import {
  useInfiniteMySessions,
  useRevokeAllMySessions,
} from "@/graphql/hooks/sessions"
import { SessionItem } from "./session-item"
import { RevokeSessionDialog } from "./revoke-session-dialog"

export function MySessionsDialog() {
  const { mySessionsDialogOpen, closeDialogs, openRevokeDialog } = useSessionStore()
  const [activeOnly, setActiveOnly] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteMySessions({ activeOnly })

  const revokeAll = useRevokeAllMySessions()

  // Session subscription runs globally in useSessionGuard (ProtectedRoute).
  // Cache invalidation is handled there — no need for a duplicate subscription.

  const sessions = useMemo(
    () => data?.pages.flatMap((page) => page.mySessions.edges.map((e) => e.node)) ?? [],
    [data],
  )

  const activeCount = useMemo(
    () => sessions.filter((s) => s.status === "ACTIVE").length,
    [sessions],
  )

  async function handleRevokeAll() {
    setError(null)
    try {
      await revokeAll.mutateAsync()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke sessions")
    }
  }

  return (
    <>
      <Dialog
        open={mySessionsDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeDialogs()
            setError(null)
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>My Sessions</DialogTitle>
            <DialogDescription>
              Manage your active sessions across devices.
            </DialogDescription>
          </DialogHeader>

          {/* Controls */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Switch
                id="active-only"
                checked={activeOnly}
                onCheckedChange={setActiveOnly}
              />
              <Label htmlFor="active-only" className="text-sm">
                Active only
              </Label>
            </div>
            {activeCount > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRevokeAll}
                disabled={revokeAll.isPending}
              >
                <ShieldXIcon className="size-4" />
                {revokeAll.isPending ? "Revoking..." : "Revoke all others"}
              </Button>
            )}
          </div>

          {error && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Session list */}
          <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
            {isLoading && (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            )}

            {!isLoading && sessions.length === 0 && (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                No sessions found.
              </div>
            )}

            {sessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                onRevoke={(id) => openRevokeDialog(id, false)}
              />
            ))}

            {hasNextPage && (
              <div className="flex justify-center py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? (
                    <LoaderIcon className="size-4 animate-spin" />
                  ) : (
                    "Load more"
                  )}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <RevokeSessionDialog />
    </>
  )
}
