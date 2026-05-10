import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { LucideIcon } from "lucide-react"

export const STATIC_FAVICON_HREF = "/favicon.svg"

// Lucide icons stroke with currentColor; favicons render outside the React
// tree so there's nothing to inherit. Black has acceptable contrast against
// both light and dark browser chrome.
const DEFAULT_LUCIDE_COLOR = "#000"

export function lucideToSvgDataUrl(
  Icon: LucideIcon,
  color?: string | null,
): string {
  const element = createElement(Icon, {
    size: 32,
    color: color || DEFAULT_LUCIDE_COLOR,
  })
  const svg = renderToStaticMarkup(element)
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function emojiToSvgDataUrl(emoji: string): string {
  // Defensive XML-escape — emoji codepoints don't contain reserved chars,
  // but the field is user-controlled.
  const safe = emoji.replace(/[<>&]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
  )
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="26">${safe}</text>` +
    `</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export function setFavicon(href: string): void {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement("link")
    link.rel = "icon"
    document.head.appendChild(link)
  }
  link.type = "image/svg+xml"
  if (link.href !== href) {
    link.href = href
  }
}
