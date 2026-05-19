const CURSOR_COLORS = [
  "#F44336",
  "#E91E63",
  "#9C27B0",
  "#2196F3",
  "#009688",
  "#4CAF50",
  "#FF9800",
  "#795548",
  "#607D8B",
  "#3F51B5",
]

/** Deterministic color for a user id — stable across sessions. */
export function getCursorColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) | 0
  }
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length]
}

/** Render a collaboration cursor caret for CollaborationCursor.
 *  Caret only — no name label. The colored bar is enough to signal "another
 *  user is editing here" without putting identity in everyone's prose. */
export function renderCursor(user: { name: string; color: string }): HTMLElement {
  const caret = document.createElement("span")
  caret.classList.add("collaboration-cursor__caret")
  caret.style.borderColor = user.color
  return caret
}
