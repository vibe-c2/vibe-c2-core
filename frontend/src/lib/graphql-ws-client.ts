// Singleton graphql-ws client.
//
// One WebSocket upgrade to /api/v1/graphql/ws carries every active
// GraphQL subscription on the page. Compared to the legacy SSE transport,
// this collapses N sockets (one per subscription) down to one — keeping
// browsers comfortably under the HTTP/1.1 6-connection-per-origin cap and
// leaving headroom for the Hocuspocus collab WebSocket.
//
// Auth flows through the existing httpOnly `access_token` cookie: the WS
// upgrade is a GET, browsers attach cookies automatically, and the Gin
// JWTAuth middleware validates them before gqlgen ever sees the connection.
// The server's InitFunc is a thin sanity check that AuthInfo is set.
//
// Mid-session token expiry is handled inside `retryWait`: every connection
// close marks the next retry as a refresh candidate. tryRefresh() dedupes
// concurrent callers and rotates the access_token + csrf_token cookies on
// success, after which the next WS upgrade succeeds.
//
// This module owns only the *client object*. Subscription lifecycle
// (refcount dedup, visibility-pause, listener fanout) lives in
// lib/subscription-registry.ts — keeping the two concerns separated makes
// it obvious which side owns reconnects (the client) vs which side owns
// subscriptions (the registry).

import { createClient, type Client } from "graphql-ws"
import { tryRefresh } from "@/services/api-client"
import { useConnectivityStore } from "@/stores/connectivity"

const MIN_RETRY_DELAY_MS = 1_000
const MAX_RETRY_DELAY_MS = 30_000

function buildWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${proto}//${window.location.host}/api/v1/graphql/ws`
}

let client: Client | null = null
let refreshOnNextRetry = false

export function getGraphQLWSClient(): Client {
  if (client) return client

  client = createClient({
    url: buildWsUrl,
    lazy: true,
    keepAlive: 15_000,
    retryAttempts: Infinity,
    shouldRetry: () => true,
    retryWait: async (retries) => {
      // 1. If the previous close looked auth-related, try a token refresh
      //    before the next upgrade. tryRefresh dedupes concurrent callers
      //    and rotates the access_token + csrf_token cookies on success.
      if (refreshOnNextRetry) {
        refreshOnNextRetry = false
        await tryRefresh()
      }
      // 2. Wait until the backend is known reachable, collapsing N parallel
      //    reconnect attempts into "one health poll, everyone waits".
      await useConnectivityStore.getState().waitUntilReachable()
      // 3. Exponential backoff with jitter (capped at 30s).
      const backoff = Math.min(
        MIN_RETRY_DELAY_MS * 2 ** retries,
        MAX_RETRY_DELAY_MS,
      )
      const jitter = Math.random() * 1_000
      await new Promise((r) => setTimeout(r, backoff + jitter))
    },
    on: {
      connected: () => {
        useConnectivityStore.getState().markReachable()
      },
      closed: (event) => {
        // We can't reliably distinguish 401 from transport errors here:
        // a failed WS upgrade due to an expired token surfaces as a generic
        // close, not as a 401 we can read from JS. Refresh is idempotent
        // and cheap (tryRefresh dedupes), so flag every non-clean close
        // and let the next retryWait decide whether to act.
        const code = (event as CloseEvent | undefined)?.code
        if (code !== 1000 || event instanceof Error) {
          refreshOnNextRetry = true
        }
      },
      error: () => {
        useConnectivityStore.getState().markUnreachable()
      },
    },
  })

  return client
}
