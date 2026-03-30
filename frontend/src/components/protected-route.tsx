import { Navigate, Outlet } from "react-router"
import { useAuthStore } from "@/stores/auth"
import { useSessionGuard } from "@/hooks/use-session-guard"

export function ProtectedRoute({ permission }: { permission?: string }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const hasPermission = useAuthStore((s) => s.hasPermission)

  // Subscribe to session events — if the current session is revoked,
  // clearSession() is called and isAuthenticated becomes false,
  // triggering the redirect to /login below.
  useSessionGuard()

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
