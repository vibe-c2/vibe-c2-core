import { Link } from "react-router"
import { ChevronRightIcon } from "lucide-react"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { WikiAncestorBreadcrumb } from "@/components/wiki/wiki-ancestor-breadcrumb"
import { cn } from "@/lib/utils"
import type { WikiDocumentBacklinkFieldsFragment } from "@/graphql/gql/graphql"

interface BacklinkListProps {
  documents: readonly WikiDocumentBacklinkFieldsFragment[]
  // Optional heading override — defaults to "Backlinks". Credential dialog
  // uses "Referenced in" to disambiguate from doc→doc backlinks.
  title?: string
  // When true, renders the section even with zero items (still no list,
  // but the section heading + empty-state hint shows). Wiki editor footer
  // keeps the legacy "hide on empty" behaviour; the credential dialog uses
  // this to make the section visible while editing wiki docs.
  showWhenEmpty?: boolean
  // When true, cap the list height and let it scroll internally. Used by
  // surfaces with constrained vertical space (e.g. modals). The wiki
  // editor footer sits on a naturally scrolling page and leaves this off
  // so the whole list flows with the document.
  scrollable?: boolean
  // When true, render rows as two lines with the full ancestor breadcrumb
  // (`Root › Folder › Parent`) under the title — matches the search
  // palette layout. Defaults to false: the wiki editor footer keeps its
  // tighter single-line "Title in Parent" treatment since the surrounding
  // tree already gives operators that context.
  showFullPath?: boolean
  isLoading?: boolean
}

/**
 * Renders a list of wiki documents that backlink to some source — used by
 * both the wiki editor footer (doc → doc) and the credentials details dialog
 * (credential → doc). The two surfaces share the same `WikiDocument` row
 * shape, so this component is intentionally entity-agnostic.
 *
 * Each row carries a single ancestor breadcrumb segment (immediate parent) so
 * users can disambiguate same-titled pages across the tree.
 */
export function BacklinkList({
  documents,
  title = "Backlinks",
  showWhenEmpty = false,
  scrollable = false,
  showFullPath = false,
  isLoading = false,
}: BacklinkListProps) {
  if (isLoading && documents.length === 0) return null
  if (documents.length === 0 && !showWhenEmpty) return null

  return (
    // min-w-0 lets the section sit inside a flex parent without long row
    // titles forcing the column wider than the modal.
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
          <span className="ml-1.5 text-muted-foreground/70">
            {documents.length}
          </span>
        </h3>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No wiki documents reference this yet.
        </p>
      ) : (
        <ul
          className={cn(
            "flex flex-col gap-0.5",
            // ~6 rows visible (≈ 240px) before the list scrolls internally.
            // `pr-1` keeps the scrollbar from overlapping the chevron column.
            scrollable && "max-h-60 overflow-y-auto pr-1",
          )}
        >
          {documents.map((doc) => {
            const parent =
              doc.ancestors.length > 0
                ? doc.ancestors[doc.ancestors.length - 1]
                : null
            return (
              <li key={doc.id} className="min-w-0">
                <Link
                  to={`/wiki/${doc.id}`}
                  className={cn(
                    "group/row flex w-full min-w-0 gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                    // Two-line rows need top-aligned chrome so the icon and
                    // chevron sit next to the title, not centered over the
                    // breadcrumb. Single-line rows stay vertically centered.
                    showFullPath ? "items-start" : "items-center",
                  )}
                >
                  <DocumentIcon
                    emoji={doc.emoji}
                    icon={doc.icon}
                    color={doc.color}
                    // Nudge the icon down a hair so it baselines with the
                    // title text on multi-line rows.
                    className={cn(showFullPath && "mt-0.5")}
                  />
                  {showFullPath ? (
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">
                        {doc.title || "Untitled"}
                      </span>
                      {doc.ancestors.length > 0 && (
                        <WikiAncestorBreadcrumb
                          ancestors={doc.ancestors}
                          className="truncate"
                        />
                      )}
                    </span>
                  ) : (
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
                  )}
                  <ChevronRightIcon
                    className={cn(
                      "size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100",
                      showFullPath && "mt-0.5",
                    )}
                  />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
