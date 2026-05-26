import { useEffect, useRef } from "react"
import { useSearchParams } from "react-router"
import { useCredentialStore } from "@/stores/credentials"
import { useFindingsStore } from "@/stores/findings"

// URL search-param key for the credential deep-link flow. When
// `?credential=<id>` is present, the details dialog opens automatically with
// that id; closing the dialog strips the param. See `buildCredentialShareUrl`
// in `components/findings/credential-share-link.ts` for the producer side.
const CREDENTIAL_PARAM = "credential"

// Keeps `?credential=<id>` in the URL in lockstep with the credential details
// dialog in `useCredentialStore`. The URL is treated as authoritative state:
//
//   URL → store: arriving with `?credential=<id>` opens the dialog with that
//   id and forces the credentials tab so the dialog isn't rendered behind a
//   different active tab. A reload while the dialog is open re-opens it.
//
//   store → URL: opening the dialog (from any source — row click, deep link,
//   etc.) mirrors the selected id into the URL so the page is always
//   copy-link-able. Closing the dialog strips the param.
//
// Names are intentionally left blank on the URL path — the dialog title
// falls back to `credential.name` once the query resolves.
//
// Both effects are edge-triggered (refs track previous values) so they only
// react to the change they care about. Without this guard, the closed→opened
// path would race with the URL-strip-on-close path and re-open the dialog.
//
// Intended to be mounted exactly once by `FindingsPage`. The dialog itself is
// also rendered on other pages (wiki) — those pages don't run this hook, so
// their URLs stay untouched.
export function useCredentialDeepLink() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlCredentialId = searchParams.get(CREDENTIAL_PARAM)

  const detailsPanelOpen = useCredentialStore((s) => s.detailsPanelOpen)
  const selectedId = useCredentialStore((s) => s.selected?.id ?? null)
  const openDetailsPanel = useCredentialStore((s) => s.openDetailsPanel)
  const setActiveTab = useFindingsStore((s) => s.setActiveTab)

  // URL → store: fires only on URL transitions to a non-null id. Bails if the
  // store already shows that credential, which prevents clobbering a
  // row-click's `name` with an empty placeholder when Effect 2 mirrors the
  // id into the URL.
  const prevUrlIdRef = useRef<string | null>(null)
  useEffect(() => {
    const prev = prevUrlIdRef.current
    prevUrlIdRef.current = urlCredentialId
    if (prev === urlCredentialId) return
    if (!urlCredentialId) return
    if (detailsPanelOpen && selectedId === urlCredentialId) return
    setActiveTab("credentials")
    openDetailsPanel({ id: urlCredentialId, name: "" })
  }, [
    urlCredentialId,
    detailsPanelOpen,
    selectedId,
    openDetailsPanel,
    setActiveTab,
  ])

  // store → URL: mirror the selection while the dialog is open; strip the
  // param only on the open→closed edge (not on every closed render, which
  // would race with Effect 1 on initial mount with `?credential=<id>`).
  const wasOpenRef = useRef(false)
  useEffect(() => {
    const wasOpen = wasOpenRef.current
    wasOpenRef.current = detailsPanelOpen

    if (detailsPanelOpen && selectedId && selectedId !== urlCredentialId) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set(CREDENTIAL_PARAM, selectedId)
          return next
        },
        { replace: true },
      )
      return
    }
    if (wasOpen && !detailsPanelOpen && urlCredentialId) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete(CREDENTIAL_PARAM)
          return next
        },
        { replace: true },
      )
    }
  }, [detailsPanelOpen, selectedId, urlCredentialId, setSearchParams])
}
