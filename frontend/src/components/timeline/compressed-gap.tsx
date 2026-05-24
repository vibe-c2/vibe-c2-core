import type { TimelineGranularity } from "@/graphql/gql/graphql"
import { formatGapLabel } from "./piecewise-axis"

interface Props {
  spanBuckets: number
  widthPx: number
  granularity: TimelineGranularity
}

// CompressedGap stands in for a contiguous run of zero-event buckets. Fixed
// width regardless of span; the span count is shown as a small label so the
// timeline preserves the sense of elapsed time without burning pixels.
// Flex column with flex-1 spacer so the dashed line lands on the same
// baseline as the active-segment axis line at the bottom of the canvas.
export function CompressedGap({ spanBuckets, widthPx, granularity }: Props) {
  return (
    <div
      className="relative shrink-0 flex flex-col"
      style={{ width: `${widthPx}px` }}
    >
      <div className="flex-1 min-h-0" />

      <div className="relative h-4 border-t border-dashed border-border/60" />

      <div className="pt-1.5 text-center text-xs text-muted-foreground/80 tabular-nums">
        {formatGapLabel(spanBuckets, granularity)}
      </div>
      {/* Invisible footer row keeps the gap's axis line on the same baseline
          as the bookend markers (which render a real subtitle below the
          date label). Without it the dashed gap line floats lower than the
          active segments' axis line and the row reads as broken. */}
      <div
        aria-hidden
        className="pt-1 text-center text-[10px] uppercase tracking-wide invisible"
      >
        ·
      </div>
    </div>
  )
}
