import { create } from "zustand"
import type { SessionResponse } from "@/services/auth"
import { authService } from "@/services/auth"

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
  logout: () => void
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
  },

  logout: () => {
    // Fire-and-forget backend logout (clears cookies + revokes refresh tokens)
    fetch(`${API_URL}/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {})
    set({ user: null, isAuthenticated: false, isLoading: false })
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
    return user?.permissions.includes(permission) ?? false
  },
}))
