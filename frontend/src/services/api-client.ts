import { useAuthStore } from "@/stores/auth"
import { useConnectivityStore } from "@/stores/connectivity"

const API_URL = import.meta.env.VITE_API_URL

// Read the (non-httpOnly) csrf_token cookie set by the backend on login /
// refresh. Returned as-is — the caller echoes it back in the X-CSRF-Token
// header on state-changing requests for the double-submit CSRF check.
function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : null
}

// applyCsrfHeader sets X-CSRF-Token on a Headers object for unsafe methods.
// Safe methods (GET / HEAD / OPTIONS) skip the check on the backend, so
// we don't bother setting the header for them.
function applyCsrfHeader(headers: Headers, method: string | undefined): void {
  const m = (method ?? "GET").toUpperCase()
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return
  const token = getCsrfToken()
  if (token) headers.set("X-CSRF-Token", token)
}

// Refresh coordination — ensures only one refresh call happens at a time,
// both within a single tab AND across tabs of the same origin. Without
// cross-tab coordination, two tabs of the same user would each rotate the
// refresh token concurrently; whichever loses the race trips the backend's
// replay detection (the rotated-out token is no longer in Redis) and the
// session is terminated.
//
// Three layers of dedup:
//   1. In-memory `refreshPromise` — shares an in-flight call within this tab.
//   2. In-memory `lastRefreshAt` grace window — collapses a burst of 401s
//      that arrive within REFRESH_GRACE_MS of a successful refresh.
//   3. Cross-tab `navigator.locks` + a localStorage stamp/session payload —
//      a tab acquiring the lock can see that a peer tab just refreshed and
//      adopt its result without making any network call.
let refreshPromise: Promise<boolean> | null = null
let lastRefreshAt = 0
const REFRESH_GRACE_MS = 3_000

const SHARED_STAMP_KEY = "vibec2.auth.lastRefreshAt"
const SHARED_SESSION_KEY = "vibec2.auth.session"
const REFRESH_LOCK_NAME = "vibec2-auth-refresh"

function readSharedStamp(): number {
  try {
    return Number(localStorage.getItem(SHARED_STAMP_KEY) ?? 0) || 0
  } catch {
    return 0
  }
}

function readSharedSession(): unknown {
  try {
    const raw = localStorage.getItem(SHARED_SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeSharedRefresh(stamp: number, session: unknown): void {
  try {
    localStorage.setItem(SHARED_STAMP_KEY, String(stamp))
    if (session !== null && session !== undefined) {
      localStorage.setItem(SHARED_SESSION_KEY, JSON.stringify(session))
    }
  } catch {
    // Storage may be disabled (private mode, quota). Cross-tab coordination
    // degrades gracefully — we still have the in-memory dedup and Web Lock.
  }
}

function adoptPeerRefresh(stamp: number): boolean {
  lastRefreshAt = stamp
  const peerSession = readSharedSession()
  if (peerSession) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useAuthStore.getState().setSession(peerSession as any)
  }
  return true
}

async function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(
      REFRESH_LOCK_NAME,
      { mode: "exclusive" },
      fn,
    )
  }
  // Web Locks unavailable — fall back to plain execution. The in-memory
  // dedup still prevents within-tab races; cross-tab races may slip through.
  return fn()
}

// React to peers updating shared auth state (cross-tab session sync).
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === SHARED_STAMP_KEY && e.newValue) {
      const stamp = Number(e.newValue) || 0
      if (stamp > lastRefreshAt) lastRefreshAt = stamp
    } else if (e.key === SHARED_SESSION_KEY && e.newValue) {
      try {
        const session = JSON.parse(e.newValue)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        useAuthStore.getState().setSession(session as any)
      } catch {
        // ignore malformed payload
      }
    }
  })
}

async function refreshSession(): Promise<boolean> {
  try {
    const headers = new Headers()
    applyCsrfHeader(headers, "POST")
    const res = await fetch(`${API_URL}/login/refresh`, {
      method: "POST",
      headers,
      credentials: "include",
    })

    if (res.ok) {
      const session = await res.json()
      useAuthStore.getState().setSession(session)
      lastRefreshAt = Date.now()
      // Publish to peer tabs so they can adopt this result instead of
      // racing the backend with an already-rotated token.
      writeSharedRefresh(lastRefreshAt, session)
      useConnectivityStore.getState().markReachable()
      return true
    }

    // Classify the failure. Only an explicit auth failure means the refresh
    // token is genuinely no good — anything else (backend down, nginx 502,
    // upstream timeout) is transient and must NOT log the user out, otherwise
    // a backend restart causes a mass deauth.
    if (res.status === 401 || res.status === 403) {
      useAuthStore.getState().clearSession()
      return false
    }

    // 5xx / unexpected status — treat as transient.
    useConnectivityStore.getState().markUnreachable()
    return false
  } catch {
    // Network error (backend unreachable, DNS, offline). Transient.
    useConnectivityStore.getState().markUnreachable()
    return false
  }
}

/**
 * Attempt a cookie-based token refresh, coordinated so concurrent callers
 * share a single request. Used by apiFetch (on 401) and SSE reconnect.
 *
 * Coordination layers (cheapest first):
 *   1. In-flight in-tab promise — concurrent callers share it.
 *   2. In-tab grace window — burst of 401s after a recent refresh skip.
 *   3. Cross-tab grace window via localStorage — peer tab refreshed recently.
 *   4. Web Lock — exclusive cross-tab section that re-checks (3) and only
 *      then talks to the network.
 */
export function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  if (lastRefreshAt > 0 && Date.now() - lastRefreshAt < REFRESH_GRACE_MS) {
    return Promise.resolve(true)
  }
  // Cheap pre-check before acquiring the cross-tab lock — if a peer tab
  // wrote a stamp in the last grace window, just adopt their session.
  const peerStamp = readSharedStamp()
  if (peerStamp > 0 && Date.now() - peerStamp < REFRESH_GRACE_MS) {
    return Promise.resolve(adoptPeerRefresh(peerStamp))
  }
  refreshPromise = withRefreshLock(async () => {
    // Re-check after acquiring the lock — another tab may have refreshed
    // while we were queued behind it.
    const stamp = readSharedStamp()
    if (stamp > 0 && Date.now() - stamp < REFRESH_GRACE_MS) {
      return adoptPeerRefresh(stamp)
    }
    return refreshSession()
  }).finally(() => {
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
  applyCsrfHeader(headers, options.method)

  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      credentials: "include",
    })
  } catch (err) {
    useConnectivityStore.getState().markUnreachable()
    throw err
  }

  // Any successful response from the backend (including 4xx) proves the
  // backend is reachable. 5xx/gateway errors indicate it isn't.
  if (res.status >= 500 && res.status <= 599) {
    useConnectivityStore.getState().markUnreachable()
  } else {
    useConnectivityStore.getState().markReachable()
  }

  if (res.status !== 401) {
    return res
  }

  // 401 — attempt coordinated cookie-based refresh, then retry once.
  const refreshed = await tryRefresh()
  if (!refreshed) return res

  // Retry the original request. The browser sends the new auth cookie
  // automatically; we must re-read csrf_token because it rotated too.
  applyCsrfHeader(headers, options.method)
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
