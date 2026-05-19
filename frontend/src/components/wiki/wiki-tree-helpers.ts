import type { TreeNode } from "@/components/wiki/wiki-tree-sidebar"
import type { WikiDocumentTreeFieldsFragment } from "@/graphql/gql/graphql"

/**
 * Walk a flat list of tree-row fragments and return every id under `rootId`
 * (inclusive of `rootId` itself when not null) whose row has children. Used
 * by "Expand all" / "Expand subtree" — the lazy tree has no knowledge of
 * unloaded branches, so the caller first primes the full tree (see
 * `useEnsureWikiTree`) and then hands the resulting flat list here.
 *
 * Pass `rootId = null` to walk the whole operation from the roots.
 */
export function collectExpandableIdsFromFlat(
  rows: readonly WikiDocumentTreeFieldsFragment[],
  rootId: string | null,
): string[] {
  // Build the parent → children index once so each subtree walk is O(n).
  const byParent = new Map<string | null, WikiDocumentTreeFieldsFragment[]>()
  for (const row of rows) {
    const pid = row.parentDocumentId ?? null
    const arr = byParent.get(pid) ?? []
    arr.push(row)
    byParent.set(pid, arr)
  }

  const out: string[] = []

  function visit(parentId: string | null) {
    const children = byParent.get(parentId) ?? []
    for (const child of children) {
      if (child.childCount > 0) {
        out.push(child.id)
        visit(child.id)
      }
    }
  }

  if (rootId === null) {
    visit(null)
    return out
  }

  // Scoped to a subtree — include the root itself when it has children, so
  // the caller's "Expand subtree on N" actually opens N.
  const root = rows.find((r) => r.id === rootId)
  if (root && root.childCount > 0) out.push(rootId)
  visit(rootId)
  return out
}

/**
 * Sort tree rows by their fractional sort order (lexicographic). The lazy
 * children query already returns rows in sort_order, but client-side
 * operations (DnD optimistic updates, palette filtering) reuse the comparator.
 */
export function sortByOrder<T extends { sortOrder: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) =>
    a.sortOrder < b.sortOrder ? -1 : a.sortOrder > b.sortOrder ? 1 : 0,
  )
}

/**
 * Compute a sort string between two adjacent strings.
 * Uses simple midpoint character approach for fractional indexing.
 */
export function midSortOrder(before: string | null, after: string | null): string {
  const a = before ?? ""
  const b = after ?? ""
  const maxLen = Math.max(a.length, b.length) + 1
  let result = ""
  for (let i = 0; i < maxLen; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 64 // '@' — below 'A'
    const cb = i < b.length ? b.charCodeAt(i) : 123 // '{' — above 'z'
    const mid = Math.floor((ca + cb) / 2)
    if (mid > ca) {
      result += String.fromCharCode(mid)
      return result
    }
    result += String.fromCharCode(ca)
  }
  return result + "V" // fallback: append midpoint char
}

/**
 * Single-letter sortOrder for the i-th of `count` total siblings using the
 * A..z (65..122) bucketing shared by every sibling-rebalance path: DnD
 * before/after reorder, DnD "inside" drops, and the move dialog. Centralized
 * so the three callers can't drift apart on the bucket math.
 */
export function rebalancedSortOrderAt(index: number, count: number): string {
  const fraction = (index + 1) / (count + 1)
  return String.fromCharCode(65 + Math.floor(fraction * 57))
}

interface SiblingForPlacement {
  readonly id: string
  readonly sortOrder: string
}

/**
 * Compute the sortOrder updates needed to place a document at the TOP of its
 * destination subtree (used by both DnD "inside" drops and the move dialog).
 *
 * Three cases:
 * 1. No siblings — pick a middle-of-alphabet value so future inserts have
 *    room to land on either side.
 * 2. First sibling already has a non-empty sortOrder — just compute a value
 *    less than it via `midSortOrder(null, firstSort)`. No sibling rewrites.
 * 3. First sibling has the legacy empty "" sortOrder — we can't beat "" with
 *    a smaller string, so rebalance all siblings using the same A..z bucket
 *    scheme as the DnD before/after reorder, with the moved doc taking the
 *    first slot.
 *
 * The placed doc itself is excluded from the sibling list before placement so
 * a same-parent reorder doesn't fight against its own current position.
 */
export function computeTopPlacement(
  movedDocId: string,
  siblings: readonly SiblingForPlacement[],
): {
  newSortOrder: string
  siblingUpdates: ReadonlyArray<{ id: string; sortOrder: string }>
} {
  const others = sortByOrder(siblings.filter((s) => s.id !== movedDocId))

  if (others.length === 0) {
    return { newSortOrder: "M", siblingUpdates: [] }
  }

  const firstSort = others[0].sortOrder
  if (firstSort !== "") {
    return {
      newSortOrder: midSortOrder(null, firstSort),
      siblingUpdates: [],
    }
  }

  // Legacy empty-"" siblings — rebalance everyone so the moved doc can sit
  // above them. Moved doc takes index 0, existing siblings shift down. Same
  // bucketing as the DnD before/after path so the two flows can't disagree.
  const count = others.length + 1
  const newSortOrder = rebalancedSortOrderAt(0, count)
  const siblingUpdates = others.flatMap((s, i) => {
    const updated = rebalancedSortOrderAt(i + 1, count)
    return updated === s.sortOrder ? [] : [{ id: s.id, sortOrder: updated }]
  })
  return { newSortOrder, siblingUpdates }
}

/**
 * Promote a flat tree-row fragment to the recursive TreeNode shape consumed
 * by the sidebar. `children` is initialized empty — lazy hooks fill it in
 * per-branch when a node expands. Shared by the sidebar's root render and
 * each WikiTreeNode's children render so the conversion stays one line.
 */
export function rowToTreeNode(row: WikiDocumentTreeFieldsFragment): TreeNode {
  return {
    id: row.id,
    title: row.title,
    emoji: row.emoji,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sortOrder,
    parentId: row.parentDocumentId ?? null,
    childCount: row.childCount,
    children: [],
  }
}
