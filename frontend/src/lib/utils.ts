import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * True for a primary-button click with no modifier keys held — the case where
 * a Link should run its accompanying "close popover/dialog" side effect.
 * Modifier and middle clicks get handled natively by the browser as
 * "open in new tab/window", so we leave the surrounding UI alone to let the
 * user keep picking more items. Accepts either a DOM `MouseEvent` or a React
 * `MouseEvent` — both expose the same primitive fields.
 */
export function isPlainLeftClick(e: {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}): boolean {
  return (
    e.button === 0 &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.shiftKey &&
    !e.altKey
  )
}
