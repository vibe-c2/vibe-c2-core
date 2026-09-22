import { create } from "zustand"

import { useAuthStore } from "@/stores/auth"
import { FIRST_STEP, reduce, type TourEvent, type TourStepID } from "@/components/onboarding/tour-steps"

/**
 * The first-login walkthrough's position, and whether it is running at all.
 *
 * Deliberately thin: whether the operator has *finished* the tour lives on
 * their account (`me.onboardingCompletedAt`), because a browser-local flag
 * would replay the guide on every new browser and private window, and
 * operators share workstations. What is here is only "is it on screen right
 * now", which is per-tab by nature.
 *
 * The one thing kept in storage is a same-session suppression: a tour the
 * operator skipped must not reappear when they navigate, in the window before
 * the server round trip lands. Mirrors the per-user key scheme in
 * stores/scoped-operation.ts.
 */
interface OnboardingState {
  /** The step on screen, or null when the tour is not running. */
  step: TourStepID | null
  /** True once this tab has offered the tour, so it is offered at most once
   *  per session however many times the panel re-renders. */
  offered: boolean
  /** Begin at the first step. */
  start: () => void
  /** Feed an event to the step machine. Finishing calls `onFinish`. */
  send: (event: TourEvent) => void
  /** Abandon the tour. Counts as finished — an operator who skipped it has
   *  made their decision, and re-offering would be nagging. */
  skip: () => void
  markOffered: () => void
  /** Whether this user dismissed the tour earlier in this browser, used only
   *  to bridge the gap before `me` reflects it. */
  dismissedLocally: (userId: string) => boolean
  reset: () => void
}

function dismissKey(userId: string) {
  return `onboarding_dismissed_${userId}`
}

function rememberDismissed() {
  const userId = useAuthStore.getState().user?.userId
  if (!userId) return
  try {
    localStorage.setItem(dismissKey(userId), "1")
  } catch {
    // Best-effort: the server flag is the real record, this only covers the
    // seconds before it lands.
  }
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  step: null,
  offered: false,

  start: () => set({ step: FIRST_STEP, offered: true }),

  send: (event) => {
    const current = get().step
    if (!current) return
    const next = reduce(current, event)
    if (next === current) return
    if (next === null) {
      rememberDismissed()
      set({ step: null })
      return
    }
    set({ step: next })
  },

  skip: () => {
    if (!get().step) return
    rememberDismissed()
    set({ step: null })
  },

  markOffered: () => set({ offered: true }),

  dismissedLocally: (userId) => {
    try {
      return localStorage.getItem(dismissKey(userId)) === "1"
    } catch {
      return false
    }
  },

  reset: () => set({ step: null, offered: false }),
}))

// Same lifecycle as the other per-user stores: drop in-memory state on logout
// and leave storage alone, since the keys are per-user and a re-login should
// not be greeted by a tour the operator already dismissed.
useAuthStore.subscribe((state, prevState) => {
  if (prevState.isAuthenticated && !state.isAuthenticated) {
    useOnboardingStore.getState().reset()
  }
})
