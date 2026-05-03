import { useEffect, useRef, useMemo } from "react"
import { RotateCcwIcon, Trash2Icon, TrashIcon } from "lucide-react"
import { toast } from "sonner"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useWikiStore } from "@/stores/wiki"
import { cn } from "@/lib/utils"
import {
  useWikiDocumentTrash,
  useRestoreWikiDocument,
  useEmptyWikiDocumentTrash,
} from "@/graphql/hooks/wiki"

interface WikiTrashPanelProps {
  operationId: string
}

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—"
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 30) return `${diffDays}d ago`
  return new Date(dateStr).toLocaleDateString()
}

export function WikiTrashPanel({ operationId }: WikiTrashPanelProps) {
  const { trashPanelOpen, closeTrashPanel, openPermanentDeleteDialog } = useWikiStore()
  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useWikiDocumentTrash(operationId)
  const restoreDocument = useRestoreWikiDocument()
  const emptyTrash = useEmptyWikiDocumentTrash()

  const trashDocs = useMemo(
    () => data?.pages.flatMap((p) => p.wikiDocumentTrash.edges.map((e) => e.node)) ?? [],
    [data],
  )
  const totalCount = data?.pages[0]?.wikiDocumentTrash.totalCount ?? 0

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

  async function handleRestore(id: string) {
    await restoreDocument.mutateAsync(id)
    toast.success("Document restored")
  }

  async function handleEmptyTrash() {
    if (!confirm(`Permanently delete all ${totalCount} documents? This cannot be undone.`))
      return
    await emptyTrash.mutateAsync(operationId)
    toast.success("Trash emptied")
  }

  const hasItems = trashDocs.length > 0

  return (
    <Sheet open={trashPanelOpen} onOpenChange={(open) => !open && closeTrashPanel()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="gap-0 p-3">
          <div className="flex items-center gap-2">
            <TrashIcon className="size-4 text-muted-foreground" />
            <SheetTitle>Trash</SheetTitle>
            {totalCount > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {totalCount}
              </span>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-2">
          {isLoading ? (
            <div className="flex flex-col gap-1 py-1">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-12 rounded-md" />
              ))}
            </div>
          ) : !hasItems ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                <TrashIcon className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Trash is empty</p>
              <p className="text-xs text-muted-foreground">
                Deleted pages will show up here.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col py-1">
              {trashDocs.map((doc) => (
                  <li
                    key={doc.id}
                    className="group flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-sm"
                    >
                      {doc.emoji || "\u{1F4C4}"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className="truncate text-sm font-medium">{doc.title}</p>
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                {formatRelativeTime(doc.deletedAt)}
                              </span>
                            }
                          />
                          <TooltipContent>
                            Deleted by {doc.deletedBy?.username ?? "unknown"}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      {doc.ancestors.length > 0 && (
                        <p className="line-clamp-2 text-[11px] text-muted-foreground">
                          {doc.ancestors.map((a, i) => (
                            <span key={a.id}>
                              {i > 0 && (
                                <span className="mx-0.5 opacity-60">›</span>
                              )}
                              <span
                                className={cn(
                                  a.isDeleted &&
                                    "text-muted-foreground/70 line-through",
                                )}
                              >
                                {a.emoji || "\u{1F4C4}"} {a.title}
                              </span>
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                    <div className="invisible flex shrink-0 items-center gap-0.5 group-hover:visible">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => handleRestore(doc.id)}
                              disabled={restoreDocument.isPending}
                              aria-label="Restore"
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
                              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              onClick={() =>
                                openPermanentDeleteDialog({ id: doc.id, title: doc.title })
                              }
                              aria-label="Delete forever"
                            />
                          }
                        >
                          <Trash2Icon className="size-3.5" />
                        </TooltipTrigger>
                        <TooltipContent>Delete forever</TooltipContent>
                      </Tooltip>
                    </div>
                  </li>
              ))}
              <div ref={sentinelRef} className="h-1" />
              {isFetchingNextPage && (
                <Skeleton className="h-16 rounded-md" />
              )}
            </ul>
          )}
        </div>

        {hasItems && (
          <SheetFooter className="border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={handleEmptyTrash}
              disabled={emptyTrash.isPending}
              className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2Icon className="size-4" />
              {emptyTrash.isPending ? "Emptying..." : `Empty trash (${totalCount})`}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
