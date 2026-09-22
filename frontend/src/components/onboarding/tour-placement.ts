// Where the walkthrough card sits relative to the thing it is pointing at.
//
// Hand-rolled rather than driven through a popover primitive: the targets are
// a sidebar button, a popover that is itself floating, a nav block and a tree
// pane, and the card has to stay put while the sidebar animates and the page
// navigates underneath it. A few lines of arithmetic are easier to reason about
// than a positioning engine being asked to re-anchor mid-transition — and this
// way the rules are testable without a layout engine at all.

export interface Rect {
  top: number
  left: number
  width: number
  height: number
}

export interface Viewport {
  width: number
  height: number
}

/** Gap between the spotlight and the card. */
export const CARD_GAP = 16
/** Keep the card this far from the viewport edge. */
const MARGIN = 12

export interface Placement {
  top: number
  left: number
  /** Which side of the target the card ended up on. */
  side: "right" | "left" | "bottom"
}

/**
 * Place a card of `card` size beside `target`.
 *
 * Prefers the right — every target except the wiki tree lives in the left
 * sidebar, so the card lands over the page body where there is room and it
 * never covers what it is describing. Falls back to the left, then below,
 * and always clamps inside the viewport so a narrow window cannot push the
 * card off-screen.
 */
export function placeCard(target: Rect, card: Rect, viewport: Viewport): Placement {
  const clamp = (value: number, max: number) =>
    Math.max(MARGIN, Math.min(value, max - MARGIN))

  const verticallyCentred = clamp(
    target.top + target.height / 2 - card.height / 2,
    viewport.height - card.height,
  )

  const rightEdge = target.left + target.width + CARD_GAP
  if (rightEdge + card.width + MARGIN <= viewport.width) {
    return { top: verticallyCentred, left: rightEdge, side: "right" }
  }

  const leftEdge = target.left - CARD_GAP - card.width
  if (leftEdge >= MARGIN) {
    return { top: verticallyCentred, left: leftEdge, side: "left" }
  }

  return {
    top: clamp(target.top + target.height + CARD_GAP, viewport.height - card.height),
    left: clamp(
      target.left + target.width / 2 - card.width / 2,
      viewport.width - card.width,
    ),
    side: "bottom",
  }
}
