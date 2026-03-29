import { useAuthStore } from "@/stores/auth"

const API_URL = import.meta.env.VITE_API_URL

// Refresh coordination — ensures only one refresh call happens at a time.
// Without this, concurrent 401s would each trigger a refresh, and the
// second would hit an already-rotated token, triggering replay detection
// which nukes all sessions.
let refreshPromise: Promise<boolean> | null = null

async function refreshSession(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/login/refresh`, {
      method: "POST",
      credentials: "include",
    })

    if (!res.ok) {
      useAuthStore.getState().clearSession()
      return false
    }

    const session = await res.json()
    useAuthStore.getState().setSession(session)
    return true
  } catch {
    return false
  }
}

/**
 * Attempt a cookie-based token refresh, coordinated so concurrent callers
 * share a single request. Used by apiFetch (on 401) and SSE reconnect.
 */
export function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  refreshPromise = refreshSession().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(options.headers)
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json")
  }

  let res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  })

  if (res.status !== 401) {
    return res
  }

  // 401 — attempt coordinated cookie-based refresh, then retry once.
  const refreshed = await tryRefresh()
  if (!refreshed) return res

  // Retry the original request (browser sends the new cookie automatically).
  res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  })
  return res
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
