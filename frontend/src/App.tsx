import { BrowserRouter, Route, Routes } from "react-router"
import { ThemeProvider } from "@/components/theme-provider"
import { ProtectedRoute } from "@/components/protected-route"
import { AppLayout } from "@/components/layout/app-layout"
import { LoginPage } from "@/pages/login"
import { DashboardPage } from "@/pages/dashboard"
import { OperationsPage } from "@/pages/operations"
import { UsersPage } from "@/pages/users"

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
  )
}

export default App
