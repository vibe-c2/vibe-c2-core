// Generic React hook for GraphQL subscriptions over SSE.
//
// Thin wrapper over lib/subscription-registry.ts. All connection management
// (dedup, backoff, refresh-on-401, reachable-gating, visibility-pause)
// lives in the registry — this hook just attaches/detaches a listener for
// the lifetime of the component.

import { useEffect, useRef } from "react"
import type { TypedDocumentNode } from "@graphql-typed-document-node/core"
import { subscribe } from "@/lib/subscription-registry"

interface UseSubscriptionOptions<TResult> {
  /** Called for each event received from the server. */
  onData: (data: TResult) => void
  /** Whether the subscription is active. Defaults to true. */
  enabled?: boolean
}

export function useSubscription<TResult, TVariables>(
  document: TypedDocumentNode<TResult, TVariables>,
  variables: TVariables | undefined,
  options: UseSubscriptionOptions<TResult>,
): void {
  const { enabled = true } = options

  // Keep the callback in a ref so changing its identity doesn't re-open
  // the underlying SSE connection.
  const onDataRef = useRef(options.onData)
  onDataRef.current = options.onData

  // Serialize variables for stable useEffect deps.
  const variablesKey = JSON.stringify(variables ?? null)

  useEffect(() => {
    if (!enabled) return
    return subscribe(document, variables, (data) => {
      onDataRef.current(data)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, variablesKey, enabled])
}
