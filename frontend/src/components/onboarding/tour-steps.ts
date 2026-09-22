// The first-login walkthrough, as data.
//
// Every step waits for the operator to do the real thing rather than clicking
// "Next" through screenshots: step 1 ends when they open the switcher, step 2
// when an operation is actually scoped. That is the whole point — the confusion
// this fixes is not "what does the app contain", it is "which control starts
// it", and only a real click teaches that.
//
// Kept free of React, the DOM and the router so the machine can be tested
// without any of them. The component reads these and supplies the events.

export type TourStepID = "switcher" | "operations" | "nav" | "wiki"

/** What satisfies a step. */
export type TourAdvance =
  /** An element carrying this `data-tour` value appears. Used where the
   *  operator's action is "open that thing" — the panel it opens showing up IS
   *  the confirmation, with no state to lift out of the component that owns
   *  it. */
  | { on: "element"; target: string }
  /** An operation becomes scoped. */
  | { on: "scope" }
  /** The operator presses the step's own button. */
  | { on: "manual" }

export interface TourStep {
  id: TourStepID
  /** `data-tour` value of the element to spotlight. */
  target: string
  title: string
  body: string
  advance: TourAdvance
  /** Route the tour moves to when this step opens. Absent means stay put. */
  route?: string
  /** Label for the button, on manual steps only. */
  action?: string
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "switcher",
    target: "operation-switcher",
    title: "Everything starts with an operation",
    body: "Tasks, the timeline, findings and every wiki page belong to one operation. This is where you choose the one you are working on — open it.",
    // The picker's own list appearing is the proof they found it.
    advance: { on: "element", target: "operation-list" },
  },
  {
    id: "operations",
    target: "operation-list",
    title: "Pick the one you are working on",
    body: "You can switch at any time, and the app follows you — nothing is locked in by choosing here.",
    advance: { on: "scope" },
  },
  {
    id: "nav",
    target: "nav-operation-items",
    title: "That unlocked the rest of the app",
    body: "Tasks and Timeline were hidden because they had no operation to belong to. They are scoped to the one you just picked.",
    advance: { on: "manual" },
    action: "Next",
  },
  {
    id: "wiki",
    target: "wiki-tree",
    title: "And this is the operation's wiki",
    body: "Notes, findings and diagrams for this engagement live here. The toggle above the tree swaps between this operation's pages and the public ones shared across every operation.",
    advance: { on: "manual" },
    action: "Done",
    route: "/wiki",
  },
]

export const FIRST_STEP: TourStepID = TOUR_STEPS[0].id

export function tourStep(id: TourStepID): TourStep {
  const step = TOUR_STEPS.find((s) => s.id === id)
  // Unreachable through the store, which only ever holds ids from this list.
  if (!step) throw new Error(`unknown tour step: ${id}`)
  return step
}

/** The step after `id`, or null when `id` is the last one. */
export function nextStepID(id: TourStepID): TourStepID | null {
  const index = TOUR_STEPS.findIndex((s) => s.id === id)
  const next = TOUR_STEPS[index + 1]
  return next ? next.id : null
}

/** Events the component feeds the machine. */
export type TourEvent =
  | { type: "element-appeared"; target: string }
  | { type: "scope-set" }
  | { type: "manual" }

/** Whether `event` satisfies `step`. */
export function satisfies(step: TourStep, event: TourEvent): boolean {
  switch (step.advance.on) {
    case "element":
      return event.type === "element-appeared" && event.target === step.advance.target
    case "scope":
      return event.type === "scope-set"
    case "manual":
      return event.type === "manual"
  }
}

/** Steps that exist only to get an operation scoped. Once one is, they have
 *  nothing left to teach, however the operator got there. */
const SCOPE_STEPS: readonly TourStepID[] = ["switcher", "operations"]

/**
 * The step the tour should be on after `event`.
 *
 * Returns the same id when the event does not apply, and null when the tour is
 * finished. Total and pure: the component can feed it anything that happens.
 *
 * A scope arriving early fast-forwards rather than being ignored. The
 * getting-started panel lists the operator's operations inline and scopes one
 * on click, so they can be finished with steps 1 and 2 without ever touching
 * the switcher — and a guide still pointing at a control whose whole purpose
 * has already been served is worse than no guide.
 */
export function reduce(current: TourStepID, event: TourEvent): TourStepID | null {
  if (event.type === "scope-set" && SCOPE_STEPS.includes(current)) {
    return nextStepID(SCOPE_STEPS[SCOPE_STEPS.length - 1])
  }
  if (!satisfies(tourStep(current), event)) return current
  return nextStepID(current)
}
