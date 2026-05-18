import type { TreeNode } from "@/components/wiki/wiki-tree-sidebar"
import type { WikiDocumentTreeFieldsFragment } from "@/graphql/gql/graphql"

/**
 * Collect IDs of every node in the given subtrees that *has children* — these
 * are the ids that need to live in `expandedNodes` to fully unfold a branch.
 * Leaves are skipped because they can't be expanded. Pass `includeRoots=false`
 * to skip the top-level `nodes` themselves.
 */
export function collectBranchIdsWithChildren(
  nodes: readonly TreeNode[],
  includeRoots: boolean,
): string[] {
  const out: string[] = []
  function visit(n: TreeNode, isRoot: boolean) {
    if (n.children.length > 0 && (!isRoot || includeRoots)) {
      out.push(n.id)
    }
    for (const c of n.children) visit(c, false)
  }
  for (const n of nodes) visit(n, true)
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
