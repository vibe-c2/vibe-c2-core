import { useMemo } from "react"
import { Link } from "react-router"
import { ChevronRightIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWikiStore } from "@/stores/wiki"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { useWikiDocumentChildren } from "@/graphql/hooks/wiki"
import { sortByOrder } from "@/components/wiki/wiki-tree-helpers"

interface WikiChildDocumentListProps {
  documentId: string
  operationId: string
  isEditor: boolean
}

export function WikiChildDocumentList({
  documentId,
  operationId,
  isEditor,
}: WikiChildDocumentListProps) {
  const openCreateDialog = useWikiStore((s) => s.openCreateDialog)

  // Shares the per-parent cache key with the sidebar's lazy expand for this
  // doc — the second call is a TanStack cache hit, no extra network.
  const { data } = useWikiDocumentChildren(operationId, documentId)
  const children = useMemo(
    () => sortByOrder(data?.wikiDocumentChildren ?? []),
    [data?.wikiDocumentChildren],
  )

  if (children.length === 0 && !isEditor) return null

  return (
    <div>
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
              <Link
                to={`/wiki/${child.id}`}
                className="group/row flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <DocumentIcon
                  emoji={child.emoji}
                  icon={child.icon}
                  color={child.color}
                  hasChildren={child.childCount > 0}
                />
                <span className="min-w-0 flex-1 truncate">{child.title}</span>
                {child.childCount > 0 && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {child.childCount}
                  </span>
                )}
                <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
