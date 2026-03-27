const API_URL = import.meta.env.VITE_API_URL

// Response types — match backend responses.AuthResponse / responses.StatusResponse
export interface AuthResponse {
  auth_token: string
  refresh_token: string
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
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? "Request failed")
  }

  return res.json()
}

export const authService = {
  login(username: string, password: string): Promise<AuthResponse> {
    return authFetch("/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    })
  },

  enroll(username: string, password: string): Promise<AuthResponse> {
    return authFetch("/enroll", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    })
  },

  getStatus(): Promise<StatusResponse> {
    return authFetch("/status")
  },

  getMe(token: string): Promise<AuthResponse> {
    return authFetch("/login/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
  },
}
