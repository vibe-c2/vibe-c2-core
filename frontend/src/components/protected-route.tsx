import { useEffect, useState } from "react"
import { Navigate, Outlet } from "react-router"
import { useAuthStore } from "@/stores/auth"
import { useConnectivityStore } from "@/stores/connectivity"
import { useSessionGuard } from "@/hooks/use-session-guard"
import { useScopedOperationGuard } from "@/hooks/use-scoped-operation-guard"
import { useScopedOperationStore } from "@/stores/scoped-operation"

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
  // Track whether hydration has run so we don't render child routes
  // before localStorage has been checked (prevents a flash redirect
  // on pages like /wiki/:documentId that require a scoped operation).
  const hydrate = useScopedOperationStore((s) => s.hydrate)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (userId) {
      hydrate(userId)
      setHydrated(true)
    }
  }, [userId, hydrate])

  // Validate the restored scope and subscribe to real-time changes.
  useScopedOperationGuard()

  const isValidating = useScopedOperationStore((s) => s.isValidating)

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
