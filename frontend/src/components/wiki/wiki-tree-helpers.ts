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
