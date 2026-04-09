import { useAuthStore } from "@/stores/auth"
import { useConnectivityStore } from "@/stores/connectivity"

// ─────────────────────────────────────────────────────────────────────────────
// CSRF rotation contract (keep backend and frontend in sync!)
//
// The backend rotates the `csrf_token` cookie on every response that sets or
// refreshes auth cookies — i.e. `/login`, `/enroll`, and `/login/refresh`.
// See core/pkg/controller/auth_controller.go (GenerateCSRFToken +
// cookies.SetCSRFCookie in the login / enroll / refresh handlers).
//
// Rules this file must obey because of that contract:
//
//   1. `applyCsrfHeader()` always re-reads `csrf_token` from `document.cookie`
//      at call time. Never cache the value across requests.
//   2. Any code path that retries a request after a successful refresh MUST
//      call `applyCsrfHeader()` again before the retry (see apiFetch below).
//      The old token is no longer valid — the retry will 403 if stale.
//   3. New reconnect paths (SSE, WebSocket, background retry) must follow
//      the same pattern. If you add one, re-read CSRF on every (re)attempt.
//
// If backend changes: if `/login/refresh` ever stops rotating the cookie, or
// if a new auth endpoint sets new auth cookies, update this comment and audit
// every retry site here. The double-submit check depends on this invariant.
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = import.meta.env.VITE_API_URL

// Default request timeout for apiFetch. Aborts the request (and any post-
// refresh retry gets its own fresh window). Subscriptions (SSE) do NOT go
// through apiFetch and are unaffected.
const DEFAULT_TIMEOUT_MS = 30_000

// Refresh has a tighter timeout — a hung refresh blocks every 401-retry path
// in the app, so we want it to fail fast and fall through to transient-error
// handling rather than leaving the UI stuck.
const REFRESH_TIMEOUT_MS = 10_000

// Compose a caller-supplied AbortSignal with a timeout signal. If the runtime
// does not expose AbortSignal.any (older Safari / Firefox), fall back to the
// timeout signal alone — the caller's explicit aborts just won't propagate,
// which degrades gracefully (no hang, slightly worse cancellation UX).
function withTimeout(
  callerSignal: AbortSignal | null | undefined,
  timeoutMs: number,
): AbortSignal | undefined {
  if (timeoutMs <= 0) return callerSignal ?? undefined
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  if (!callerSignal) return timeoutSignal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const any = (AbortSignal as any).any as
    | ((signals: AbortSignal[]) => AbortSignal)
    | undefined
  return any ? any([callerSignal, timeoutSignal]) : timeoutSignal
}

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

// Refresh coordination — single-tab only.
//
// Two in-memory primitives:
//   1. `refreshPromise` — concurrent 401s in the same tab share one
//      in-flight /login/refresh call.
//   2. `lastRefreshAt` + REFRESH_GRACE_MS — a burst of 401s that arrive
//      immediately after a successful refresh skip the network entirely.
//
// Multi-tab scenario is intentionally NOT handled here. Two tabs hitting
// 401 at the same moment will each call /login/refresh; the loser of the
// backend rotation race is replayed out and logged out. Users working in
// one tab at a time are unaffected. A proper multi-tab solution will be
// designed as a separate feature.
let refreshPromise: Promise<boolean> | null = null
let lastRefreshAt = 0
const REFRESH_GRACE_MS = 3_000

async function refreshSession(): Promise<boolean> {
  try {
    const headers = new Headers()
    applyCsrfHeader(headers, "POST")
    const res = await fetch(`${API_URL}/login/refresh`, {
      method: "POST",
      headers,
      credentials: "include",
      signal: withTimeout(null, REFRESH_TIMEOUT_MS),
    })

    if (res.ok) {
      const session = await res.json()
      useAuthStore.getState().setSession(session)
      lastRefreshAt = Date.now()
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
 * Attempt a cookie-based token refresh. Concurrent callers in the same tab
 * share a single in-flight request. Used by apiFetch (on 401) and SSE
 * reconnect.
 *
 * Dedup layers (single-tab only):
 *   1. In-flight promise — concurrent callers share it.
 *   2. Grace window — a burst of 401s within REFRESH_GRACE_MS of a
 *      successful refresh short-circuits to success without a network call.
 */
export function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise
  if (lastRefreshAt > 0 && Date.now() - lastRefreshAt < REFRESH_GRACE_MS) {
    return Promise.resolve(true)
  }
  refreshPromise = refreshSession().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

export interface ApiFetchOptions extends RequestInit {
  /**
   * Override the default request timeout (ms). Set to 0 to disable the
   * timeout entirely (e.g. intentionally long-running uploads). Each attempt
   * — including the post-refresh retry — gets its own fresh timeout window.
   */
  timeoutMs?: number
}

export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {},
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: callerSignal, ...rest } = options
  const headers = new Headers(rest.headers)
  if (!headers.has("Content-Type") && rest.body) {
    headers.set("Content-Type", "application/json")
  }
  applyCsrfHeader(headers, rest.method)

  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers,
      credentials: "include",
      signal: withTimeout(callerSignal, timeoutMs),
    })
  } catch (err) {
    // Network error, offline, or timeout (AbortError/TimeoutError from the
    // timeout signal). All transient from the UI's perspective — mark the
    // backend unreachable and propagate. Callers relying on React Query get
    // automatic retry / error state; direct callers see the raw error.
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
  // Fresh timeout signal for the retry — if the first attempt timed out on
  // a slow backend, the retry should get its own full window, not the
  // already-expired one.
  applyCsrfHeader(headers, rest.method)
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers,
      credentials: "include",
      signal: withTimeout(callerSignal, timeoutMs),
    })
  } catch (err) {
    useConnectivityStore.getState().markUnreachable()
    throw err
  }
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
