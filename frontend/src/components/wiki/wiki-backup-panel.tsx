import { type FormEvent, useEffect, useRef, useMemo } from "react"
import { toast } from "sonner"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { useWikiStore } from "@/stores/wiki"
import {
  useWikiDocumentBackups,
  useCreateWikiDocumentBackup,
  useRestoreWikiDocumentBackup,
  useDeleteWikiDocumentBackup,
} from "@/graphql/hooks/wiki"

export function WikiBackupPanel() {
  const { backupPanelOpen, backupDocumentId, closeBackupPanel } = useWikiStore()

  if (!backupDocumentId) return null

  return (
    <Sheet open={backupPanelOpen} onOpenChange={(open) => !open && closeBackupPanel()}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Backup History</SheetTitle>
        </SheetHeader>
        <BackupPanelContent documentId={backupDocumentId} />
      </SheetContent>
    </Sheet>
  )
}

function BackupPanelContent({ documentId }: { documentId: string }) {
  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useWikiDocumentBackups(documentId)
  const createBackup = useCreateWikiDocumentBackup()
  const restoreBackup = useRestoreWikiDocumentBackup()
  const deleteBackup = useDeleteWikiDocumentBackup()

  const backups = useMemo(
    () =>
      data?.pages.flatMap((p) =>
        p.wikiDocumentBackups.edges.map((e) => e.node),
      ) ?? [],
    [data],
  )

  // Infinite scroll.
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!sentinelRef.current || !hasNextPage) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) fetchNextPage()
      },
      { threshold: 0.1 },
    )
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const description = (form.get("description") as string).trim() || undefined
    await createBackup.mutateAsync({ documentId, description })
    ;(e.target as HTMLFormElement).reset()
    toast.success("Backup created")
  }

  async function handleRestore(backupId: string) {
    if (!confirm("Restore to this backup? Current content will be overwritten.")) return
    await restoreBackup.mutateAsync({ documentId, backupId })
    toast.success("Backup restored")
  }

  async function handleDelete(backupId: string) {
    if (!confirm("Delete this backup?")) return
    await deleteBackup.mutateAsync({ id: backupId, documentId })
    toast.success("Backup deleted")
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Create backup form */}
      <form onSubmit={handleCreate} className="flex gap-2 border-b px-4 pb-3">
        <Input
          name="description"
          placeholder="Description (optional)"
          className="h-8 flex-1 text-sm"
        />
        <Button type="submit" size="sm" disabled={createBackup.isPending}>
          {createBackup.isPending ? "Saving..." : "Create"}
        </Button>
      </form>

      {/* Backup list */}
      <div className="flex-1 overflow-y-auto px-4">
        {isLoading ? (
          <div className="flex flex-col gap-2 py-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-16 rounded" />
            ))}
          </div>
        ) : backups.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No backups yet
          </p>
        ) : (
          backups.map((backup) => (
            <div key={backup.id} className="flex flex-col gap-1 border-b py-3 last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {new Date(backup.createdAt).toLocaleString()}
                </span>
                <Badge variant={backup.trigger === "AUTO" ? "secondary" : "outline"}>
                  {backup.trigger}
                </Badge>
              </div>
              {backup.description && (
                <p className="text-xs text-muted-foreground">{backup.description}</p>
              )}
              <p className="text-xs text-muted-foreground">
                by {backup.createdBy.username}
              </p>
              <div className="mt-1 flex gap-1">
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => handleRestore(backup.id)}
                  disabled={restoreBackup.isPending}
                >
                  Restore
                </Button>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => handleDelete(backup.id)}
                  disabled={deleteBackup.isPending}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
        <div ref={sentinelRef} className="h-1" />
      </div>
    </div>
  )
}
