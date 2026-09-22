import { describe, expect, test } from "vitest"

import {
  FIRST_STEP,
  TOUR_STEPS,
  nextStepID,
  reduce,
  satisfies,
  tourStep,
  type TourStepID,
} from "./tour-steps"

describe("the tour's shape", () => {
  test("starts at the switcher and ends on the wiki", () => {
    expect(FIRST_STEP).toBe("switcher")
    expect(TOUR_STEPS[TOUR_STEPS.length - 1].id).toBe("wiki")
  })

  // A step waiting on an app event offers no button, and one waiting on a
  // button must have a label — otherwise the card either dead-ends or invites
  // the operator to skip the very action being taught.
  test("every step is either actionable or waiting, never both or neither", () => {
    for (const step of TOUR_STEPS) {
      if (step.advance.on === "manual") {
        expect(step.action, `${step.id} needs a button label`).toBeTruthy()
      } else {
        expect(step.action, `${step.id} must not offer a button`).toBeUndefined()
      }
    }
  })

  test("nextStepID walks to the end and stops", () => {
    const walked: TourStepID[] = [FIRST_STEP]
    let id: TourStepID | null = FIRST_STEP
    while ((id = nextStepID(id))) walked.push(id)
    expect(walked).toEqual(TOUR_STEPS.map((s) => s.id))
  })
})

describe("satisfies", () => {
  test("an element step only accepts its own element", () => {
    const step = tourStep("switcher")
    expect(satisfies(step, { type: "element-appeared", target: "operation-list" })).toBe(
      true,
    )
    expect(satisfies(step, { type: "element-appeared", target: "wiki-tree" })).toBe(false)
    expect(satisfies(step, { type: "manual" })).toBe(false)
  })

  // The lesson of this step is that picking an operation is what unlocks the
  // app, so a Next button would let the operator skip exactly the thing being
  // taught. Only a real scope counts.
  test("the pick-an-operation step accepts nothing but a scope", () => {
    const step = tourStep("operations")
    expect(satisfies(step, { type: "scope-set" })).toBe(true)
    expect(satisfies(step, { type: "manual" })).toBe(false)
    expect(
      satisfies(step, { type: "element-appeared", target: "operation-list" }),
    ).toBe(false)
  })
})

describe("reduce", () => {
  test("advances on the awaited event", () => {
    expect(reduce("switcher", { type: "element-appeared", target: "operation-list" })).toBe(
      "operations",
    )
    expect(reduce("operations", { type: "scope-set" })).toBe("nav")
    expect(reduce("nav", { type: "manual" })).toBe("wiki")
  })

  // The component feeds this everything that happens, including a measuring
  // loop that re-reports an element every frame it is on screen. Irrelevant
  // events have to be inert rather than nudging the tour along.
  test("holds position on an event the step does not await", () => {
    expect(reduce("nav", { type: "element-appeared", target: "wiki-tree" })).toBe("nav")
    expect(
      reduce("operations", { type: "element-appeared", target: "operation-list" }),
    ).toBe("operations")
    expect(reduce("wiki", { type: "element-appeared", target: "wiki-tree" })).toBe("wiki")
  })

  // The getting-started panel scopes an operation on click, so the operator can
  // be done with "open the switcher" and "pick one" without ever opening it.
  // Leaving the tour parked on step 1 in that case would point at a control
  // whose purpose has already been served.
  test("a scope arriving early fast-forwards past both picking steps", () => {
    expect(reduce("switcher", { type: "scope-set" })).toBe("nav")
    expect(reduce("operations", { type: "scope-set" })).toBe("nav")
  })

  // The operator may unscope and rescope while reading a later step; that must
  // not drag them backwards.
  test("a scope arriving late does not rewind the tour", () => {
    expect(reduce("nav", { type: "scope-set" })).toBe("nav")
    expect(reduce("wiki", { type: "scope-set" })).toBe("wiki")
  })

  test("finishes at the last step", () => {
    expect(reduce("wiki", { type: "manual" })).toBeNull()
  })

  // A scope that was already set when the tour reached the step would otherwise
  // re-fire on every render; landing on the same step twice must be harmless.
  test("re-sending the same event past a step is a no-op", () => {
    const after = reduce("operations", { type: "scope-set" })
    expect(after).toBe("nav")
    expect(reduce(after!, { type: "scope-set" })).toBe("nav")
  })
})
