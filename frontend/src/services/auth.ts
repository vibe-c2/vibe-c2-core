const API_URL = import.meta.env.VITE_API_URL

// Response types — match backend responses.SessionResponse / responses.StatusResponse.
// Tokens are httpOnly cookies managed by the browser, never in the response body.
export interface SessionResponse {
  user_id: string
  roles: string[]
  username: string
  permissions: string[]
}

export interface StatusResponse {
  enrolled: boolean
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
    return authFetch("/login/me")
  },
}
