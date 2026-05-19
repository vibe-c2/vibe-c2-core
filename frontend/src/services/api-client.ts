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

// Body types the browser must set Content-Type for itself, because the
// boundary/encoding metadata is only known to the runtime. Overriding it
// here would corrupt the multipart frame or binary stream.
function isFormLikeBody(body: BodyInit | null | undefined): boolean {
  if (!body) return false
  if (typeof FormData !== "undefined" && body instanceof FormData) return true
  if (typeof Blob !== "undefined" && body instanceof Blob) return true
  if (
    typeof URLSearchParams !== "undefined" &&
    body instanceof URLSearchParams
  ) {
    return true
  }
  return false
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

// ─────────────────────────────────────────────────────────────────────────────
// Refresh coordination — multi-tab safe.
//
// Three dedup layers, from innermost to outermost:
//
//   1. In-flight promise (`refreshPromise`) — concurrent 401s in the same
//      tab share one in-flight /login/refresh call.
//
//   2. Grace window (`lastRefreshAt` + REFRESH_GRACE_MS) — a burst of 401s
//      that arrive immediately after a successful refresh skip the network
//      entirely. Updated both locally and cross-tab via BroadcastChannel.
//
//   3. Web Locks API (`navigator.locks`) — ensures only one tab across the
//      origin performs the actual /login/refresh call. Other tabs queue on
//      the lock, then re-check the grace window before calling.
//
// If Web Locks or BroadcastChannel are unavailable (old browser, SSR), the
// code falls back gracefully: each tab calls /login/refresh independently.
// The backend grace period (refresh_grace:<uid>:<old_hash> shadow key in
// Redis, default 10s TTL) catches the multi-tab race server-side, returning
// the same new token to the loser so all tabs converge.
// ─────────────────────────────────────────────────────────────────────────────

let refreshPromise: Promise<boolean> | null = null
let lastRefreshAt = 0
const REFRESH_GRACE_MS = 3_000

// --- Cross-tab coordination via Web Locks + BroadcastChannel ---

const REFRESH_LOCK = "vibe-c2:auth-refresh"
const REFRESH_CHANNEL = "vibe-c2:auth-refresh"

let refreshChannel: BroadcastChannel | null = null

function getRefreshChannel(): BroadcastChannel | null {
  if (refreshChannel) return refreshChannel
  if (typeof BroadcastChannel === "undefined") return null
  refreshChannel = new BroadcastChannel(REFRESH_CHANNEL)
  return refreshChannel
}

// Listen for cross-tab refresh completions. When another tab succeeds,
// update our local grace timestamp so any pending tryRefresh() calls
// short-circuit without a network call.
;(function initCrossTabListener() {
  const ch = getRefreshChannel()
  if (!ch) return
  ch.addEventListener("message", (ev: MessageEvent) => {
    if (ev.data?.type === "refresh-ok" && typeof ev.data.ts === "number") {
      lastRefreshAt = ev.data.ts
    }
  })
})()

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
 * Acquire a cross-tab exclusive lock, then refresh. Other tabs queue on
 * the lock and re-check the grace window before calling /login/refresh.
 * Falls back to a direct refreshSession() if the lock times out or the
 * holding tab crashes — the backend grace period handles duplicates.
 */
async function lockedRefresh(): Promise<boolean> {
  try {
    return await navigator.locks.request(
      REFRESH_LOCK,
      { mode: "exclusive", signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS) },
      async (lock) => {
        if (!lock) return false
        // Another tab may have completed while we were queued.
        if (lastRefreshAt > 0 && Date.now() - lastRefreshAt < REFRESH_GRACE_MS) {
          return true
        }
        const ok = await refreshSession()
        if (ok) {
          getRefreshChannel()?.postMessage({ type: "refresh-ok", ts: Date.now() })
        }
        return ok
      },
    )
  } catch {
    // Lock timeout or AbortError (holder tab crashed / timed out).
    // Fall back to direct call — backend grace period handles duplicates.
    return refreshSession()
  }
}

/**
 * Attempt a cookie-based token refresh. Multi-tab safe via three dedup
 * layers: in-flight promise (same-tab), grace window (cross-tab via
 * BroadcastChannel), and Web Locks (cross-tab mutual exclusion).
 *
 * Used by apiFetch (on 401) and graphql-ws reconnect (on close).
 */
export function tryRefresh(): Promise<boolean> {
  // Layer 1: same-tab in-flight dedup.
  if (refreshPromise) return refreshPromise
  // Layer 2: grace window (updated both locally and by BroadcastChannel).
  if (lastRefreshAt > 0 && Date.now() - lastRefreshAt < REFRESH_GRACE_MS) {
    return Promise.resolve(true)
  }
  // Layer 3: cross-tab lock (graceful fallback if unavailable).
  refreshPromise = (
    typeof navigator !== "undefined" && navigator.locks
      ? lockedRefresh()
      : refreshSession()
  ).finally(() => {
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
  if (!headers.has("Content-Type") && rest.body && !isFormLikeBody(rest.body)) {
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
