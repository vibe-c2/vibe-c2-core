import { create } from "zustand"

import { useAuthStore } from "@/stores/auth"
import {
  firstStep,
  reduce,
  type GuideID,
  type TourEvent,
  type TourStepID,
} from "@/components/onboarding/tour-steps"

/**
 * Which guide is on screen and where it has got to.
 *
 * Deliberately thin: whether the operator has *finished* a guide lives on their
 * account (`me.completedGuides`), because a browser-local flag would replay
 * every guide on each new browser and private window, and operators share
 * workstations. What is here is only "is one running right now", which is
 * per-tab by nature.
 *
 * The one thing kept in storage is a same-session suppression: a guide the
 * operator skipped must not reappear as they navigate, in the window before the
 * server round trip lands. Mirrors the per-user key scheme in
 * stores/scoped-operation.ts.
 */
interface OnboardingState {
  /** The running guide, or null when none is. */
  guide: GuideID | null
  /** The step on screen, or null when no guide is running. */
  step: TourStepID | null
  /** Guides this tab has already offered, so each is offered at most once per
   *  session however many times the deciding effect re-runs. */
  offered: readonly GuideID[]
  /** Start a guide at its first step. */
  start: (guide: GuideID) => void
  /** Feed an event to the running guide's machine. */
  send: (event: TourEvent) => void
  /** Abandon the running guide. Counts as finished — an operator who skipped it
   *  has made their decision, and re-offering would be nagging. */
  skip: () => void
  markOffered: (guide: GuideID) => void
  /** Whether this user dismissed `guide` earlier in this browser. Used only to
   *  bridge the gap before `me` reflects it. */
  dismissedLocally: (userId: string, guide: GuideID) => boolean
  reset: () => void
}

function dismissKey(userId: string, guide: GuideID) {
  return `guide_dismissed_${guide}_${userId}`
}

function rememberDismissed(guide: GuideID) {
  const userId = useAuthStore.getState().user?.userId
  if (!userId) return
  try {
    localStorage.setItem(dismissKey(userId, guide), "1")
  } catch {
    // Best-effort: the server list is the real record, this only covers the
    // seconds before it lands.
  }
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  guide: null,
  step: null,
  offered: [],

  start: (guide) =>
    set((state) => ({
      guide,
      step: firstStep(guide),
      offered: state.offered.includes(guide) ? state.offered : [...state.offered, guide],
    })),

  send: (event) => {
    const { guide, step } = get()
    if (!guide || !step) return
    const next = reduce(guide, step, event)
    if (next === step) return
    if (next === null) {
      rememberDismissed(guide)
      set({ guide: null, step: null })
      return
    }
    set({ step: next })
  },

  skip: () => {
    const guide = get().guide
    if (!guide) return
    rememberDismissed(guide)
    set({ guide: null, step: null })
  },

  markOffered: (guide) =>
    set((state) => ({
      offered: state.offered.includes(guide) ? state.offered : [...state.offered, guide],
    })),

  dismissedLocally: (userId, guide) => {
    try {
      return localStorage.getItem(dismissKey(userId, guide)) === "1"
    } catch {
      return false
    }
  },

  reset: () => set({ guide: null, step: null, offered: [] }),
}))

// Same lifecycle as the other per-user stores: drop in-memory state on logout
// and leave storage alone, since the keys are per-user and a re-login should not
// be greeted by a guide the operator already dismissed.
useAuthStore.subscribe((state, prevState) => {
  if (prevState.isAuthenticated && !state.isAuthenticated) {
    useOnboardingStore.getState().reset()
  }
})
