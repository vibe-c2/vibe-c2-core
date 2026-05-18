import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  SuggestionInput,
  type SuggestionOption,
} from "@/components/ui/suggestion-input"
import { useWikiStore } from "@/stores/wiki"
import {
  useUpdateWikiDocument,
  useWikiDocumentTree,
} from "@/graphql/hooks/wiki"
import { DocumentIcon } from "@/components/wiki/document-icon"
import type { WikiDocumentTreeFieldsFragment } from "@/graphql/gql/graphql"

interface MoveWikiDocumentDialogProps {
  operationId: string
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
  const updateDocument = useUpdateWikiDocument()
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<SuggestionOption | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Full operation tree — only fetched when the dialog opens. The move-to
  // picker needs every doc as a target option, but the dialog is rare; the
  // wiki page itself no longer loads the tree eagerly. The query is shared
  // with any other consumer that asks for the same key.
  const { data: treeData, isLoading: treeLoading } = useWikiDocumentTree(
    operationId,
    { enabled: moveDialogOpen },
  )
  const documents = useMemo(
    () => treeData?.wikiDocumentTree ?? [],
    [treeData?.wikiDocumentTree],
  )

  // Build options: all valid parents (excluding self + descendants).
  const excludedIds = useMemo(
    () => (moveTarget ? collectDescendantIds(moveTarget.id, documents) : new Set<string>()),
    [moveTarget, documents],
  )

  const rootOption: SuggestionOption = useMemo(
    () => ({
      value: "",
      label: "/ Root (top level)",
      icon: <span className="shrink-0 text-base leading-none">{"\u{1F4C1}"}</span>,
    }),
    [],
  )

  const docOptions = useMemo(() => {
    const opts: SuggestionOption[] = []
    for (const doc of documents) {
      if (!excludedIds.has(doc.id)) {
        opts.push({
          value: doc.id,
          label: doc.title,
          icon: (
            <DocumentIcon
              emoji={doc.emoji}
              icon={doc.icon}
              color={doc.color}
            />
          ),
        })
      }
    }
    return opts
  }, [documents, excludedIds])

  // Root is always present in the suggestion list. Without this, the
  // moment a user types anything that doesn't appear in the literal label
  // (notably "/", which they reach for as a path shortcut) the root
  // option disappears, leaving "Move to root" undiscoverable.
  const filteredOptions = useMemo(() => {
    if (!search) return [rootOption, ...docOptions]
    const lower = search.toLowerCase()
    const docs = docOptions.filter((o) => o.label.toLowerCase().includes(lower))
    return [rootOption, ...docs]
  }, [rootOption, docOptions, search])

  function handleClose() {
    closeMoveDialog()
    setSearch("")
    setSelected(null)
    setError(null)
  }

  async function handleMove() {
    if (!moveTarget || !selected) return
    setError(null)

    try {
      await updateDocument.mutateAsync({
        id: moveTarget.id,
        input: { parentDocumentId: selected.value },
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
        <SuggestionInput
          search={search}
          onSearchChange={setSearch}
          selected={selected}
          onSelect={setSelected}
          options={filteredOptions}
          placeholder={treeLoading ? "Loading documents..." : "Search documents..."}
          emptyMessage={treeLoading ? "Loading..." : "No matching documents"}
        />
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
            disabled={!selected || updateDocument.isPending}
          >
            {updateDocument.isPending ? "Moving..." : "Move"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
