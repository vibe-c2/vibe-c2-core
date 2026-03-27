import { useAuthStore } from "@/stores/auth"

const API_URL = import.meta.env.VITE_API_URL

// Refresh coordination — prevents multiple concurrent refresh attempts
let isRefreshing = false
let refreshQueue: Array<{
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
}> = []

function processQueue(error: unknown = null) {
  for (const { resolve, reject } of refreshQueue) {
    if (error) {
      reject(error)
    } else {
      resolve(undefined)
    }
  }
  refreshQueue = []
}

function parseJwtPayload(token: string): Record<string, unknown> {
  const base64 = token.split(".")[1]
  return JSON.parse(atob(base64))
}

async function attemptRefresh(): Promise<boolean> {
  const { token, refreshToken, logout } = useAuthStore.getState()
  if (!token || !refreshToken) {
    logout()
    return false
  }

  try {
    const claims = parseJwtPayload(token)
    const userId = claims.sub as string

    const res = await fetch(`${API_URL}/login/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, refresh_token: refreshToken }),
    })

    if (!res.ok) {
      logout()
      return false
    }

    const data = await res.json()
    useAuthStore.getState().setAuth(data)
    return true
  } catch {
    logout()
    return false
  }
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const { token } = useAuthStore.getState()

  const headers = new Headers(options.headers)
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json")
  }

  let res = await fetch(`${API_URL}${path}`, { ...options, headers })

  if (res.status !== 401 || !token) {
    return res
  }

  // 401 — attempt token refresh
  if (isRefreshing) {
    // Wait for the in-flight refresh to finish, then retry
    await new Promise((resolve, reject) => {
      refreshQueue.push({ resolve, reject })
    })
    // Retry with the new token
    const newHeaders = new Headers(options.headers)
    const { token: newToken } = useAuthStore.getState()
    if (newToken) {
      newHeaders.set("Authorization", `Bearer ${newToken}`)
    }
    if (!newHeaders.has("Content-Type") && options.body) {
      newHeaders.set("Content-Type", "application/json")
    }
    return fetch(`${API_URL}${path}`, { ...options, headers: newHeaders })
  }

  isRefreshing = true
  try {
    const success = await attemptRefresh()
    if (!success) {
      processQueue(new Error("refresh failed"))
      return res
    }
    processQueue()

    // Retry original request with new token
    const retryHeaders = new Headers(options.headers)
    const { token: freshToken } = useAuthStore.getState()
    if (freshToken) {
      retryHeaders.set("Authorization", `Bearer ${freshToken}`)
    }
    if (!retryHeaders.has("Content-Type") && options.body) {
      retryHeaders.set("Content-Type", "application/json")
    }
    res = await fetch(`${API_URL}${path}`, { ...options, headers: retryHeaders })
    return res
  } finally {
    isRefreshing = false
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiFetch(path)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? "Request failed")
  }
  return res.json()
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "POST",
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError(res.status, data.error ?? "Request failed")
  }
  return res.json()
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}
