import type { TimelineGroupIdentity } from "./event-icon-display"
import type { BucketTopicCount } from "./piecewise-axis"

// Chip-cloud geometry for an active bucket.
//
// The canvas is a fixed height, so a single vertical stack of chips can only
// grow so tall before it clips. Instead of capping how many groups a bucket
// shows, we cap the *column height* and fan extra groups out into additional
// columns, widening the segment. A busy day therefore reads as a wide cloud of
// chips - exactly the at-a-glance "this was a heavy day" signal we want - and
// never clips vertically. Width is a free dimension here: the axis is
// piecewise (see piecewise-axis), so elapsed time is carried by separate
// compressed gap segments, not by the distance between anchors. Widening a
// bucket steals no meaning from the axis.

// Maximum chips stacked vertically in one column before groups spill into the
// next column. Derived from CANVAS_HEIGHT_PX (380) in timeline-canvas: after
// the axis line, date label, and footer spacer there is ~285px of stack room,
// and each chip is size-8 (32px) on a ~6px gap, so ~38px pitch, so ~7 rows fit.
// Keep in sync with CANVAS_HEIGHT_PX if the canvas height changes.
export const MAX_ROWS_PER_COLUMN = 7

// Horizontal pitch per chip column: the chip (size-8 = 32px) plus room for its
// top-right count badge overhang plus a gap, so a chip's badge never collides
// with the chip in the next column. Also the per-column width budget used to
// widen a segment as its cloud gains columns.
export const COLUMN_PITCH_PX = 48

// SubjectGroup is the dot-stack rendering unit: one badge'd icon per group
// identity. For system kinds the identity is just the subjectKind, so every
// topic sharing that kind merges into one chip - e.g. hash.created and
// hash.cracked both carry subjectKind "hash" and empty glyph fields, so they
// render as a single hash circle. Custom events additionally split on their
// authored (emoji, icon, color), so two annotations with different glyphs
// render as distinct chips.
export interface SubjectGroup extends TimelineGroupIdentity {
  // Composite identity key - stable map key and React list key.
  key: string
  count: number
}

// groupKey builds the merge key. System kinds carry "" for emoji/icon/color so
// the key collapses to the subjectKind; custom events fold their glyph in.
// JSON.stringify of the tuple is collision-proof - it escapes any separator a
// field could itself contain (notably color, e.g. "oklch(68% 0.21 250)") - and
// keeps this source plain ASCII.
function groupKey(tc: BucketTopicCount): string {
  return JSON.stringify([tc.subjectKind, tc.emoji, tc.icon, tc.color])
}

// mergeByGroupIdentity collapses per-topic counts into per-identity groups,
// preserving the incoming order (server sorts count desc, topic asc, then
// glyph) by the first row seen for each identity.
export function mergeByGroupIdentity(
  topicCounts: BucketTopicCount[],
): SubjectGroup[] {
  const order: string[] = []
  const byKey = new Map<string, SubjectGroup>()
  for (const tc of topicCounts) {
    const key = groupKey(tc)
    const existing = byKey.get(key)
    if (existing) {
      existing.count += tc.count
      continue
    }
    order.push(key)
    byKey.set(key, {
      key,
      subjectKind: tc.subjectKind,
      emoji: tc.emoji,
      icon: tc.icon,
      color: tc.color,
      count: tc.count,
    })
  }
  return order.map((k) => byKey.get(k)!)
}

// computeChipColumns returns how many columns the cloud needs to hold every
// group without any column exceeding MAX_ROWS_PER_COLUMN.
export function computeChipColumns(groupCount: number): number {
  if (groupCount <= 0) return 0
  return Math.ceil(groupCount / MAX_ROWS_PER_COLUMN)
}

// computeActiveSegmentWidth widens a bucket's slot to fit its chip cloud. One
// or two columns fit inside the granularity's base width; beyond that the
// segment grows by COLUMN_PITCH_PX per column. No upper clamp - a day with
// many distinct custom glyphs simply fans wide (and the canvas scrolls).
export function computeActiveSegmentWidth(
  groupCount: number,
  baseWidthPx: number,
): number {
  const columns = computeChipColumns(groupCount)
  if (columns <= 1) return baseWidthPx
  return Math.max(baseWidthPx, columns * COLUMN_PITCH_PX)
}

// distributeChipRows lays groups into a balanced grid, returned bottom row
// first. With groups pre-sorted count-desc, row 0 holds the heaviest groups so
// the caller (rendering bottom-up via flex-col-reverse) places the most
// significant chips nearest the axis. The top row is the partial one and is
// centered by the caller, keeping the cloud symmetric over the anchor.
export function distributeChipRows(
  groups: SubjectGroup[],
  columns: number,
): SubjectGroup[][] {
  if (columns <= 0 || groups.length === 0) return []
  const rowCount = Math.ceil(groups.length / columns)
  const rows: SubjectGroup[][] = []
  for (let r = 0; r < rowCount; r++) {
    rows.push(groups.slice(r * columns, (r + 1) * columns))
  }
  return rows
}
