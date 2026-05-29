import { useMemo, useState } from "react"
import { FileTextIcon, FolderIcon, PencilIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { useWikiStore } from "@/stores/wiki"
import {
  useReorderWikiDocumentSiblings,
  useWikiDocumentTree,
} from "@/graphql/hooks/wiki"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { sortByOrder } from "@/components/wiki/wiki-tree-helpers"
import { openWikiDocumentPicker } from "@/components/wiki/wiki-document-picker-dialog"
import type { WikiDocumentTreeFieldsFragment } from "@/graphql/gql/graphql"

interface MoveWikiDocumentDialogProps {
  operationId: string
}

// Root is a synthetic destination that doesn't correspond to a real wiki
// document — represented by `id: null`. The shared picker only deals with
// real docs, so the move dialog exposes a separate "Move to root" action
// button and stores the operator's choice in this discriminated shape.
interface DestinationChoice {
  id: string | null
  title: string
  emoji: string
  icon: string
  color: string
}

const ROOT_CHOICE: DestinationChoice = {
  id: null,
  title: "Root (top level)",
  emoji: "",
  icon: "",
  color: "",
}

/** Collect a document's ID and all descendant IDs. */
function collectDescendantIds(
  docId: string,
  docs: readonly WikiDocumentTreeFieldsFragment[],
): Set<string> {
  const ids = new Set<string>([docId])
  const queue = [docId]
  while (queue.length > 0) {
    const current = queue.pop()!
    for (const doc of docs) {
      if (doc.parentDocumentId === current && !ids.has(doc.id)) {
        ids.add(doc.id)
        queue.push(doc.id)
      }
    }
  }
  return ids
}

export function MoveWikiDocumentDialog({
  operationId,
}: MoveWikiDocumentDialogProps) {
  const { moveDialogOpen, moveTarget, closeMoveDialog } = useWikiStore()
  const reorderSiblings = useReorderWikiDocumentSiblings()
  const [destination, setDestination] = useState<DestinationChoice | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The tree is only used to derive the descendants exclusion set so the
  // shared picker can hide invalid targets. The server would also reject a
  // move into a descendant, but surfacing illegal rows in the picker and
  // crashing at confirm is worse UX than filtering up-front. Lazy-loaded
  // (gated on dialog open) so closed-dialog sessions pay nothing — the wiki
  // page itself no longer fetches the tree eagerly.
  const { data: treeData, isLoading: treeLoading } = useWikiDocumentTree(
    operationId,
    { enabled: moveDialogOpen },
  )
  const documents = useMemo(
    () => treeData?.wikiDocumentTree ?? [],
    [treeData?.wikiDocumentTree],
  )

  const excludedIds = useMemo(
    () =>
      moveTarget
        ? Array.from(collectDescendantIds(moveTarget.id, documents))
        : [],
    [moveTarget, documents],
  )

  function handleClose() {
    closeMoveDialog()
    setDestination(null)
    setError(null)
  }

  function openPicker() {
    if (!moveTarget) return
    openWikiDocumentPicker({
      operationId,
      excludeIds: excludedIds,
      title: "Choose new parent",
      description: `Pick a document to move "${moveTarget.title}" under.`,
      onPick: (doc) => {
        setDestination({
          id: doc.id,
          title: doc.title || "Untitled",
          emoji: doc.emoji,
          icon: doc.icon,
          color: doc.color,
        })
      },
    })
  }

  function chooseRoot() {
    setDestination(ROOT_CHOICE)
  }

  async function handleMove() {
    if (!moveTarget || !destination) return
    setError(null)

    // Place the moved doc at the top of the destination subtree (matches the
    // DnD "inside" drop behavior and the create-at-top flow). One bulk
    // mutation handles the reparent + sortOrder rebalance atomically so the
    // dialog can't catch a half-applied state.
    const destinationParentId = destination.id
    const destinationSiblings = sortByOrder(
      documents.filter(
        (d) =>
          (d.parentDocumentId ?? null) === destinationParentId &&
          d.id !== moveTarget.id,
      ),
    )
    const orderedIds = [moveTarget.id, ...destinationSiblings.map((d) => d.id)]

    try {
      await reorderSiblings.mutateAsync({
        input: {
          operationId,
          parentDocumentId: destinationParentId,
          orderedIds,
        },
      })
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move document")
    }
  }

  return (
    <Dialog
      open={moveDialogOpen}
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move Document</DialogTitle>
          <DialogDescription>
            Choose a new parent for{" "}
            <span className="font-medium text-foreground">
              {moveTarget?.title}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label>Destination</Label>
          {destination ? (
            <DestinationCard choice={destination} onChange={openPicker} />
          ) : (
            <div className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
              No destination chosen.
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openPicker}
              // Disabled until the descendants list is known so the picker
              // can't surface invalid targets in the brief loading window
              // before the tree query resolves.
              disabled={treeLoading}
            >
              <FileTextIcon className="size-3.5" />
              Choose document…
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={chooseRoot}
            >
              <FolderIcon className="size-3.5" />
              Move to root
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleMove}
            disabled={!destination || reorderSiblings.isPending}
          >
            {reorderSiblings.isPending ? "Moving..." : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Compact preview of the operator's current selection. Clicking re-opens
// the picker so they can change their mind without first clearing.
function DestinationCard({
  choice,
  onChange,
}: {
  choice: DestinationChoice
  onChange: () => void
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="group flex w-full items-center gap-2 rounded-md border bg-card px-3 py-2 text-left text-sm transition-colors hover:bg-accent/40"
    >
      {choice.id === null ? (
        <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <DocumentIcon
          emoji={choice.emoji}
          icon={choice.icon}
          color={choice.color}
          className="shrink-0"
        />
      )}
      <span className="min-w-0 flex-1 truncate font-medium">
        {choice.title}
      </span>
      <PencilIcon className="size-3.5 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" />
    </button>
  )
}
