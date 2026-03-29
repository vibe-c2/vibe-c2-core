// Generic React hook for GraphQL subscriptions over SSE.
//
// Manages the connection lifecycle: connect on mount (or when enabled becomes
// true), reconnect with exponential backoff on failure, clean up on unmount.
// Auth is handled transparently via httpOnly cookies.

import { useEffect, useRef } from "react"
import type { TypedDocumentNode } from "@graphql-typed-document-node/core"
import { graphqlSubscribe } from "@/lib/graphql-subscribe"
import { tryRefresh } from "@/services/api-client"

const MIN_RETRY_DELAY = 1_000 // 1 second
const MAX_RETRY_DELAY = 30_000 // 30 seconds

interface UseSubscriptionOptions<TResult> {
  /** Called for each event received from the server. */
  onData: (data: TResult) => void
  /** Whether the subscription is active. Defaults to true. */
  enabled?: boolean
}

/**
 * Subscribe to a GraphQL subscription over SSE.
 *
 * Opens a long-lived HTTP connection and calls onData for each event.
 * Automatically reconnects with exponential backoff (with jitter) on
 * disconnection. Cleans up when the component unmounts or enabled becomes false.
 */
export function useSubscription<TResult, TVariables>(
  document: TypedDocumentNode<TResult, TVariables>,
  variables: TVariables | undefined,
  options: UseSubscriptionOptions<TResult>,
): void {
  const { enabled = true } = options

  // Use refs for the callback to avoid reconnecting when the callback identity changes.
  const onDataRef = useRef(options.onData)
  onDataRef.current = options.onData

  // Serialize variables for stable useEffect deps (objects change identity each render).
  const variablesKey = JSON.stringify(variables ?? null)

  useEffect(() => {
    if (!enabled) return

    let controller: AbortController | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let retryDelay = MIN_RETRY_DELAY
    let disposed = false

    function connect() {
      if (disposed) return

      controller = graphqlSubscribe(document, variables, {
        onNext: (data) => {
          // Reset backoff on successful data — connection is healthy.
          retryDelay = MIN_RETRY_DELAY
          onDataRef.current(data)
        },
        onError: (_err) => {
          if (disposed) return
          scheduleReconnect(true)
        },
        onComplete: () => {
          if (disposed) return
          // Server ended the stream cleanly — reconnect without refreshing.
          scheduleReconnect(false)
        },
      })
    }

    function scheduleReconnect(refresh: boolean) {
      if (disposed) return

      // Add random jitter (0–1s) to prevent thundering herd when
      // many clients reconnect after a server restart.
      const jitter = Math.random() * 1000
      const delay = retryDelay + jitter

      retryTimer = setTimeout(async () => {
        retryTimer = null
        if (disposed) return

        // On error (likely 401), refresh cookies before reconnecting
        // so we don't loop with an expired access token.
        // On clean server close, skip — token is probably fine.
        if (refresh) {
          await tryRefresh()
          if (disposed) return
        }

        connect()
      }, delay)

      // Exponential backoff, capped at MAX_RETRY_DELAY.
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY)
    }

    connect()

    return () => {
      disposed = true
      controller?.abort()
      if (retryTimer) clearTimeout(retryTimer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document, variablesKey, enabled])
}
