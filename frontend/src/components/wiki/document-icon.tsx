import { Suspense, type CSSProperties } from "react"
import {
  ADAPTIVE_ICON_NAME,
  type IconComponent,
  resolveAdaptiveIcon,
  resolveIcon,
} from "@/components/wiki/icon-catalog"
import {
  isSimpleIconName,
  resolveSimpleIcon,
  simpleIconSlug,
} from "@/components/wiki/simple-icon-catalog"
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
 * immediately even if the server hasn't cleared the other field. An `icon`
 * value prefixed `si:` is a Simple Icon (brand logo) — also lazy + Suspense;
 * everything else is a lucide name. When the name resolves to neither (typo /
 * removed icon), we fall back to emoji, so the slot never goes blank.
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
  // color ? {color} : undefined keeps an empty string from becoming an empty
  // CSS value; undefined lets the icon inherit currentColor. Shared by every
  // icon branch below. Ignored on the emoji fallback (emojis carry their own).
  const style: CSSProperties | undefined = color ? { color } : undefined
  // Adaptive default: render synchronously without going through the lazy
  // lucide registry. Caught here (before resolveIcon) so the reserved name
  // never leaks into ALL_LUCIDE_NAMES lookups.
  if (icon === ADAPTIVE_ICON_NAME) {
    const Icon = resolveAdaptiveIcon(hasChildren, isExpanded)
    return (
      <Icon
        className={cn("shrink-0", className)}
        size={size}
        style={style}
        aria-hidden
      />
    )
  }
  // Simple Icon (brand logo). Lazy like the uncurated lucide branch, so it
  // renders through the same Suspense slot. Unknown slug → fall through to the
  // lucide branch, then emoji.
  if (isSimpleIconName(icon)) {
    const SimpleIcon = resolveSimpleIcon(simpleIconSlug(icon))
    if (SimpleIcon) {
      return (
        <LazyIconSlot
          Icon={SimpleIcon}
          size={size}
          className={className}
          style={style}
        />
      )
    }
  }
  const Lucide = resolveIcon(icon)
  if (Lucide) {
    return (
      <LazyIconSlot
        Icon={Lucide}
        size={size}
        className={className}
        style={style}
      />
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

interface LazyIconSlotProps {
  Icon: IconComponent
  size: number
  className?: string
  style?: CSSProperties
}

/**
 * Renders a lazy icon (uncurated lucide or a Simple Icon) inside a Suspense
 * boundary, so a slow icon chunk can't blow up the parent render tree on first
 * paint. The fallback is a same-size empty span so layout doesn't shift
 * between the placeholder and the resolved icon.
 */
function LazyIconSlot({ Icon, size, className, style }: LazyIconSlotProps) {
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
      <Icon
        className={cn("shrink-0", className)}
        size={size}
        style={style}
        aria-hidden
      />
    </Suspense>
  )
}
