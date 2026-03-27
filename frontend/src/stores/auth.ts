import { create } from "zustand"
import type { AuthResponse } from "@/services/auth"
import { authService } from "@/services/auth"

interface User {
  userId: string
  username: string
  roles: string[]
  permissions: string[]
}

interface AuthState {
  token: string | null
  refreshToken: string | null
  user: User | null
  isLoading: boolean
  setAuth: (response: AuthResponse) => void
  logout: () => void
  checkAuth: () => Promise<void>
  hasPermission: (permission: string) => boolean
}

function parseUserId(token: string): string {
  const payload = JSON.parse(atob(token.split(".")[1]))
  return payload.sub as string
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem("token"),
  refreshToken: localStorage.getItem("refresh_token"),
  user: JSON.parse(localStorage.getItem("user") ?? "null"),
  isLoading: !!localStorage.getItem("token"),

  setAuth: (response) => {
    const userId = parseUserId(response.auth_token)
    const user: User = {
      userId,
      username: response.username,
      roles: response.roles,
      permissions: response.permissions,
    }
    localStorage.setItem("token", response.auth_token)
    localStorage.setItem("refresh_token", response.refresh_token)
    localStorage.setItem("user", JSON.stringify(user))
    set({
      token: response.auth_token,
      refreshToken: response.refresh_token,
      user,
      isLoading: false,
    })
  },

  logout: () => {
    // Fire-and-forget backend logout
    const token = get().token
    if (token) {
      const apiUrl = import.meta.env.VITE_API_URL
      fetch(`${apiUrl}/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {})
    }
    localStorage.removeItem("token")
    localStorage.removeItem("refresh_token")
    localStorage.removeItem("user")
    set({ token: null, refreshToken: null, user: null, isLoading: false })
  },

  checkAuth: async () => {
    const token = get().token
    if (!token) {
      set({ isLoading: false })
      return
    }
    try {
      const response = await authService.getMe(token)
      get().setAuth(response)
    } catch {
      // Token invalid or expired — clear auth state
      localStorage.removeItem("token")
      localStorage.removeItem("refresh_token")
      localStorage.removeItem("user")
      set({ token: null, refreshToken: null, user: null, isLoading: false })
    }
  },

  hasPermission: (permission) => {
    const user = get().user
    return user?.permissions.includes(permission) ?? false
  },
}))
