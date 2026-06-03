import { useState, type ReactNode } from "react"
import { Link } from "react-router"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { HighlightedSubstring } from "@/components/wiki/wiki-highlight"
import { cn, isPlainLeftClick } from "@/lib/utils"

// Shared layout for a crumb's inner icon + label. Interactive crumbs (the
// navigate Link, the select button, the expand ellipsis) layer hover
// affordances on top of the base; the plain non-interactive and deleted
// variants use the base alone.
const CRUMB_BASE = "inline-flex items-center gap-1"
const CRUMB_INTERACTIVE = cn(
  CRUMB_BASE,
  "rounded hover:bg-accent/60 hover:text-foreground",
)

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
  /** When set, a path with more than this many crumbs collapses its middle
   *  into a clickable "…" so a long ancestor chain stays on one line. The root
   *  and the deepest crumbs (the immediate parent — the one users click) stay
   *  visible. Clicking the "…" expands the full path, which then wraps across
   *  as many lines as it needs. When unset, the breadcrumb always renders the
   *  full path and the caller's `className` controls clamping (the historical
   *  behavior every other surface relies on). */
  collapseAfter?: number
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
  collapseAfter,
}: WikiAncestorBreadcrumbProps) {
  const [expanded, setExpanded] = useState(false)
  if (ancestors.length === 0) return null

  // Only collapse when the caller opts in (collapseAfter set), the path is
  // long enough to need it, and the user hasn't already expanded it.
  const collapsing =
    collapseAfter != null && !expanded && ancestors.length > collapseAfter

  // Collapsed form keeps the root crumb plus the deepest `tailCount` crumbs and
  // drops the middle behind a "…". head(1) + tail(collapseAfter-1) === the
  // collapseAfter crumbs we keep visible; everything between them is hidden.
  const tailCount = collapsing ? Math.max(1, (collapseAfter ?? 1) - 1) : 0
  const head = collapsing ? ancestors.slice(0, 1) : ancestors
  const tail = collapsing ? ancestors.slice(ancestors.length - tailCount) : []
  const hiddenCount = ancestors.length - head.length - tail.length

  const renderCrumb = (a: AncestorCrumb): ReactNode => (
    <Crumb
      crumb={a}
      highlightQuery={highlightQuery}
      onCrumbClick={onCrumbClick}
      onCrumbSelect={onCrumbSelect}
    />
  )

  // Flatten head → ellipsis → tail into one list so the `›` separators
  // interleave uniformly regardless of where the collapse sits.
  const nodes: { key: string; el: ReactNode }[] = head.map((a) => ({
    key: a.id,
    el: renderCrumb(a),
  }))
  if (collapsing) {
    nodes.push({
      key: "ellipsis",
      el: (
        <EllipsisCrumb
          hiddenCount={hiddenCount}
          onExpand={() => setExpanded(true)}
        />
      ),
    })
    tail.forEach((a) => nodes.push({ key: a.id, el: renderCrumb(a) }))
  }

  // Block-rendered <span> instead of <p> so callers can drop the breadcrumb
  // inside any container — including <button>, where <p> would be invalid
  // HTML (button only accepts phrasing content). In collapse mode the
  // component owns the line behavior: a single clamped line until expanded,
  // then free-wrapping so the full path is readable. Otherwise the caller's
  // `className` (truncate / line-clamp-N) decides.
  return (
    <span
      className={cn(
        "block text-[11px] text-muted-foreground",
        collapseAfter != null &&
          (expanded ? "whitespace-normal break-words" : "truncate"),
        className,
      )}
    >
      {nodes.map((n, i) => (
        <span key={n.key}>
          {i > 0 && <span className="mx-0.5 opacity-60">›</span>}
          {n.el}
        </span>
      ))}
    </span>
  )
}

interface EllipsisCrumbProps {
  hiddenCount: number
  onExpand: () => void
}

// The collapsed-middle affordance. A real <button> (not a Link) so it can live
// inside either a navigate row or a select row without nesting interactives;
// clicking reveals the hidden ancestors instead of navigating. stopPropagation
// keeps a row-level click handler from also firing.
function EllipsisCrumb({ hiddenCount, onExpand }: EllipsisCrumbProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onExpand()
      }}
      aria-label={`Show ${hiddenCount} hidden ancestor${hiddenCount === 1 ? "" : "s"}`}
      title="Show full path"
      className={cn(CRUMB_INTERACTIVE, "px-1")}
    >
      …
    </button>
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
      <span className={cn(CRUMB_BASE, "text-muted-foreground/70 line-through")}>
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
        className={CRUMB_INTERACTIVE}
      >
        {inner}
      </button>
    )
  }

  if (!onCrumbClick) {
    return <span className={CRUMB_BASE}>{inner}</span>
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
      className={CRUMB_INTERACTIVE}
    >
      {inner}
    </Link>
  )
}
