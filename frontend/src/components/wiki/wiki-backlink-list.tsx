import { Link } from "react-router"
import { ChevronRightIcon } from "lucide-react"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { useWikiDocumentBacklinks } from "@/graphql/hooks/wiki"
import { cn } from "@/lib/utils"

interface WikiBacklinkListProps {
  documentId: string
}

/**
 * Renders the "Backlinks" footer block — the inverse of Sub-pages. Lists the
 * other documents in this operation that cite the currently open one inline
 * via the `/doc` slash command.
 *
 * Mirrors the visual language of `WikiChildDocumentList` so the editor footer
 * reads as one pair of related lists rather than two unrelated widgets. Each
 * row carries a single ancestor breadcrumb segment (immediate parent) so users
 * can disambiguate same-titled pages across the tree.
 *
 * Trashed referrers are filtered server-side; the list stays empty rather than
 * surfacing dead links. The component returns null in the empty case because
 * there's no analogue to the sub-page "Add" affordance to show — backlinks are
 * derived from editor activity, not a direct user action on this page.
 */
export function WikiBacklinkList({ documentId }: WikiBacklinkListProps) {
  const { data, isLoading } = useWikiDocumentBacklinks(documentId)
  const backlinks = data?.wikiDocumentBacklinks ?? []

  if (isLoading && backlinks.length === 0) return null
  if (backlinks.length === 0) return null

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Backlinks
          <span className="ml-1.5 text-muted-foreground/70">
            {backlinks.length}
          </span>
        </h3>
      </div>

      <ul className="flex flex-col gap-0.5">
        {backlinks.map((doc) => {
          const parent =
            doc.ancestors.length > 0
              ? doc.ancestors[doc.ancestors.length - 1]
              : null
          return (
            <li key={doc.id}>
              <Link
                to={`/wiki/${doc.id}`}
                className="group/row flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <DocumentIcon
                  emoji={doc.emoji}
                  icon={doc.icon}
                  color={doc.color}
                />
                <span className="min-w-0 flex-1 truncate">
                  {doc.title || "Untitled"}
                  {parent && (
                    <span
                      className={cn(
                        "ml-1.5 text-xs",
                        parent.isDeleted
                          ? "text-muted-foreground/50 line-through"
                          : "text-muted-foreground/70",
                      )}
                    >
                      in {parent.title || "Untitled"}
                    </span>
                  )}
                </span>
                <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100" />
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
