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
  connectionStatus: ConnectionStatus
  isSynced: boolean
  isReady: boolean
}

/**
 * Manages a Hocuspocus WebSocket connection for a single wiki document.
 *
 * The Y.Doc is created synchronously (TipTap needs it during render).
 * The HocuspocusProvider lives entirely inside useEffect for proper
 * lifecycle management (StrictMode safe). The parent component should
 * use `key={documentId}` to remount when switching documents.
 */
export function useHocuspocus(documentId: string): UseHocuspocusReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting")
  const [isSynced, setIsSynced] = useState(false)
  const [isReady, setIsReady] = useState(false)

  // Tracks whether the provider has ever reached "connected" during this
  // mount. Lets us distinguish "initial connect in progress" (connecting)
  // from "lost an established connection" (disconnected).
  const hasConnectedRef = useRef(false)

  // Stable Y.Doc — created once per hook instance. TipTap reads this
  // synchronously during render via Collaboration.configure({ document }).
  const ydocRef = useRef<YDoc>(new YDoc())

  // Provider lives entirely in useEffect — created on mount, destroyed
  // on cleanup. StrictMode safe: each effect invocation gets its own
  // provider instance.
  useEffect(() => {
    hasConnectedRef.current = false

    const provider = new HocuspocusProvider({
      url: `${getWsUrl()}/api/v1/ws/wiki/`,
      name: `wiki/${documentId}`,
      document: ydocRef.current,
      preserveTrailingSlash: true,
      token: () => fetchCollabTicket(documentId),
    })

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

    provider.on("status", onStatus)
    provider.on("synced", onSynced)

    return () => {
      provider.off("status", onStatus)
      provider.off("synced", onSynced)
      provider.destroy()
    }
  }, [documentId])

  return {
    ydoc: ydocRef.current,
    connectionStatus,
    isSynced,
    isReady,
  }
}
