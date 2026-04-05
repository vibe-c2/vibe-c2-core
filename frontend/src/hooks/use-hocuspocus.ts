import { useEffect, useRef, useState } from "react"
import { Doc as YDoc } from "yjs"
import { HocuspocusProvider } from "@hocuspocus/provider"
import { fetchCollabTicket } from "@/lib/collab-ticket"

/** Build absolute WebSocket URL from the current page origin. */
function getWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${proto}//${window.location.host}`
}

interface UseHocuspocusReturn {
  ydoc: YDoc
  isConnected: boolean
  isSynced: boolean
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
  const [isConnected, setIsConnected] = useState(false)
  const [isSynced, setIsSynced] = useState(false)

  // Stable Y.Doc — created once per hook instance. TipTap reads this
  // synchronously during render via Collaboration.configure({ document }).
  const ydocRef = useRef<YDoc>(new YDoc())

  // Provider lives entirely in useEffect — created on mount, destroyed
  // on cleanup. StrictMode safe: each effect invocation gets its own
  // provider instance.
  useEffect(() => {
    const provider = new HocuspocusProvider({
      url: `${getWsUrl()}/api/v1/ws/wiki/`,
      name: `wiki/${documentId}`,
      document: ydocRef.current,
      preserveTrailingSlash: true,
      token: () => fetchCollabTicket(documentId),
    })

    function onStatus({ status }: { status: string }) {
      setIsConnected(status === "connected")
    }

    function onSynced({ state }: { state: boolean }) {
      setIsSynced(state)
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
    isConnected,
    isSynced,
  }
}
