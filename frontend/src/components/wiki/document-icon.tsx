import { Suspense } from "react"
import { resolveIcon } from "@/components/wiki/icon-catalog"
import { cn } from "@/lib/utils"

const DEFAULT_EMOJI = "\u{1F4C4}"

interface DocumentIconProps {
  emoji?: string | null
  icon?: string | null
  className?: string
  /** Pixel size for the lucide icon variant; ignored for emoji glyphs (CSS sizes them via class). */
  size?: number
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
  className,
  size = 18,
}: DocumentIconProps) {
  /* eslint-disable react-hooks/static-components */
  const Lucide = resolveIcon(icon)
  if (Lucide) {
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
