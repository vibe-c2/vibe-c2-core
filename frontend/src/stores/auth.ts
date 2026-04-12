import { create } from "zustand"
import type { SessionResponse } from "@/services/auth"
import { authService } from "@/services/auth"
import { apiFetch } from "@/services/api-client"

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

  logout: async () => {
    // Clear local state immediately so the UI redirects to login.
    set({ user: null, isAuthenticated: false, isLoading: false })
    // Then attempt backend session revocation. Must go through apiFetch so the
    // X-CSRF-Token header is attached — /logout sits behind the CSRF middleware
    // and a raw fetch() would be rejected with 403, leaving the server-side
    // session (and its cookies) intact while the UI thinks logout succeeded.
    try {
      const res = await apiFetch("/logout", { method: "POST" })
      if (!res.ok) {
        console.warn(
          `Backend logout failed (${res.status}) — session may persist until token expiry`,
        )
      }
    } catch {
      // Network error (backend unreachable, offline, timeout). Cookies are
      // not cleared server-side, but the session will expire via TTL and the
      // local UI is already in a logged-out state.
      console.warn("Backend logout failed — session may persist until token expiry")
    }
  },

  checkAuth: async () => {
    set({ isLoading: true })
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
    // NOTE: This is a client-side check only, used to gate UI elements
    // (hide menu items, disable buttons, etc.) for UX purposes. It reads
    // from the Zustand store, which a user can tamper with via devtools.
    // The server is the source of truth — every API/GraphQL call is
    // re-authorized on the backend. Risk is low (UX bypass only, no data
    // access), and we accept it.
    //
    // The "admin" permission acts as a wildcard — grants all permissions,
    // matching the backend behavior in permissions.HasPermission().
    return user.permissions.includes("admin") || user.permissions.includes(permission)
  },
}))
