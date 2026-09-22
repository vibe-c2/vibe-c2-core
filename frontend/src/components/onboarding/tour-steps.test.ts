import { describe, expect, test } from "vitest"

import {
  TOURS,
  firstStep,
  lastStep,
  nextStepID,
  reduce,
  satisfies,
  stepNumber,
  tourStep,
  tourSteps,
  type GuideID,
  type TourStepID,
} from "./tour-steps"

const GUIDES = Object.keys(TOURS) as GuideID[]

describe("every guide's shape", () => {
  test("each guide has steps and its ids are unique", () => {
    for (const guide of GUIDES) {
      const ids = tourSteps(guide).map((s) => s.id)
      expect(ids.length, guide).toBeGreaterThan(0)
      expect(new Set(ids).size, `${guide} has duplicate step ids`).toBe(ids.length)
    }
  })

  // A step waiting on an app event offers no button and must say what it is
  // waiting for; one with a button must not also claim to be waiting. The
  // static "Waiting for you…" wording this replaced did not tell the operator
  // what to do, which is the whole reason these steps read as dead ends.
  test("a step either waits with an instruction or offers a button, never both", () => {
    for (const guide of GUIDES) {
      for (const step of tourSteps(guide)) {
        if (step.advance.on === "manual") {
          expect(step.action, `${guide}/${step.id} needs a button label`).toBeTruthy()
          expect(step.cta, `${guide}/${step.id} must not also wait`).toBeUndefined()
        } else {
          expect(step.action, `${guide}/${step.id} must not offer a button`).toBeUndefined()
          expect(step.cta, `${guide}/${step.id} needs an instruction`).toBeTruthy()
        }
      }
    }
  })

  test("every guide ends on a step the operator can dismiss", () => {
    for (const guide of GUIDES) {
      expect(tourStep(guide, lastStep(guide)).advance.on, guide).toBe("manual")
    }
  })

  test("nextStepID walks each guide to the end and stops", () => {
    for (const guide of GUIDES) {
      const walked: TourStepID[] = [firstStep(guide)]
      let id: TourStepID | null = firstStep(guide)
      while ((id = nextStepID(guide, id))) walked.push(id)
      expect(walked).toEqual(tourSteps(guide).map((s) => s.id))
    }
  })

  test("stepNumber is 1-based within its own guide", () => {
    expect(stepNumber("welcome", "switcher")).toBe(1)
    expect(stepNumber("welcome", "wiki")).toBe(4)
    expect(stepNumber("slash-menu", "editor")).toBe(1)
    expect(stepNumber("slash-menu", "slash")).toBe(2)
  })
})

describe("satisfies", () => {
  test("an element step only accepts its own element", () => {
    const step = tourStep("welcome", "switcher")
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
    const step = tourStep("welcome", "operations")
    expect(satisfies(step, { type: "scope-set" })).toBe(true)
    expect(satisfies(step, { type: "manual" })).toBe(false)
  })

  test("the type-slash step waits for the menu to open", () => {
    const step = tourStep("slash-menu", "editor")
    expect(satisfies(step, { type: "element-appeared", target: "slash-menu" })).toBe(true)
    expect(satisfies(step, { type: "manual" })).toBe(false)
  })
})

describe("reduce", () => {
  test("advances the welcome guide on each awaited event", () => {
    expect(
      reduce("welcome", "switcher", { type: "element-appeared", target: "operation-list" }),
    ).toBe("operations")
    expect(reduce("welcome", "operations", { type: "scope-set" })).toBe("nav")
    expect(reduce("welcome", "nav", { type: "manual" })).toBe("wiki")
    expect(reduce("welcome", "wiki", { type: "manual" })).toBeNull()
  })

  test("advances the document guide and finishes", () => {
    expect(
      reduce("slash-menu", "editor", { type: "element-appeared", target: "slash-menu" }),
    ).toBe("slash")
    expect(reduce("slash-menu", "slash", { type: "manual" })).toBeNull()
  })

  // The component feeds this everything that happens, including a measuring
  // loop that re-reports an element every frame it is on screen. Irrelevant
  // events have to be inert rather than nudging a guide along.
  test("holds position on an event the step does not await", () => {
    expect(reduce("welcome", "nav", { type: "element-appeared", target: "wiki-tree" })).toBe(
      "nav",
    )
    expect(
      reduce("slash-menu", "slash", { type: "element-appeared", target: "slash-menu" }),
    ).toBe("slash")
  })

  // The getting-started panel scopes on click, and a remembered scope is
  // restored on login before the guide starts — so the operator can be done
  // with "open the switcher" and "pick one" without ever opening it. Leaving
  // the guide parked on step 1 would point at a control whose purpose has
  // already been served.
  test("a scope arriving early fast-forwards past both picking steps", () => {
    expect(reduce("welcome", "switcher", { type: "scope-set" })).toBe("nav")
    expect(reduce("welcome", "operations", { type: "scope-set" })).toBe("nav")
  })

  // The operator may unscope and rescope while reading a later step; that must
  // not drag them backwards.
  test("a scope arriving late does not rewind the welcome guide", () => {
    expect(reduce("welcome", "nav", { type: "scope-set" })).toBe("nav")
    expect(reduce("welcome", "wiki", { type: "scope-set" })).toBe("wiki")
  })

  // Scoping happens all the time; it must not disturb a guide that is about
  // something else.
  test("a scope does not move the document guide", () => {
    expect(reduce("slash-menu", "editor", { type: "scope-set" })).toBe("editor")
    expect(reduce("slash-menu", "slash", { type: "scope-set" })).toBe("slash")
  })
})
