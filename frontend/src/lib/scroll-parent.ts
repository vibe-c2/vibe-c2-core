/**
 * Walks up from an element to the nearest scrollable ancestor.
 *
 * The wiki editor and its node views live inside a `flex-1 overflow-y-auto`
 * container, so the first ancestor with a scrolling overflow-y is the element
 * whose scrollTop actually moves the document.
 *
 * Returns null when nothing between `el` and <body> scrolls.
 */
export function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node)
    if (style.overflowY === "auto" || style.overflowY === "scroll") {
      return node
    }
    node = node.parentElement
  }
  return null
}
