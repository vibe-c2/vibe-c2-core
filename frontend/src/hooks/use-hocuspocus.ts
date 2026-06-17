import { useEffect, useRef, useState } from "react"
import { Doc as YDoc } from "yjs"
import { HocuspocusProvider } from "@hocuspocus/provider"
import { fetchCollabTicket, SchemaOutdatedError } from "@/lib/collab-ticket"

/** Build absolute WebSocket URL from the current page origin. */
function getWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${proto}//${window.location.host}`
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected"

interface UseHocuspocusReturn {
  ydoc: YDoc
  provider: HocuspocusProvider | null
  connectionStatus: ConnectionStatus
  isSynced: boolean
  isReady: boolean
  // True when the backend refused to connect because this client's editor
  // schema is older than the document's stored content (see SchemaOutdatedError).
  // The consumer should block editing and prompt the user to reload — no
  // WebSocket is opened in this state, so no content can be pruned.
  schemaOutdated: boolean
}

/**
 * Manages a Hocuspocus WebSocket connection for a single wiki document.
 *
 * Handles document switching internally — when `documentId` changes the
 * old Y.Doc and provider are destroyed and fresh ones are created. The
 * parent component does **not** need to use `key={documentId}`.
 */
export function useHocuspocus(documentId: string): UseHocuspocusReturn {
  const [ydoc, setYdoc] = useState<YDoc>(() => new YDoc())
  const [provider, setProvider] = useState<HocuspocusProvider | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting")
  const [isSynced, setIsSynced] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [schemaOutdated, setSchemaOutdated] = useState(false)

  // Tracks whether the provider has ever reached "connected" during this
  // document's session. Lets us distinguish "initial connect in progress"
  // (connecting) from "lost an established connection" (disconnected).
  const hasConnectedRef = useRef(false)

  // Reset session state during render when documentId changes — the provider
  // and ydoc are torn down and rebuilt by the effect below. Doing the reset
  // here (prev-value pattern, react.dev/.../storing-information-from-previous-renders)
  // avoids a setState-in-effect cascade.
  const [lastDocumentId, setLastDocumentId] = useState(documentId)
  if (lastDocumentId !== documentId) {
    setLastDocumentId(documentId)
    setConnectionStatus("connecting")
    setIsSynced(false)
    setIsReady(false)
    setSchemaOutdated(false)
  }

  // Provider + Y.Doc lifecycle: when documentId changes, tear down the
  // old provider and doc, then create fresh ones. The ydoc is stored in
  // state so consumers (WikiEditor) re-render and rebind automatically.
  // The setYdoc/setProvider calls below are flagged by react-hooks/set-state-in-effect,
  // but the React docs explicitly carve out this exception: "Effects are
  // intended to synchronize state ... with external systems." A YDoc and a
  // WebSocket provider are external resources whose handles must be reflected
  // in render state so consumers can rebind. Refs would break that rebind.
  useEffect(() => {
    hasConnectedRef.current = false
    let cancelled = false

    const doc = new YDoc()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setYdoc(doc)

    let hpProvider: HocuspocusProvider | null = null

    function onStatus({ status }: { status: string }) {
      if (status === "connected") {
        hasConnectedRef.current = true
        setConnectionStatus("connected")
      } else {
        setConnectionStatus(hasConnectedRef.current ? "disconnected" : "connecting")
      }
    }

    function onSynced({ state }: { state: boolean }) {
      setIsSynced(state)
      if (state && hasConnectedRef.current) {
        setIsReady(true)
      }
    }

    // Provider's token callback. The eagerly-fetched first ticket is reused on
    // the initial connect to avoid a duplicate request; reconnects re-fetch.
    // A SchemaOutdatedError on a reconnect (a deploy bumped the schema mid-
    // session) flips schemaOutdated so the editor surfaces the reload prompt.
    function makeTokenCallback(prefetched: string | null) {
      let used = false
      return async () => {
        if (prefetched && !used) {
          used = true
          return prefetched
        }
        try {
          return await fetchCollabTicket(documentId)
        } catch (err) {
          if (!cancelled && err instanceof SchemaOutdatedError) {
            setSchemaOutdated(true)
          }
          throw err
        }
      }
    }

    function buildProvider(firstTicket: string | null) {
      if (cancelled) return
      hpProvider = new HocuspocusProvider({
        url: `${getWsUrl()}/api/v1/ws/wiki/`,
        name: `wiki/${documentId}`,
        document: doc,
        preserveTrailingSlash: true,
        token: makeTokenCallback(firstTicket),
      })
      setProvider(hpProvider)
      hpProvider.on("status", onStatus)
      hpProvider.on("synced", onSynced)
    }

    // Eager pre-flight: fetch a ticket before opening the WebSocket so an
    // outdated client short-circuits to the reload prompt and never connects
    // (a connected stale editor could prune unknown nodes). Transient/other
    // failures still build the provider so its own retry/auth loop can recover.
    fetchCollabTicket(documentId)
      .then((ticket) => {
        if (cancelled) return
        buildProvider(ticket)
      })
      .catch((err) => {
        if (cancelled) return
        if (err instanceof SchemaOutdatedError) {
          setSchemaOutdated(true)
          return
        }
        buildProvider(null)
      })

    return () => {
      cancelled = true
      setProvider(null)
      if (hpProvider) {
        hpProvider.off("status", onStatus)
        hpProvider.off("synced", onSynced)
        hpProvider.destroy()
      }
      doc.destroy()
    }
  }, [documentId])

  return {
    ydoc,
    provider,
    connectionStatus,
    isSynced,
    isReady,
    schemaOutdated,
  }
}
