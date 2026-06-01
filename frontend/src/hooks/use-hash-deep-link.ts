import { useEffect, useRef } from "react"
import { useSearchParams } from "react-router"
import { useHashStore } from "@/stores/hashes"
import { useFindingsStore } from "@/stores/findings"

// URL search-param key for the hash deep-link flow. Mirrors the credential
// equivalent so the two findings tabs behave identically — landing on
// `?hash=<id>` forces the hashes tab and opens the details dialog with that
// id; closing the dialog strips the param.
const HASH_PARAM = "hash"

// Same edge-triggered URL ↔ store mirroring pattern as useCredentialDeepLink.
// See that hook for the longer rationale; this is a direct port.
export function useHashDeepLink() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlHashId = searchParams.get(HASH_PARAM)

  const detailsPanelOpen = useHashStore((s) => s.detailsPanelOpen)
  const selectedId = useHashStore((s) => s.selected?.id ?? null)
  const openDetailsPanel = useHashStore((s) => s.openDetailsPanel)
  const setActiveTab = useFindingsStore((s) => s.setActiveTab)

  const prevUrlIdRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevUrlIdRef.current
    prevUrlIdRef.current = urlHashId
    if (prev === urlHashId) return
    if (!urlHashId) return
    if (detailsPanelOpen && selectedId === urlHashId) return
    setActiveTab("hashes")
    openDetailsPanel({ id: urlHashId, label: "" })
  }, [urlHashId, detailsPanelOpen, selectedId, openDetailsPanel, setActiveTab])

  const wasOpenRef = useRef(false)
  useEffect(() => {
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = detailsPanelOpen

    if (detailsPanelOpen && selectedId && selectedId !== urlHashId) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set(HASH_PARAM, selectedId)
          return next
        },
        { replace: true },
      )
      return
    }
    if (wasOpen && !detailsPanelOpen && urlHashId) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete(HASH_PARAM)
          return next
        },
        { replace: true },
      )
    }
  }, [detailsPanelOpen, selectedId, urlHashId, setSearchParams])
}
