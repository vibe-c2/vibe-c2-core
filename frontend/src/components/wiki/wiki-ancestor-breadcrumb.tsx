import { DocumentIcon } from "@/components/wiki/document-icon"
import { cn } from "@/lib/utils"

// Minimal shape every wiki query selects from `WikiDocumentAncestor`. Defined
// locally instead of importing the generated type so callers can pass any
// query-shaped slice that includes these fields.
export interface AncestorCrumb {
  id: string
  title: string
  emoji: string
  icon: string
  color?: string | null
  isDeleted: boolean
}

interface WikiAncestorBreadcrumbProps {
  ancestors: readonly AncestorCrumb[]
  className?: string
}

// Renders the ancestor path as `icon title › icon title › …` with deleted
// crumbs struck through. Used by the search palette, history dropdown, and
// trash panel to disambiguate same-named documents in different locations.
export function WikiAncestorBreadcrumb({
  ancestors,
  className,
}: WikiAncestorBreadcrumbProps) {
  if (ancestors.length === 0) return null
  // Block-rendered <span> instead of <p> so callers can drop the breadcrumb
  // inside any container — including <button>, where <p> would be invalid
  // HTML (button only accepts phrasing content).
  return (
    <span className={cn("block text-[11px] text-muted-foreground", className)}>
      {ancestors.map((a, i) => (
        <span key={a.id}>
          {i > 0 && <span className="mx-0.5 opacity-60">›</span>}
          <span
            className={cn(
              "inline-flex items-center gap-1",
              a.isDeleted && "text-muted-foreground/70 line-through",
            )}
          >
            <DocumentIcon
              emoji={a.emoji}
              icon={a.icon}
              size={12}
              className="text-[11px]"
            />
            {a.title}
          </span>
        </span>
      ))}
    </span>
  )
}
