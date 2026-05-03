import { useMemo } from "react"
import { useNavigate } from "react-router"
import { ChevronRightIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWikiStore } from "@/stores/wiki"
import { getDirectChildren } from "@/components/wiki/wiki-tree-helpers"
import type { WikiDocumentTreeFieldsFragment } from "@/graphql/gql/graphql"

interface WikiChildDocumentListProps {
  documentId: string
  treeDocuments: WikiDocumentTreeFieldsFragment[]
  isEditor: boolean
}

export function WikiChildDocumentList({
  documentId,
  treeDocuments,
  isEditor,
}: WikiChildDocumentListProps) {
  const navigate = useNavigate()
  const openCreateDialog = useWikiStore((s) => s.openCreateDialog)

  const children = useMemo(
    () => getDirectChildren(treeDocuments, documentId),
    [treeDocuments, documentId],
  )

  if (children.length === 0 && !isEditor) return null

  return (
    <div className="mt-8 border-t pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Sub-pages
          {children.length > 0 && (
            <span className="ml-1.5 text-muted-foreground/70">
              {children.length}
            </span>
          )}
        </h3>
        {isEditor && (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => openCreateDialog(documentId)}
          >
            <PlusIcon />
            Add sub-page
          </Button>
        )}
      </div>

      {children.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sub-pages yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {children.map((child) => (
            <li key={child.id}>
              <button
                onClick={() => navigate(`/wiki/${child.id}`)}
                className="group/row flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className="shrink-0 text-base">
                  {child.emoji || "\u{1F4C4}"}
                </span>
                <span className="min-w-0 flex-1 truncate">{child.title}</span>
                {child.childCount > 0 && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {child.childCount}
                  </span>
                )}
                <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
