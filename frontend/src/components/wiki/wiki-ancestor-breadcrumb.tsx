import { Link } from "react-router"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { HighlightedSubstring } from "@/components/wiki/wiki-highlight"
import { cn, isPlainLeftClick } from "@/lib/utils"

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
  /** Case-insensitive substring to highlight inside each crumb's title. */
  highlightQuery?: string | null
  /** When provided, each non-deleted crumb becomes a navigation Link to
   *  `/wiki/<id>` and this callback fires after the click is accepted.
   *  Surfaces like the command palette use this to close the overlay. */
  onCrumbClick?: () => void
  /** When provided, each non-deleted crumb becomes a <button> that selects
   *  that ancestor instead of navigating — used by the picker so a reference
   *  can target a parent document straight from the breadcrumb. Takes
   *  precedence over onCrumbClick. */
  onCrumbSelect?: (crumb: AncestorCrumb) => void
}

// Renders the ancestor path as `icon title › icon title › …` with deleted
// crumbs struck through. Used by the search palette, history dropdown, and
// trash panel to disambiguate same-named documents in different locations.
export function WikiAncestorBreadcrumb({
  ancestors,
  className,
  highlightQuery,
  onCrumbClick,
  onCrumbSelect,
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
          <Crumb
            crumb={a}
            highlightQuery={highlightQuery}
            onCrumbClick={onCrumbClick}
            onCrumbSelect={onCrumbSelect}
          />
        </span>
      ))}
    </span>
  )
}

interface CrumbProps {
  crumb: AncestorCrumb
  highlightQuery?: string | null
  onCrumbClick?: () => void
  onCrumbSelect?: (crumb: AncestorCrumb) => void
}

function Crumb({ crumb, highlightQuery, onCrumbClick, onCrumbSelect }: CrumbProps) {
  const inner = (
    <>
      <DocumentIcon
        emoji={crumb.emoji}
        icon={crumb.icon}
        size={12}
        className="text-[11px]"
      />
      <HighlightedSubstring text={crumb.title} query={highlightQuery} />
    </>
  )

  // Deleted ancestors aren't navigable or selectable — their page is in the
  // trash (the route would 404, and a reference to it would dangle). Render
  // them as plain text with the strike-through.
  if (crumb.isDeleted) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground/70 line-through">
        {inner}
      </span>
    )
  }

  // Select mode takes precedence: the crumb picks that ancestor instead of
  // navigating. A <button> (not a Link) so it can live inside a non-link row.
  if (onCrumbSelect) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onCrumbSelect(crumb)
        }}
        className="inline-flex items-center gap-1 rounded hover:bg-accent/60 hover:text-foreground"
      >
        {inner}
      </button>
    )
  }

  if (!onCrumbClick) {
    return <span className="inline-flex items-center gap-1">{inner}</span>
  }

  return (
    <Link
      to={`/wiki/${crumb.id}`}
      onClick={(e) => {
        // Stop the row-level click handler (e.g. the palette's row-open
        // shortcut) from also firing — the crumb is its own navigation.
        e.stopPropagation()
        if (isPlainLeftClick(e)) onCrumbClick()
      }}
      className="inline-flex items-center gap-1 rounded hover:bg-accent/60 hover:text-foreground"
    >
      {inner}
    </Link>
  )
}
