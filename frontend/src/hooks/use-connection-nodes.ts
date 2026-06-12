import { useMemo } from "react"
import { flattenConnection, type ConnectionPage } from "@/lib/connection"

// Memoized page-flattening for infinite queries:
//
//   const credentials = useConnectionNodes(data, (p) => p.credentials)
//
// The result array is stable across renders while `data` is unchanged, which
// matters for Virtuoso and memoized children. The memo is intentionally keyed
// on `data` alone so callers can pass an inline arrow without useCallback.
//
// Constraint: `getConnection` must be a pure property selection with no
// dependency on other reactive values (no `(p) => p[someStateField]`) — a
// dynamic accessor would silently return stale nodes while `data` is
// unchanged. If the accessor must be dynamic, call `flattenConnection`
// directly inside a useMemo with the full dependency list instead.
export function useConnectionNodes<TPage, TNode>(
  data: { pages: ReadonlyArray<TPage> } | undefined,
  getConnection: (page: TPage) => ConnectionPage<TNode>,
): TNode[] {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- getConnection is a pure accessor; see above
  return useMemo(() => flattenConnection(data, getConnection), [data])
}
