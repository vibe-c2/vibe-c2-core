import { type FormEvent, useEffect, useRef, useMemo } from "react"
import { toast } from "sonner"
import { ClockIcon, RotateCcwIcon, Trash2Icon } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useWikiStore } from "@/stores/wiki"
import { useWikiDocumentBackups, useCreateWikiDocumentBackup } from "@/graphql/hooks/wiki"
import { relativeTime, formatAbsolute, dayGroup } from "@/lib/relative-time"
import { formatBytes } from "@/lib/format-bytes"
import { getBackupVisual } from "./wiki-backup-visual"
import { WikiBackupPreviewDialog } from "./wiki-backup-preview-dialog"
import { WikiBackupConfirmDialog } from "./wiki-backup-confirm-dialog"

type BackupListNode = NonNullable<
  ReturnType<typeof useWikiDocumentBackups>["data"]
>["pages"][number]["wikiDocumentBackups"]["edges"][number]["node"]

export function WikiBackupPanel() {
  const { backupPanelOpen, backupDocumentId, closeBackupPanel } = useWikiStore()

  if (!backupDocumentId) return null

  return (
    <>
      <Sheet open={backupPanelOpen} onOpenChange={(open) => !open && closeBackupPanel()}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Backup History</SheetTitle>
          </SheetHeader>
          <BackupPanelContent documentId={backupDocumentId} />
        </SheetContent>
      </Sheet>
      <WikiBackupPreviewDialog />
      <WikiBackupConfirmDialog />
    </>
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

  const groups = useMemo(() => {
    const flat: BackupListNode[] =
      data?.pages.flatMap((p) => p.wikiDocumentBackups.edges.map((e) => e.node)) ?? []
    return groupByDay(flat)
  }, [data])

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
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    const description = (form.get("description") as string).trim() || undefined
    try {
      await createBackup.mutateAsync({ documentId, description })
      formEl.reset()
      toast.success("Backup created")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create backup")
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <form onSubmit={handleCreate} className="flex gap-2 border-b px-4 pb-3">
        <Input
          name="description"
          placeholder="Description (optional)"
          className="h-8 flex-1 text-sm"
          disabled={createBackup.isPending}
        />
        <Button type="submit" size="sm" disabled={createBackup.isPending}>
          {createBackup.isPending ? "Saving..." : "Create"}
        </Button>
      </form>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <LoadingState />
        ) : groups.length === 0 ? (
          <EmptyState />
        ) : (
          groups.map((group) => (
            <section key={group.key}>
              <SectionHeader label={group.label} />
              <div className="px-2">
                {group.items.map((backup) => (
                  <BackupRow
                    key={backup.id}
                    backup={backup}
                    documentId={documentId}
                  />
                ))}
              </div>
            </section>
          ))
        )}
        <div ref={sentinelRef} className="h-1" />
      </div>
    </div>
  )
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-10 bg-popover/95 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
      {label}
    </div>
  )
}

function BackupRow({
  backup,
  documentId,
}: {
  backup: BackupListNode
  documentId: string
}) {
  const { openBackupPreview, openBackupConfirm } = useWikiStore()
  const visual = getBackupVisual(backup)
  const Icon = visual.Icon

  const hasDescription = backup.description.trim().length > 0
  const primary = hasDescription ? backup.description : relativeTime(backup.createdAt)
  const size = formatBytes(backup.contentLength)
  const author = backup.createdBy?.username ?? "system"
  const secondary = hasDescription
    ? `${relativeTime(backup.createdAt)} · ${visual.label} · by ${author} · ${size}`
    : `${visual.label} · by ${author} · ${size}`

  function stop(e: React.MouseEvent) {
    e.stopPropagation()
  }

  return (
    <button
      type="button"
      onClick={() => openBackupPreview(backup.id)}
      className="group flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent/40 focus-visible:bg-accent/50 focus-visible:outline-none"
    >
      <Icon
        className={`size-4 shrink-0 ${visual.iconClass}`}
        aria-label={visual.label}
      />
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-medium"
          title={formatAbsolute(backup.createdAt)}
        >
          {primary}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">{secondary}</p>
      </div>
      <div
        className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
        onClick={stop}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => {
                  stop(e)
                  openBackupConfirm({
                    backupId: backup.id,
                    documentId,
                    action: "restore",
                    createdAt: backup.createdAt,
                    trigger: backup.trigger,
                    description: backup.description,
                  })
                }}
              />
            }
          >
            <RotateCcwIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>Restore</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => {
                  stop(e)
                  openBackupConfirm({
                    backupId: backup.id,
                    documentId,
                    action: "delete",
                    createdAt: backup.createdAt,
                    trigger: backup.trigger,
                    description: backup.description,
                  })
                }}
              />
            }
          >
            <Trash2Icon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>Delete</TooltipContent>
        </Tooltip>
      </div>
    </button>
  )
}

function LoadingState() {
  return (
    <div>
      <SectionHeader label="Today" />
      <div className="px-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 px-2 py-2"
            aria-hidden
          >
            <Skeleton className="size-4 shrink-0 rounded" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 px-8 py-12 text-center">
      <ClockIcon className="size-8 text-muted-foreground/60" aria-hidden />
      <p className="text-sm font-medium">No backups yet</p>
      <p className="text-xs text-muted-foreground">
        Click <span className="font-medium text-foreground">Create</span> to
        snapshot this document. Auto-snapshots run every 30 minutes when
        content changes.
      </p>
    </div>
  )
}

function groupByDay(
  backups: BackupListNode[],
): { key: string; label: string; items: BackupListNode[] }[] {
  if (backups.length === 0) return []
  const now = new Date()
  const buckets = new Map<string, { key: string; label: string; items: BackupListNode[] }>()
  const order: string[] = []
  for (const backup of backups) {
    const { key, label } = dayGroup(backup.createdAt, now)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { key, label, items: [] }
      buckets.set(key, bucket)
      order.push(key)
    }
    bucket.items.push(backup)
  }
  return order.map((k) => buckets.get(k)!)
}
