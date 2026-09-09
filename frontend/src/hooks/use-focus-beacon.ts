import { useEffect, useMemo, useRef } from "react"
import { useLocation } from "react-router"
import { useMutation } from "@tanstack/react-query"
import { graphqlClient } from "@/lib/graphql-client"
import {
  PublishOperatorFocusDocument,
  type OperatorFocusInput,
} from "@/graphql/gql/graphql"
import { useDebounced } from "@/hooks/use-debounced"
import { useScopedOperationId } from "@/hooks/use-scoped-operation"
import { useEffectiveWikiOperation } from "@/hooks/use-effective-wiki-operation-id"
import { useCredentialStore } from "@/stores/credentials"
import { useFindingsStore } from "@/stores/findings"
import { useHashStore } from "@/stores/hashes"
import { useHostStore } from "@/stores/hosts"
import { useTaskStore } from "@/stores/tasks"
import { useWikiStore } from "@/stores/wiki"

// How long the operator's location stays interesting after they stop moving.
// Long enough that ordinary reading does not spam the server, short enough
// that an agent asking "where are they?" gets a current answer.
const BEACON_DEBOUNCE_MS = 800

// Refreshes the server-side TTL while the operator is sitting still. The TTL
// is 90s, so this leaves comfortable margin for one dropped request.
const BEACON_HEARTBEAT_MS = 45_000

/**
 * Publishes what the operator is currently looking at, so an AI agent
 * connected over MCP can follow along instead of asking.
 *
 * Mount once, inside the router. Three things shape the implementation:
 *
 *  1. It sends over HTTP, not the WebSocket. The subscription registry
 *     disposes every socket when the tab is hidden, which is precisely when
 *     the last beacon would matter, and graphqlClient goes through apiFetch,
 *     which handles the CSRF double-submit.
 *  2. It stops entirely when the tab is hidden. The server-side TTL then
 *     expires and the agent correctly sees nobody there. A beacon that kept
 *     reporting from a backgrounded tab would tell the agent the operator is
 *     looking at something they walked away from an hour ago.
 *  3. It skips byte-identical payloads. Store subscriptions fire far more
 *     often than the operator actually moves.
 */
export function useFocusBeacon() {
  const location = useLocation()
  const scopedOperationId = useScopedOperationId()
  const { effectiveOperationId: wikiOperationId } = useEffectiveWikiOperation()

  const wikiDocumentId = useWikiStore((s) => s.selectedDocumentId)
  const findingsTab = useFindingsStore((s) => s.activeTab)
  const selectedHost = useHostStore((s) => s.selected)
  const topologyRelation = useHostStore((s) => s.topologyRelation)
  const topologyView = useHostStore((s) => s.view)
  const topologyFocusedNodeId = useHostStore((s) => s.topologyFocusedNodeId)
  const topologyFocusedEdgeId = useHostStore((s) => s.topologyFocusedEdgeId)
  const hostSearch = useHostStore((s) => s.filters.search)
  const selectedCredential = useCredentialStore((s) => s.selected)
  const credentialSearch = useCredentialStore((s) => s.filters.search)
  const selectedHash = useHashStore((s) => s.selected)
  const selectedTask = useTaskStore((s) => s.selected)

  // `mutate` is referentially stable in TanStack Query, so it can be an
  // effect dependency directly rather than being smuggled through a ref.
  const { mutate: publishFocus } = useMutation({
    mutationFn: (input: OperatorFocusInput) =>
      graphqlClient(PublishOperatorFocusDocument, { input }),
  })

  const focus = useMemo<OperatorFocusInput>(() => {
    const onFindings = location.pathname.startsWith("/findings")
    const onTopology = onFindings && topologyView === "topology"

    return {
      route: location.pathname,
      operationId: scopedOperationId,
      // The wiki can target the synthetic Public operation independently of
      // the scoped one, so both are reported. An agent told only the scoped
      // operation would look for a page in the wrong place.
      wikiOperationId: wikiOperationId || null,
      wikiDocumentId: wikiDocumentId ?? null,
      hostId: selectedHost?.id ?? null,
      credentialId: selectedCredential?.id ?? null,
      hashId: selectedHash?.id ?? null,
      taskId: selectedTask?.id ?? null,
      findingsTab: onFindings ? findingsTab : null,
      topologyLens: onTopology ? topologyRelation : null,
      topologyFocusedNodeId: onTopology ? topologyFocusedNodeId : null,
      topologyFocusedEdgeId: onTopology ? topologyFocusedEdgeId : null,
      searchSummary: summarizeSearch(location.pathname, {
        hostSearch,
        credentialSearch,
      }),
    }
  }, [
    location.pathname,
    scopedOperationId,
    wikiOperationId,
    wikiDocumentId,
    selectedHost?.id,
    selectedCredential?.id,
    selectedHash?.id,
    selectedTask?.id,
    findingsTab,
    topologyView,
    topologyRelation,
    topologyFocusedNodeId,
    topologyFocusedEdgeId,
    hostSearch,
    credentialSearch,
  ])

  // Debounce the serialized form rather than the object: the memo above
  // produces a new reference on any store tick, but the same bytes.
  const serialized = useMemo(() => JSON.stringify(focus), [focus])
  const debounced = useDebounced(serialized, BEACON_DEBOUNCE_MS)

  const lastSentRef = useRef<string | null>(null)

  useEffect(() => {
    if (document.visibilityState !== "visible") return
    if (lastSentRef.current === debounced) return

    lastSentRef.current = debounced
    // Fire and forget. A failed beacon costs the agent some awareness and
    // nothing else, so it must never surface an error to the operator.
    publishFocus(JSON.parse(debounced) as OperatorFocusInput)
  }, [debounced, publishFocus])

  // Heartbeat: refresh the TTL while the operator is reading rather than
  // navigating. Only while visible, and it re-sends the last payload rather
  // than recomputing, so a heartbeat can never report a location the
  // debounced path has not already published.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return
      const payload = lastSentRef.current
      if (!payload) return
      publishFocus(JSON.parse(payload) as OperatorFocusInput)
    }

    const interval = setInterval(tick, BEACON_HEARTBEAT_MS)

    // Coming back to a visible tab republishes immediately: the TTL has very
    // likely lapsed while it was hidden, and waiting up to a heartbeat would
    // leave the agent thinking the operator is still away.
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick()
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [publishFocus])
}

// summarizeSearch reports that the operator is looking at a filtered subset,
// without shipping every filter field. The agent needs to know the view is
// narrowed; it does not need to reconstruct the query.
function summarizeSearch(
  pathname: string,
  searches: { hostSearch: string; credentialSearch: string },
): string | null {
  if (pathname.startsWith("/findings")) {
    if (searches.credentialSearch) return `credentials matching "${searches.credentialSearch}"`
    if (searches.hostSearch) return `hosts matching "${searches.hostSearch}"`
  }
  return null
}
