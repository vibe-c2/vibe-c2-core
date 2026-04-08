import { create } from "zustand"

// Connectivity coordinator.
//
// Tracks whether the backend is reachable and debounces the user-visible
// banner. Also owns a shared health-check poll so that N subscribers don't
// each probe the backend independently during an outage.
//
// Three concepts:
//   - reachable:   the current best-known state. Flipped by request outcomes
//                  and by the health poll. Subscribers gate their reconnects
//                  on this via waitUntilReachable().
//   - showBanner:  the debounced UI flag. Only becomes true after reachable
//                  has been false for BANNER_SHOW_DELAY_MS uninterrupted.
//                  Becomes false immediately on any success. This eliminates
//                  the flicker you get when 5 subscriptions reconnect out
//                  of phase.
//   - health poll: started the first time markUnreachable() is called. Pings
//                  /status until it gets a 2xx, then flips reachable=true
//                  and notifies any waiting reconnect attempts. Replaces
//                  the per-subscription retry storm with one shared probe.

const API_URL = import.meta.env.VITE_API_URL

const BANNER_SHOW_DELAY_MS = 800
const HEALTH_POLL_MIN_INTERVAL_MS = 1_000
const HEALTH_POLL_MAX_INTERVAL_MS = 5_000
const HEALTH_POLL_GROWTH = 1.5

interface ConnectivityState {
  reachable: boolean
  showBanner: boolean
  markReachable: () => void
  markUnreachable: () => void
  /** Resolves immediately if reachable, otherwise when reachability flips. */
  waitUntilReachable: () => Promise<void>
}

let bannerShowTimer: ReturnType<typeof setTimeout> | null = null
let pollTimer: ReturnType<typeof setTimeout> | null = null
let pollInterval = HEALTH_POLL_MIN_INTERVAL_MS
let waiters: Array<() => void> = []

function clearBannerTimer() {
  if (bannerShowTimer) {
    clearTimeout(bannerShowTimer)
    bannerShowTimer = null
  }
}

function stopHealthPoll() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
  pollInterval = HEALTH_POLL_MIN_INTERVAL_MS
}

function notifyWaiters() {
  const w = waiters
  waiters = []
  for (const resolve of w) resolve()
}

async function runHealthPoll() {
  pollTimer = null
  try {
    const res = await fetch(`${API_URL}/status`, { method: "GET" })
    if (res.ok) {
      // markReachable will stop the poll and notify waiters.
      useConnectivityStore.getState().markReachable()
      return
    }
  } catch {
    // fall through to reschedule
  }
  pollInterval = Math.min(pollInterval * HEALTH_POLL_GROWTH, HEALTH_POLL_MAX_INTERVAL_MS)
  pollTimer = setTimeout(runHealthPoll, pollInterval)
}

function startHealthPoll() {
  if (pollTimer) return
  pollInterval = HEALTH_POLL_MIN_INTERVAL_MS
  pollTimer = setTimeout(runHealthPoll, pollInterval)
}

export const useConnectivityStore = create<ConnectivityState>((set, get) => ({
  reachable: true,
  showBanner: false,

  markReachable: () => {
    clearBannerTimer()
    stopHealthPoll()
    const prev = get()
    if (!prev.reachable || prev.showBanner) {
      set({ reachable: true, showBanner: false })
    }
    notifyWaiters()
  },

  markUnreachable: () => {
    if (get().reachable) {
      set({ reachable: false })
    }
    // Debounce the banner: only show after a sustained unreachable window.
    if (!bannerShowTimer && !get().showBanner) {
      bannerShowTimer = setTimeout(() => {
        bannerShowTimer = null
        if (!useConnectivityStore.getState().reachable) {
          useConnectivityStore.setState({ showBanner: true })
        }
      }, BANNER_SHOW_DELAY_MS)
    }
    // Start (or continue) the shared health-check poll.
    startHealthPoll()
  },

  waitUntilReachable: () => {
    if (get().reachable) return Promise.resolve()
    return new Promise<void>((resolve) => {
      waiters.push(resolve)
    })
  },
}))
