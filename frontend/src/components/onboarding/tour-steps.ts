// The in-app guides, as data.
//
// Every step waits for the operator to do the real thing rather than clicking
// Next through screenshots: the welcome guide's first step ends when they open
// the switcher, its second when an operation is actually scoped, and the
// document guide's first when the "/" menu opens. That is the whole point — the
// confusion these fix is not "what does the app contain", it is "which control
// starts it", and only a real click teaches that.
//
// A step that waits therefore carries a `cta`: the card states the action in
// as many words as it takes, and the spotlight beacons until it happens.
// Without one, a waiting step reads as a dead end.
//
// Kept free of React, the DOM and the router so the machines can be tested
// without any of them. The component reads these and supplies the events.

/** A guide's id. Mirrors models.GuideIDs on the server, which validates it. */
export type GuideID = "welcome" | "slash-menu"

export type TourStepID =
  // welcome
  | "switcher"
  | "operations"
  | "nav"
  | "wiki"
  // slash-menu
  | "editor"
  | "slash"

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
  /**
   * The action being waited for, phrased as an instruction. Required on any
   * step that does not advance on its own button, and absent on the ones that
   * do — a step cannot both wait for the operator and offer to move on without
   * them.
   */
  cta?: string
  /** Route the tour moves to when this step opens. Absent means stay put. */
  route?: string
  /** Label for the button, on manual steps only. */
  action?: string
}

const WELCOME_STEPS: readonly TourStep[] = [
  {
    id: "switcher",
    target: "operation-switcher",
    title: "Everything starts with an operation",
    body: "Tasks, the timeline, findings and every wiki page belong to one operation. This is where you choose the one you are working on.",
    cta: "Click the highlighted button to open the picker",
    // The picker's own panel appearing is the proof they found it.
    advance: { on: "element", target: "operation-list" },
  },
  {
    id: "operations",
    target: "operation-list",
    title: "Pick the one you are working on",
    body: "You can switch at any time, and the app follows you — nothing is locked in by choosing here.",
    cta: "Choose an operation from the highlighted list",
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

const SLASH_MENU_STEPS: readonly TourStep[] = [
  {
    id: "editor",
    target: "editor-body",
    title: "A page is more than text",
    body: "Headings, tables, checklists, code, diagrams, file attachments — and live references to the hosts, credentials and tasks in this operation. One menu inserts all of it.",
    cta: 'Type "/" anywhere in the page to open it',
    advance: { on: "element", target: "slash-menu" },
  },
  {
    id: "slash",
    target: "slash-menu",
    title: "This is the insert menu",
    body: "Keep typing to filter it, then press Enter. A reference inserted from here stays live: rename a host or rotate a credential and every page mentioning it follows.",
    advance: { on: "manual" },
    action: "Got it",
  },
]

export const TOURS: Record<GuideID, readonly TourStep[]> = {
  welcome: WELCOME_STEPS,
  "slash-menu": SLASH_MENU_STEPS,
}

export function tourSteps(guide: GuideID): readonly TourStep[] {
  return TOURS[guide]
}

export function firstStep(guide: GuideID): TourStepID {
  return TOURS[guide][0].id
}

export function lastStep(guide: GuideID): TourStepID {
  const steps = TOURS[guide]
  return steps[steps.length - 1].id
}

export function tourStep(guide: GuideID, id: TourStepID): TourStep {
  const step = TOURS[guide].find((s) => s.id === id)
  // Unreachable through the store, which only ever holds ids from this guide.
  if (!step) throw new Error(`unknown step ${id} in guide ${guide}`)
  return step
}

/** Index of `id` within its guide, 1-based, for "step N of M". */
export function stepNumber(guide: GuideID, id: TourStepID): number {
  return TOURS[guide].findIndex((s) => s.id === id) + 1
}

/** The step after `id`, or null when `id` is the guide's last one. */
export function nextStepID(guide: GuideID, id: TourStepID): TourStepID | null {
  const steps = TOURS[guide]
  const next = steps[steps.findIndex((s) => s.id === id) + 1]
  return next ? next.id : null
}

/** Events the component feeds a machine. */
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

/** Steps of the welcome guide that exist only to get an operation scoped. Once
 *  one is, they have nothing left to teach, however the operator got there. */
const SCOPE_STEPS: readonly TourStepID[] = ["switcher", "operations"]

/**
 * The step the guide should be on after `event`.
 *
 * Returns the same id when the event does not apply, and null when the guide is
 * finished. Total and pure: the component can feed it anything that happens.
 *
 * A scope arriving early fast-forwards rather than being ignored. The
 * getting-started panel lists the operator's operations inline and scopes one
 * on click, so they can be finished with the first two steps without ever
 * touching the switcher — and a guide still pointing at a control whose whole
 * purpose has already been served is worse than no guide.
 */
export function reduce(
  guide: GuideID,
  current: TourStepID,
  event: TourEvent,
): TourStepID | null {
  if (guide === "welcome" && event.type === "scope-set" && SCOPE_STEPS.includes(current)) {
    return nextStepID(guide, SCOPE_STEPS[SCOPE_STEPS.length - 1])
  }
  if (!satisfies(tourStep(guide, current), event)) return current
  return nextStepID(guide, current)
}
