// Helpers for GraphQL cursor connections ({ edges: [{ node }] }) fetched
// through React Query's useInfiniteQuery. Every paginated list in the app
// flattens pages the same way; this is the single implementation.

export interface ConnectionPage<TNode> {
  edges: ReadonlyArray<{ node: TNode }>
}

// Flattens InfiniteData pages into one node array. `getConnection` picks the
// connection field out of a page (e.g. `(p) => p.credentials`), which keeps
// the helper agnostic of the query's root field name.
export function flattenConnection<TPage, TNode>(
  data: { pages: ReadonlyArray<TPage> } | undefined,
  getConnection: (page: TPage) => ConnectionPage<TNode>,
): TNode[] {
  return (
    data?.pages.flatMap((page) => getConnection(page).edges.map((e) => e.node)) ??
    []
  )
}
