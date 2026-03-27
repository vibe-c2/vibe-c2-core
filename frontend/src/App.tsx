import { useEffect } from "react"
import { BrowserRouter, Route, Routes } from "react-router"
import { QueryProvider } from "@/providers/query-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { ProtectedRoute } from "@/components/protected-route"
import { AppLayout } from "@/components/layout/app-layout"
import { LoginPage } from "@/pages/login"
import { EnrollPage } from "@/pages/enroll"
import { DashboardPage } from "@/pages/dashboard"
import { OperationsPage } from "@/pages/operations"
import { UsersPage } from "@/pages/users"
import { useAuthStore } from "@/stores/auth"

function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth)

  // Validate stored token on app load (handles page refresh)
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  return (
    <QueryProvider>
      <ThemeProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/enroll" element={<EnrollPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="operations" element={<OperationsPage />} />
              <Route path="users" element={<UsersPage />} />
            </Route>
          </Route>
        </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryProvider>
  )
}

export default App
