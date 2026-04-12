import { useEffect, useRef, useState } from "react"
import { Doc as YDoc } from "yjs"
import { HocuspocusProvider } from "@hocuspocus/provider"
import { fetchCollabTicket } from "@/lib/collab-ticket"

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

  // Tracks whether the provider has ever reached "connected" during this
  // document's session. Lets us distinguish "initial connect in progress"
  // (connecting) from "lost an established connection" (disconnected).
  const hasConnectedRef = useRef(false)

  // Provider + Y.Doc lifecycle: when documentId changes, tear down the
  // old provider and doc, then create fresh ones. The ydoc is stored in
  // state so consumers (WikiEditor) re-render and rebind automatically.
  useEffect(() => {
    hasConnectedRef.current = false
    setConnectionStatus("connecting")
    setIsSynced(false)
    setIsReady(false)

    const doc = new YDoc()
    setYdoc(doc)

    const hpProvider = new HocuspocusProvider({
      url: `${getWsUrl()}/api/v1/ws/wiki/`,
      name: `wiki/${documentId}`,
      document: doc,
      preserveTrailingSlash: true,
      token: () => fetchCollabTicket(documentId),
    })
    setProvider(hpProvider)

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

    hpProvider.on("status", onStatus)
    hpProvider.on("synced", onSynced)

    return () => {
      setProvider(null)
      hpProvider.off("status", onStatus)
      hpProvider.off("synced", onSynced)
      hpProvider.destroy()
      doc.destroy()
    }
  }, [documentId])

  return {
    ydoc,
    provider,
    connectionStatus,
    isSynced,
    isReady,
  }
}
