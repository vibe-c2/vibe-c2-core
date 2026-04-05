import { useEffect, useRef, useMemo } from "react"
import { RotateCcwIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useWikiStore } from "@/stores/wiki"
import {
  useWikiDocumentTrash,
  useRestoreWikiDocument,
  useEmptyWikiDocumentTrash,
} from "@/graphql/hooks/wiki"

interface WikiTrashPanelProps {
  operationId: string
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

  // Infinite scroll sentinel.
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

  return (
    <Sheet open={trashPanelOpen} onOpenChange={(open) => !open && closeTrashPanel()}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Trash ({totalCount})</SheetTitle>
        </SheetHeader>

        {totalCount > 0 && (
          <div className="px-4 pb-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleEmptyTrash}
              disabled={emptyTrash.isPending}
            >
              {emptyTrash.isPending ? "Emptying..." : "Empty Trash"}
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4">
          {isLoading ? (
            <div className="flex flex-col gap-2 py-2">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-12 rounded" />
              ))}
            </div>
          ) : trashDocs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Trash is empty
            </p>
          ) : (
            trashDocs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-2 border-b py-2 last:border-0"
              >
                <span className="shrink-0 text-sm">{doc.emoji || "\u{1F4C4}"}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{doc.title}</p>
                  <p className="text-xs text-muted-foreground">
                    by {doc.deletedBy?.username ?? "unknown"}
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleRestore(doc.id)}
                        disabled={restoreDocument.isPending}
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
                        onClick={() =>
                          openPermanentDeleteDialog({ id: doc.id, title: doc.title })
                        }
                      />
                    }
                  >
                    <Trash2Icon className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipContent>Delete forever</TooltipContent>
                </Tooltip>
              </div>
            ))
          )}
          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
        </div>
      </SheetContent>
    </Sheet>
  )
}
