import { describe, expect, test } from "vitest"

import { CARD_GAP, placeCard, type Rect } from "./tour-placement"

const VIEWPORT = { width: 1440, height: 900 }
const CARD: Rect = { top: 0, left: 0, width: 352, height: 200 }

/** A sidebar-shaped target: narrow, near the left edge. */
const sidebarTarget: Rect = { top: 100, left: 12, width: 240, height: 56 }

describe("placeCard", () => {
  test("puts the card to the right of a sidebar target, vertically centred", () => {
    const placement = placeCard(sidebarTarget, CARD, VIEWPORT)
    expect(placement.side).toBe("right")
    expect(placement.left).toBe(sidebarTarget.left + sidebarTarget.width + CARD_GAP)
    // Centre of the target is 128; centre of a 200-tall card puts its top at 28.
    expect(placement.top).toBe(28)
  })

  test("falls back to the left when the right has no room", () => {
    const rightEdgeTarget: Rect = { top: 100, left: 1100, width: 300, height: 56 }
    const placement = placeCard(rightEdgeTarget, CARD, VIEWPORT)
    expect(placement.side).toBe("left")
    expect(placement.left).toBe(rightEdgeTarget.left - CARD_GAP - CARD.width)
  })

  test("drops below when neither side fits", () => {
    const narrow = { width: 420, height: 900 }
    const wideTarget: Rect = { top: 40, left: 20, width: 380, height: 56 }
    const placement = placeCard(wideTarget, CARD, narrow)
    expect(placement.side).toBe("bottom")
    expect(placement.top).toBe(wideTarget.top + wideTarget.height + CARD_GAP)
  })

  // A target near the top or bottom would otherwise centre the card off-screen,
  // taking its buttons — including Skip — with it.
  test("keeps the card on screen for a target at the very top", () => {
    const placement = placeCard({ top: 0, left: 12, width: 240, height: 40 }, CARD, VIEWPORT)
    expect(placement.top).toBeGreaterThanOrEqual(0)
  })

  test("keeps the card on screen for a target at the very bottom", () => {
    const placement = placeCard(
      { top: VIEWPORT.height - 40, left: 12, width: 240, height: 40 },
      CARD,
      VIEWPORT,
    )
    expect(placement.top + CARD.height).toBeLessThanOrEqual(VIEWPORT.height)
  })
})
