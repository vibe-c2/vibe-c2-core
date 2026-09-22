// The first-login walkthrough: a spotlight over one control at a time, with a
// card explaining it.
//
// Mounted globally from AppLayout, like the skill-update prompt, because it
// crosses surfaces — it starts on whatever page the operator landed on and ends
// on the wiki.
//
// Hand-rolled rather than pulled from a tour library: the machine already has
// to observe real app state (an operation becoming scoped, a popover mounting),
// which is the hard half, and what is left is a rectangle and a card. A library
// would add a dependency for the easy half and still need this file to drive it.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAppStore } from "@/stores/app"
import { useAuthStore } from "@/stores/auth"
import { useIsMobile } from "@/hooks/use-mobile"
import { useOnboardingStore } from "@/stores/onboarding"
import { useScopedOperationStore } from "@/stores/scoped-operation"
import { useMe } from "@/graphql/hooks/users"
import { useCompleteOnboarding } from "@/graphql/hooks/users"
import { TOUR_STEPS, tourStep } from "@/components/onboarding/tour-steps"
import { placeCard, type Placement, type Rect } from "@/components/onboarding/tour-placement"

/** How often the spotlight re-measures its target. Cheap (one
 *  getBoundingClientRect) and it has to survive the sidebar's open/close
 *  transition, a popover mounting and a route change — none of which emit an
 *  event this component could otherwise hook. */
const MEASURE_INTERVAL_MS = 120

/** Padding around the target inside the spotlight cutout. */
const SPOTLIGHT_PAD = 6

function targetSelector(target: string) {
  return `[data-tour="${target}"]`
}

function rectOf(element: Element): Rect {
  const { top, left, width, height } = element.getBoundingClientRect()
  return { top, left, width, height }
}

export function OnboardingTour() {
  const step = useOnboardingStore((s) => s.step)

  // The auto-offer decision and the tour itself are separate components so the
  // measuring loop below only ever runs while the tour is on screen.
  return (
    <>
      <TourAutoStart />
      {step ? <TourOverlay /> : null}
    </>
  )
}

/**
 * Starts the tour once for an operator who has never been through it.
 *
 * Gated on having somewhere to go: the walkthrough's second step is "pick an
 * operation", so running it for someone who belongs to none would spotlight an
 * empty list. Those operators get the getting-started panel's "ask an admin"
 * branch instead, which is the only honest advice available to them.
 */
function TourAutoStart() {
  const isMobile = useIsMobile()
  const { data: me } = useMe()
  const userId = useAuthStore((s) => s.user?.userId)
  const scopedOperation = useScopedOperationStore((s) => s.scopedOperation)
  const offered = useOnboardingStore((s) => s.offered)
  const start = useOnboardingStore((s) => s.start)
  const dismissedLocally = useOnboardingStore((s) => s.dismissedLocally)

  useEffect(() => {
    if (offered || isMobile || !userId) return
    // Undefined while `me` is in flight — deciding now would flash a tour at
    // someone who finished it months ago.
    if (!me?.me) return
    if (me.me.onboardingCompletedAt) return
    if (dismissedLocally(userId)) return
    // Somebody already working in an operation does not need to be told how to
    // choose one; they found it without us.
    if (scopedOperation) return
    start()
  }, [offered, isMobile, userId, me, scopedOperation, dismissedLocally, start])

  return null
}

function TourOverlay() {
  const stepID = useOnboardingStore((s) => s.step)
  const send = useOnboardingStore((s) => s.send)
  const skip = useOnboardingStore((s) => s.skip)
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen)
  const scopedOperation = useScopedOperationStore((s) => s.scopedOperation)
  const completeOnboarding = useCompleteOnboarding()
  const navigate = useNavigate()
  const { pathname } = useLocation()

  const cardRef = useRef<HTMLDivElement>(null)
  const [targetRect, setTargetRect] = useState<Rect | null>(null)
  const [placement, setPlacement] = useState<Placement | null>(null)

  const step = stepID ? tourStep(stepID) : null
  const stepNumber = TOUR_STEPS.findIndex((s) => s.id === stepID) + 1

  // Every target except the wiki tree lives in the sidebar, and a collapsed or
  // closed sidebar would leave the spotlight pointing at nothing.
  useEffect(() => {
    setSidebarOpen(true)
  }, [stepID, setSidebarOpen])

  // A step that names a route takes the operator there. Guarded on pathname so
  // it does not fight a manual navigation away mid-step.
  useEffect(() => {
    if (step?.route && pathname !== step.route) {
      navigate(step.route)
    }
    // pathname is deliberately not a dependency: re-running on every navigation
    // would drag the operator back if they chose to leave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.route, navigate])

  // Scope changes satisfy the "pick an operation" step.
  const scopedId = scopedOperation?.id ?? null
  useEffect(() => {
    if (scopedId) send({ type: "scope-set" })
  }, [scopedId, send])

  // Measure the current target, and report any *other* step's target
  // appearing — that is how "open the switcher" is confirmed, without lifting
  // the popover's open state out of the component that owns it.
  const measure = useCallback(() => {
    if (!step) return
    const element = document.querySelector(targetSelector(step.target))
    setTargetRect(element ? rectOf(element) : null)

    if (step.advance.on === "element") {
      const awaited = document.querySelector(targetSelector(step.advance.target))
      if (awaited) send({ type: "element-appeared", target: step.advance.target })
    }
  }, [step, send])

  useEffect(() => {
    // First measurement on the next frame rather than in the effect body: the
    // target may still be mid-transition (the sidebar was just told to open),
    // and measuring synchronously here would both catch it moving and trip the
    // cascading-render rule.
    const frame = window.requestAnimationFrame(measure)
    const timer = window.setInterval(measure, MEASURE_INTERVAL_MS)
    window.addEventListener("resize", measure)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearInterval(timer)
      window.removeEventListener("resize", measure)
    }
  }, [measure])

  // Placement needs the card's own size, so it runs after layout.
  useLayoutEffect(() => {
    if (!targetRect || !cardRef.current) {
      setPlacement(null)
      return
    }
    setPlacement(
      placeCard(targetRect, rectOf(cardRef.current), {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    )
  }, [targetRect])

  const finish = useCallback(() => {
    // Fire and forget: the mutation is optimistic and a failure only means the
    // tour offers itself again next session, which beats blocking the operator
    // behind an error they cannot act on.
    completeOnboarding.mutate()
  }, [completeOnboarding])

  const handleSkip = useCallback(() => {
    skip()
    finish()
  }, [skip, finish])

  const handleAdvance = useCallback(() => {
    const isLast = stepID === TOUR_STEPS[TOUR_STEPS.length - 1].id
    send({ type: "manual" })
    if (isLast) finish()
  }, [stepID, send, finish])

  // Escape leaves. A guide with no way out is a trap.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleSkip()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [handleSkip])

  if (!step) return null

  return (
    // pointer-events-none throughout: the operator has to be able to click the
    // very control being pointed at, and a forgiving overlay beats a modal one
    // that blocks anything the measured rect gets slightly wrong.
    <div className="pointer-events-none fixed inset-0 z-50">
      {targetRect ? (
        <div
          aria-hidden
          className="absolute rounded-lg ring-2 ring-primary transition-all duration-200"
          style={{
            top: targetRect.top - SPOTLIGHT_PAD,
            left: targetRect.left - SPOTLIGHT_PAD,
            width: targetRect.width + SPOTLIGHT_PAD * 2,
            height: targetRect.height + SPOTLIGHT_PAD * 2,
            // The dim is the cutout's own shadow, so the hole needs no mask and
            // stays perfectly aligned with the ring as the rect animates.
            boxShadow: "0 0 0 9999px color-mix(in oklab, var(--background) 72%, transparent)",
          }}
        />
      ) : null}

      <div
        ref={cardRef}
        role="dialog"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className={cn(
          "pointer-events-auto absolute w-[min(22rem,calc(100vw-1.5rem))] rounded-xl bg-popover p-4 text-popover-foreground shadow-lg ring-1 ring-foreground/10 transition-all duration-200",
          // Until the first measurement lands the card would otherwise flash at
          // the viewport origin.
          placement ? "opacity-100" : "opacity-0",
        )}
        style={placement ? { top: placement.top, left: placement.left } : { top: 0, left: 0 }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Step {stepNumber} of {TOUR_STEPS.length}
          </p>
          <button
            type="button"
            onClick={handleSkip}
            aria-label="Skip the walkthrough"
            className="-mr-1 -mt-1 flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>

        <h2 id="tour-title" className="mt-1.5 text-base font-semibold tracking-tight">
          {step.title}
        </h2>
        <p id="tour-body" className="mt-1 text-sm text-muted-foreground">
          {step.body}
        </p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={handleSkip}>
            Skip
          </Button>
          {step.action ? (
            <Button size="sm" onClick={handleAdvance}>
              {step.action}
            </Button>
          ) : (
            // Steps waiting on a real action say what they are waiting for,
            // rather than offering a button that would skip the lesson.
            <p className="text-xs text-muted-foreground">Waiting for you…</p>
          )}
        </div>
      </div>
    </div>
  )
}
