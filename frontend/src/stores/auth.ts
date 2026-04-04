import { create } from "zustand"
import type { SessionResponse } from "@/services/auth"
import { authService } from "@/services/auth"
import { useScopedOperationStore } from "@/stores/scoped-operation"

interface User {
  userId: string
  username: string
  roles: string[]
  permissions: string[]
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  setSession: (response: SessionResponse) => void
  clearSession: () => void
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  hasPermission: (permission: string) => boolean
}

const API_URL = import.meta.env.VITE_API_URL

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setSession: (response) => {
    const user: User = {
      userId: response.user_id,
      username: response.username,
      roles: response.roles,
      permissions: response.permissions,
    }
    set({ user, isAuthenticated: true, isLoading: false })
  },

  clearSession: () => {
    set({ user: null, isAuthenticated: false, isLoading: false })
    // Clear in-memory scope state (localStorage preserved so scope restores on re-login).
    useScopedOperationStore.getState().reset()
  },

  logout: async () => {
    // Clear local state immediately so the UI redirects to login.
    set({ user: null, isAuthenticated: false, isLoading: false })
    // Then attempt backend session revocation.
    try {
      await fetch(`${API_URL}/logout`, {
        method: "POST",
        credentials: "include",
      })
    } catch {
      // Backend logout failed — session may remain active until token expires.
      // This is acceptable: cookies are cleared by the response, and if the
      // request never reached the server, the token expires via TTL.
      console.warn("Backend logout failed — session may persist until token expiry")
    }
  },

  checkAuth: async () => {
    try {
      const response = await authService.getMe()
      get().setSession(response)
    } catch (err) {
      // Network failure (server down, offline) — don't clear session,
      // just stop loading. User keeps stale session until next request.
      if (err instanceof TypeError) {
        set({ isLoading: false })
        return
      }
      // HTTP error (401, etc.) — not authenticated.
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },

  hasPermission: (permission) => {
    const user = get().user
    if (!user) return false
    // The "admin" permission acts as a wildcard — grants all permissions,
    // matching the backend behavior in permissions.HasPermission().
    return user.permissions.includes("admin") || user.permissions.includes(permission)
  },
}))
