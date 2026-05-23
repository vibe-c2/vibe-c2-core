import { useEffect, useRef } from "react"
import { Navigate, Outlet, useLocation, useNavigate } from "react-router"
import { useAuthStore } from "@/stores/auth"
import { useConnectivityStore } from "@/stores/connectivity"
import { useSessionGuard } from "@/hooks/use-session-guard"
import { useScopedOperationGuard } from "@/hooks/use-scoped-operation-guard"
import { useScopedOperationStore } from "@/stores/scoped-operation"
import { useWikiTreeModeStore } from "@/stores/wiki-tree-mode"

export function ProtectedRoute({ permission }: { permission?: string }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const userId = useAuthStore((s) => s.user?.userId)
  const reachable = useConnectivityStore((s) => s.reachable)

  // Subscribe to session events — if the current session is revoked,
  // clearSession() is called and isAuthenticated becomes false,
  // triggering the redirect to /login below.
  useSessionGuard()

  // Hydrate the scoped operation from localStorage once the user is known.
  // The store's `hydrated` flag flips to true synchronously inside hydrate(),
  // so we don't need a local mirror — using the store directly avoids the
  // setState-in-effect cascading-render that lint flags.
  const hydrate = useScopedOperationStore((s) => s.hydrate)
  const hydrated = useScopedOperationStore((s) => s.hydrated)
  const hydrateWikiTreeMode = useWikiTreeModeStore((s) => s.hydrate)
  useEffect(() => {
    if (userId) {
      hydrate(userId)
      hydrateWikiTreeMode(userId)
    }
  }, [userId, hydrate, hydrateWikiTreeMode])

  // Validate the restored scope and subscribe to real-time changes.
  useScopedOperationGuard()

  const isValidating = useScopedOperationStore((s) => s.isValidating)
  const scopedId = useScopedOperationStore((s) => s.scopedOperation?.id ?? null)

  // Drop any open wiki document when the scoped operation changes — covers
  // both same-tab switches and cross-tab sync. Lives at the route-guard level
  // (not inside WikiPage) because cross-tab sync sets `isValidating: true`,
  // which unmounts the wiki page during validation; a per-page ref-based
  // comparison would be reset on remount and miss the change.
  //
  // Public-mode caveat: Public wiki docs are scope-independent, so a scope
  // change while viewing Public must not drop the URL. The wiki page handles
  // the inverse (URL doc belongs to a different operation than the current
  // mode) via its own URL→mode sync effect.
  const wikiTreeMode = useWikiTreeModeStore((s) => s.mode)
  const navigate = useNavigate()
  const location = useLocation()
  const prevScopedIdRef = useRef<string | null>(scopedId)
  useEffect(() => {
    const prev = prevScopedIdRef.current
    prevScopedIdRef.current = scopedId
    // Initial hydrate (null → X) keeps the existing URL.
    if (prev === null || prev === scopedId) return
    // Public mode is scope-independent — nothing in the URL to invalidate.
    if (wikiTreeMode === "public") return
    if (location.pathname.startsWith("/wiki/")) {
      navigate("/wiki", { replace: true })
    }
  }, [scopedId, wikiTreeMode, location.pathname, navigate])

  // Still validating the session via /login/me on page reload
  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  // Backend unreachable — stay on the page instead of redirecting to login.
  // The global ConnectivityBanner will appear after the debounce window.
  // When the backend recovers, App.tsx retries checkAuth automatically.
  if (!isAuthenticated && !reachable) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/" replace />
  }

  // Block rendering until hydration has run and validation completes.
  // Prevents flash redirects on scoped pages (e.g. /wiki/:documentId)
  // before localStorage has been checked.
  if (!hydrated || isValidating) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return <Outlet />
}
