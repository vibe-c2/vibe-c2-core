import { useEffect, useRef } from "react"
import { BrowserRouter, Route, Routes } from "react-router"
import { QueryProvider } from "@/providers/query-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { ProtectedRoute } from "@/components/protected-route"
import { ConnectivityBanner } from "@/components/connectivity-banner"
import { AppLayout } from "@/components/layout/app-layout"
import { LoginPage } from "@/pages/login"
import { EnrollPage } from "@/pages/enroll"
import { DashboardPage } from "@/pages/dashboard"
import { OperationsPage } from "@/pages/operations"
import { UsersPage } from "@/pages/users"
import { WikiPage } from "@/pages/wiki"
import { FindingsPage } from "@/pages/findings"
import { useAuthStore } from "@/stores/auth"
import { useConnectivityStore } from "@/stores/connectivity"

function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth)
  const reachable = useConnectivityStore((s) => s.reachable)
  const wasUnreachable = useRef(false)

  // Validate stored token on app load (handles page refresh)
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Retry auth check when backend recovers from an outage.
  // Only fires on false→true transition of reachable (skips initial mount).
  useEffect(() => {
    if (!reachable) {
      wasUnreachable.current = true
    } else if (wasUnreachable.current) {
      wasUnreachable.current = false
      checkAuth()
    }
  }, [reachable, checkAuth])

  return (
    <QueryProvider>
      <ThemeProvider>
        <Toaster />
        <ConnectivityBanner />
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/enroll" element={<EnrollPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="operations" element={<OperationsPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="wiki" element={<WikiPage />} />
              <Route path="wiki/:documentId" element={<WikiPage />} />
              <Route path="findings" element={<FindingsPage />} />
            </Route>
          </Route>
        </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryProvider>
  )
}

export default App
