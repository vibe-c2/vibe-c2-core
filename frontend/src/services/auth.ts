import { apiGet } from "@/services/api-client"

const API_URL = import.meta.env.VITE_API_URL

// Response types — match backend responses.SessionResponse / responses.StatusResponse.
// Tokens are httpOnly cookies managed by the browser, never in the response body.
export interface SessionResponse {
  user_id: string
  roles: string[]
  username: string
  permissions: string[]
}

// Mirrors responses.OIDCStatus. login_url is relative to the API base.
export interface OIDCStatus {
  enabled: boolean
  display_name?: string
  login_url?: string
  unavailable_reason?: string
}

export interface StatusResponse {
  enrolled: boolean
  local_login_enabled: boolean
  oidc: OIDCStatus
}

async function authFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body) {
    headers.set("Content-Type", "application/json")
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? "Request failed")
  }

  return res.json()
}

export const authService = {
  login(username: string, password: string): Promise<SessionResponse> {
    return authFetch("/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    })
  },

  enroll(username: string, password: string): Promise<SessionResponse> {
    return authFetch("/enroll", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    })
  },

  getStatus(): Promise<StatusResponse> {
    return authFetch("/status")
  },

  getMe(): Promise<SessionResponse> {
    // Route through apiGet (not authFetch) so that a bootstrap /login/me
    // hitting an expired access token transparently triggers a refresh and
    // retries, instead of logging the user out on reload.
    return apiGet<SessionResponse>("/login/me")
  },

  // Absolute URL that starts the single sign-on flow. The backend seals a
  // handshake cookie and redirects to the provider; after the callback the
  // browser lands back on the SPA with the auth cookies already set. This
  // is a full-page navigation, not a fetch — the redirect chain crosses
  // origins and must carry cookies.
  oidcLoginUrl(status: OIDCStatus, returnTo: string): string {
    const base = `${API_URL}${status.login_url ?? "/auth/oidc/login"}`
    return `${base}?return_to=${encodeURIComponent(returnTo)}`
  },
}
