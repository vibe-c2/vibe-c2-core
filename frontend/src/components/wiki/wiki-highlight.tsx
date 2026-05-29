import { type ReactNode } from "react"

// Both helpers wrap matched regions in <mark>. JS strings iterate by UTF-16
// code units, so we explode to codepoints first — keeps rune-offset ranges
// from the server aligned with what the user sees, and keeps the case-
// insensitive substring scan from splitting astral characters.

interface MatchRange {
  start: number
  end: number
}

// HighlightedRanges renders pre-computed server-side rune-offset ranges
// (snippet + matchRanges from the search API).
export function HighlightedRanges({
  text,
  ranges,
}: {
  text: string
  ranges: readonly MatchRange[]
}) {
  const runes = Array.from(text)
  const sorted = (ranges ?? [])
    .filter((r) => r.start < r.end && r.start >= 0 && r.end <= runes.length)
    .sort((a, b) => a.start - b.start)

  // Drop overlaps so renderHighlighted can assume monotonically increasing,
  // non-overlapping ranges.
  const clean: MatchRange[] = []
  let cursor = 0
  for (const r of sorted) {
    if (r.start < cursor) continue
    clean.push(r)
    cursor = r.end
  }
  return renderHighlighted(runes, clean)
}

// HighlightedSubstring highlights every case-insensitive occurrence of
// `query` inside `text`. Used by surfaces that don't carry server-computed
// ranges — title and breadcrumb crumbs — so the same visual treatment lands
// on every place the user's query appears in the result row.
//
// The search uses case-folded equality on lowercased runes (Unicode-aware
// via String.prototype.toLowerCase) rather than RegExp, so user input
// like "(a+)+" or "/" is matched literally and cannot misbehave.
export function HighlightedSubstring({
  text,
  query,
}: {
  text: string
  query: string | null | undefined
}) {
  const trimmed = query?.trim()
  if (!trimmed) return <>{text}</>

  const textRunes = Array.from(text)
  const textLower = Array.from(text.toLowerCase())
  const queryLower = Array.from(trimmed.toLowerCase())
  if (queryLower.length === 0 || queryLower.length > textLower.length) {
    return <>{text}</>
  }

  const ranges: MatchRange[] = []
  let i = 0
  outer: while (i <= textLower.length - queryLower.length) {
    for (let j = 0; j < queryLower.length; j++) {
      if (textLower[i + j] !== queryLower[j]) {
        i++
        continue outer
      }
    }
    ranges.push({ start: i, end: i + queryLower.length })
    i += queryLower.length // non-overlapping matches
  }

  return renderHighlighted(textRunes, ranges)
}

// Renders `runes` with the given non-overlapping ranges wrapped in <mark>.
// Caller guarantees ranges are sorted and disjoint.
function renderHighlighted(runes: string[], ranges: MatchRange[]): ReactNode {
  if (ranges.length === 0) return <>{runes.join("")}</>

  const out: ReactNode[] = []
  let cursor = 0
  ranges.forEach((r, idx) => {
    if (r.start > cursor) out.push(runes.slice(cursor, r.start).join(""))
    out.push(
      <mark key={idx} className={highlightClassName}>
        {runes.slice(r.start, r.end).join("")}
      </mark>,
    )
    cursor = r.end
  })
  if (cursor < runes.length) out.push(runes.slice(cursor).join(""))
  return <>{out}</>
}

const highlightClassName =
  "rounded bg-yellow-200 px-0.5 text-foreground dark:bg-yellow-800/70"
