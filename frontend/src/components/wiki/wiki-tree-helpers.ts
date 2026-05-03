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
 * Walk parent pointers from `documentId` upward, returning each ancestor's id.
 * Excludes the document itself (a leaf doesn't need expanding to be visible —
 * its parent does). Returns [] if the document isn't in the flat list or has
 * no parent. Cycle-safe.
 */
export function collectAncestorIds(
  documentId: string,
  docs: readonly WikiDocumentTreeFieldsFragment[],
): string[] {
  const byId = new Map(docs.map((d) => [d.id, d]))
  const out: string[] = []
  const seen = new Set<string>()
  let current = byId.get(documentId)
  while (current?.parentDocument?.id) {
    const parentId = current.parentDocument.id
    if (seen.has(parentId)) break
    seen.add(parentId)
    out.push(parentId)
    current = byId.get(parentId)
  }
  return out
}
