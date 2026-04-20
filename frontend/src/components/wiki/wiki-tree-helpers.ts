import type { TreeNode } from "@/components/wiki/wiki-tree-sidebar"

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
