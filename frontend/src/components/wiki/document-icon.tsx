import { Suspense } from "react"
import {
  ADAPTIVE_ICON_NAME,
  resolveAdaptiveIcon,
  resolveIcon,
} from "@/components/wiki/icon-catalog"
import { cn } from "@/lib/utils"

const DEFAULT_EMOJI = "\u{1F4C4}"

interface DocumentIconProps {
  emoji?: string | null
  icon?: string | null
  /**
   * Optional color for the lucide icon variant. Empty/null falls back to
   * inherited currentColor. Applied via inline style so it overrides any
   * Tailwind text-color class on parent containers (e.g. tree hover states).
   * Ignored for the emoji branch — emojis carry their own intrinsic color.
   */
  color?: string | null
  className?: string
  /** Pixel size for the lucide icon variant; ignored for emoji glyphs (CSS sizes them via class). */
  size?: number
  /**
   * Adaptive-icon context. Used only when `icon === ADAPTIVE_ICON_NAME`:
   * leaf → FileText, branch → Folder (closed) or FolderOpen (expanded).
   * Both default to false, so non-tree call sites (chips, breadcrumbs,
   * search results) render the leaf glyph without needing to plumb tree
   * state through.
   */
  hasChildren?: boolean
  isExpanded?: boolean
}

/**
 * Render a wiki document's icon — either a lucide icon (curated or lazy from
 * the full lucide set), an emoji glyph, or the default page-icon fallback.
 *
 * `icon` wins over `emoji` so a doc upgrading from emoji to lucide swaps
 * immediately even if the server hasn't cleared the other field. When the
 * `icon` name is not a known lucide name (typo / removed), we fall back to
 * emoji, so the slot never goes blank.
 *
 * For uncurated lucide icons, resolveIcon returns a React.lazy component;
 * the Suspense boundary below keeps the slot from blowing up the parent
 * render tree on first paint. Fallback is a same-size empty span so layout
 * doesn't shift between the placeholder and the resolved icon.
 */
export function DocumentIcon({
  emoji,
  icon,
  color,
  className,
  size = 18,
  hasChildren = false,
  isExpanded = false,
}: DocumentIconProps) {
  /* eslint-disable react-hooks/static-components */
  // Adaptive default: render synchronously without going through the lazy
  // lucide registry. Caught here (before resolveIcon) so the reserved name
  // never leaks into ALL_LUCIDE_NAMES lookups.
  if (icon === ADAPTIVE_ICON_NAME) {
    const Icon = resolveAdaptiveIcon(hasChildren, isExpanded)
    const style = color ? { color } : undefined
    return (
      <Icon
        className={cn("shrink-0", className)}
        size={size}
        style={style}
        aria-hidden
      />
    )
  }
  const Lucide = resolveIcon(icon)
  if (Lucide) {
    // color || undefined keeps empty string from becoming an empty CSS value;
    // undefined lets the icon inherit currentColor like before.
    const style = color ? { color } : undefined
    return (
      <Suspense
        fallback={
          <span
            aria-hidden
            className={cn("inline-block shrink-0", className)}
            style={{ width: size, height: size }}
          />
        }
      >
        <Lucide
          className={cn("shrink-0", className)}
          size={size}
          style={style}
          aria-hidden
        />
      </Suspense>
    )
  }
  /* eslint-enable react-hooks/static-components */
  return (
    <span
      className={cn("shrink-0 text-base leading-none", className)}
      aria-hidden
    >
      {emoji || DEFAULT_EMOJI}
    </span>
  )
}
