// Frequently-used icon tracking for the wiki document icon picker.
//
// Persisted in localStorage so the "Frequently used" row survives reloads
// and follows the same UX shape as emoji-mart's built-in frequent row on the
// emoji tab. Storage stays local to the browser — no server round-trip.

import {
  ADAPTIVE_ICON_NAME,
  ALL_LUCIDE_NAMES,
  ICON_LOOKUP,
} from "@/components/wiki/icon-catalog"

const STORAGE_KEY = "wiki_frequent_icons"
// Cap on persisted entries — small enough that JSON parse stays cheap, large
// enough that a few uses of a niche icon won't get evicted by churn.
const MAX_TRACKED = 32
// Cap on rendered tiles — one row of 8 columns plus a second row gives users
// quick access without dominating the picker before they scroll.
const MAX_DISPLAYED = 16

interface FrequentEntry {
  name: string
  count: number
  /** Tiebreaker when two icons have the same count — most-recent wins. */
  lastUsed: number
}

function load(): FrequentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is FrequentEntry =>
        !!e &&
        typeof e === "object" &&
        typeof (e as FrequentEntry).name === "string" &&
        typeof (e as FrequentEntry).count === "number" &&
        typeof (e as FrequentEntry).lastUsed === "number",
    )
  } catch {
    return []
  }
}

function save(entries: readonly FrequentEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Quota exceeded / private browsing — silently degrade. Frequent icons
    // are a convenience; a failed save shouldn't break the picker.
  }
}

function sortByFrequency(entries: readonly FrequentEntry[]): FrequentEntry[] {
  return [...entries].sort(
    (a, b) => b.count - a.count || b.lastUsed - a.lastUsed,
  )
}

/**
 * Record one usage of an icon. Idempotent w.r.t. ordering — repeat calls
 * with the same name bump its count and recency in place. The adaptive
 * default is excluded so it doesn't compete with concrete icons for the
 * frequently-used slots; it already has its own dedicated section.
 */
export function recordFrequentIconUsage(name: string) {
  if (!name || name === ADAPTIVE_ICON_NAME) return
  const entries = load()
  const idx = entries.findIndex((e) => e.name === name)
  const now = Date.now()
  const next: FrequentEntry[] =
    idx >= 0
      ? entries.map((e, i) =>
          i === idx ? { ...e, count: e.count + 1, lastUsed: now } : e,
        )
      : [...entries, { name, count: 1, lastUsed: now }]
  save(sortByFrequency(next).slice(0, MAX_TRACKED))
}

/**
 * Returns the top frequently-used icon names, filtered to those still
 * resolvable in the current lucide bundle. Stale entries (icon removed
 * from lucide, or renamed) are skipped silently so the picker never tries
 * to render a missing component.
 */
export function loadFrequentIconNames(limit = MAX_DISPLAYED): string[] {
  const entries = sortByFrequency(load())
  const result: string[] = []
  for (const e of entries) {
    if (!ICON_LOOKUP[e.name] && !ALL_LUCIDE_NAMES.has(e.name)) continue
    result.push(e.name)
    if (result.length >= limit) break
  }
  return result
}
