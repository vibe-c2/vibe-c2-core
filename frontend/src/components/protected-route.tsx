import { useEffect } from "react"
import { Navigate, Outlet } from "react-router"
import { useAuthStore } from "@/stores/auth"
import { useSessionGuard } from "@/hooks/use-session-guard"
import { useScopedOperationGuard } from "@/hooks/use-scoped-operation-guard"
import { useScopedOperationStore } from "@/stores/scoped-operation"

export function ProtectedRoute({ permission }: { permission?: string }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const hasPermission = useAuthStore((s) => s.hasPermission)
  const userId = useAuthStore((s) => s.user?.userId)

  // Subscribe to session events — if the current session is revoked,
  // clearSession() is called and isAuthenticated becomes false,
  // triggering the redirect to /login below.
  useSessionGuard()

  // Hydrate the scoped operation from localStorage once the user is known.
  const hydrate = useScopedOperationStore((s) => s.hydrate)
  useEffect(() => {
    if (userId) hydrate(userId)
  }, [userId, hydrate])

  // Validate the restored scope and subscribe to real-time changes.
  useScopedOperationGuard()

  // Still validating the session via /login/me on page reload
  if (isLoading) {
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

  return <Outlet />
}
