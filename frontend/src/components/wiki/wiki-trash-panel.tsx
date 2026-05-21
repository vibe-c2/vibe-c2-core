import { useMemo, useState } from "react"
import { Virtuoso } from "react-virtuoso"
import { useQueryClient } from "@tanstack/react-query"
import { LoaderIcon, RotateCcwIcon, Trash2Icon, TrashIcon } from "lucide-react"
import { toast } from "sonner"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useWikiStore } from "@/stores/wiki"
import { graphqlClient } from "@/lib/graphql-client"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { WikiAncestorBreadcrumb } from "@/components/wiki/wiki-ancestor-breadcrumb"
import {
  WikiDocumentTrashedDescendantsDocument,
  type WikiDocumentTrashQuery,
  type WikiDocumentTrashedDescendantsQuery,
} from "@/graphql/gql/graphql"
import {
  wikiKeys,
  useWikiDocumentTrash,
  useRestoreWikiDocument,
  useEmptyWikiDocumentTrash,
} from "@/graphql/hooks/wiki"

interface WikiTrashPanelProps {
  operationId: string
}

type TrashDoc = WikiDocumentTrashQuery["wikiDocumentTrash"]["edges"][number]["node"]
type TrashedDescendant =
  WikiDocumentTrashedDescendantsQuery["wikiDocumentTrashedDescendants"][number]

interface RestorePrompt {
  id: string
  title: string
  descendants: TrashedDescendant[]
}

const PREVIEW_LIMIT = 8

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
  const queryClient = useQueryClient()
  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useWikiDocumentTrash(operationId)
  const restoreDocument = useRestoreWikiDocument()
  const emptyTrash = useEmptyWikiDocumentTrash()

  // null = no prompt; the doc whose restore we're about to confirm otherwise.
  const [restorePrompt, setRestorePrompt] = useState<RestorePrompt | null>(null)
  // Tracks the doc whose descendants probe is in flight, so we can dim its
  // restore button without disabling restore on every other row.
  const [probingId, setProbingId] = useState<string | null>(null)

  const trashDocs = useMemo(
    () => data?.pages.flatMap((p) => p.wikiDocumentTrash.edges.map((e) => e.node)) ?? [],
    [data],
  )
  const totalCount = data?.pages[0]?.wikiDocumentTrash.totalCount ?? 0

  async function handleRestoreClick(doc: TrashDoc) {
    setProbingId(doc.id)
    try {
      const result = await queryClient.fetchQuery({
        queryKey: wikiKeys.trashedDescendants(doc.id),
        queryFn: () =>
          graphqlClient(WikiDocumentTrashedDescendantsDocument, {
            documentId: doc.id,
          }),
      })
      const descendants = result.wikiDocumentTrashedDescendants
      if (descendants.length === 0) {
        await performRestore(doc.id, false)
        return
      }
      setRestorePrompt({ id: doc.id, title: doc.title, descendants })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to check trashed children")
    } finally {
      setProbingId(null)
    }
  }

  async function performRestore(id: string, cascade: boolean) {
    try {
      await restoreDocument.mutateAsync({ id, cascade })
      setRestorePrompt(null)
      toast.success(
        cascade ? "Document and nested children restored" : "Document restored",
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to restore document")
    }
  }

  async function handleEmptyTrash() {
    if (!confirm(`Permanently delete all ${totalCount} documents? This cannot be undone.`))
      return
    await emptyTrash.mutateAsync(operationId)
    toast.success("Trash emptied")
  }

  const hasItems = trashDocs.length > 0

  return (
    <>
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

          <div className="flex flex-1 min-h-0 flex-col px-2">
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
              <Virtuoso
                data={trashDocs}
                style={{ height: "100%" }}
                className="flex-1 min-h-0"
                endReached={() => {
                  if (hasNextPage && !isFetchingNextPage) fetchNextPage()
                }}
                overscan={200}
                itemContent={(_index, doc) => (
                  <TrashItem
                    doc={doc}
                    onRestore={handleRestoreClick}
                    onPermanentDelete={openPermanentDeleteDialog}
                    restorePending={
                      probingId === doc.id ||
                      (restoreDocument.isPending &&
                        restoreDocument.variables?.id === doc.id)
                    }
                  />
                )}
                components={{
                  Footer: () => {
                    if (isFetchingNextPage) {
                      return (
                        <div className="flex items-center justify-center py-3">
                          <LoaderIcon className="size-4 animate-spin text-muted-foreground" />
                        </div>
                      )
                    }
                    return <div className="h-1" />
                  },
                }}
              />
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
      <RestoreCascadeDialog
        prompt={restorePrompt}
        onCancel={() => setRestorePrompt(null)}
        onConfirm={(cascade) => {
          if (restorePrompt) performRestore(restorePrompt.id, cascade)
        }}
        pending={restoreDocument.isPending}
      />
    </>
  )
}

interface RestoreCascadeDialogProps {
  prompt: RestorePrompt | null
  onCancel: () => void
  onConfirm: (cascade: boolean) => void
  pending: boolean
}

function RestoreCascadeDialog({
  prompt,
  onCancel,
  onConfirm,
  pending,
}: RestoreCascadeDialogProps) {
  const open = prompt !== null
  const descendants = prompt?.descendants ?? []
  const count = descendants.length
  const preview = descendants.slice(0, PREVIEW_LIMIT)
  const overflow = Math.max(0, count - preview.length)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore nested children?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{prompt?.title}</span>
            {" "}has {count} nested {count === 1 ? "child" : "children"} also in trash.
            Choose whether to restore the whole subtree or just this document.
          </DialogDescription>
        </DialogHeader>

        {preview.length > 0 && (
          <ul className="max-h-48 overflow-y-auto rounded-md border bg-muted/30 p-2 text-sm">
            {preview.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded px-1 py-1">
                <DocumentIcon
                  emoji={d.emoji}
                  icon={d.icon}
                  color={d.color}
                  size={14}
                />
                <span className="truncate">{d.title}</span>
              </li>
            ))}
            {overflow > 0 && (
              <li className="px-1 py-1 text-xs text-muted-foreground">
                + {overflow} more…
              </li>
            )}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => onConfirm(false)}
            disabled={pending}
          >
            Restore only this
          </Button>
          <Button onClick={() => onConfirm(true)} disabled={pending}>
            {pending ? "Restoring..." : `Restore all (${count + 1})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface TrashItemProps {
  doc: TrashDoc
  onRestore: (doc: TrashDoc) => void | Promise<void>
  onPermanentDelete: (doc: { id: string; title: string }) => void
  restorePending: boolean
}

function TrashItem({ doc, onRestore, onPermanentDelete, restorePending }: TrashItemProps) {
  return (
    <div className="group flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50">
      <span
        aria-hidden
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-sm"
      >
        <DocumentIcon emoji={doc.emoji} icon={doc.icon} color={doc.color} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-sm font-medium">{doc.title}</p>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {doc.deletedBy?.username ?? "unknown"} · {formatRelativeTime(doc.deletedAt)}
          </span>
        </div>
        <WikiAncestorBreadcrumb
          ancestors={doc.ancestors}
          className="line-clamp-2"
        />
      </div>
      <div className="invisible flex shrink-0 items-center gap-0.5 group-hover:visible">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onRestore(doc)}
                disabled={restorePending}
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
                onClick={() => onPermanentDelete({ id: doc.id, title: doc.title })}
                aria-label="Delete forever"
              />
            }
          >
            <Trash2Icon className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>Delete forever</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
