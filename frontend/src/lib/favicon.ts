import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { LucideIcon } from "lucide-react"

export const STATIC_FAVICON_HREF = "/favicon.svg"

// Lucide icons stroke with currentColor; favicons render outside the React
// tree so there's nothing to inherit. Black has acceptable contrast against
// both light and dark browser chrome.
const DEFAULT_LUCIDE_COLOR = "#000"

// Lucide ships viewBox 24x24 with stroke-width 2; at 16px favicon raster
// that's ~1.3 device px — thin enough that macOS Chrome occasionally
// classifies the rendered bitmap as "empty" and substitutes the OS document
// icon. Slightly thicker stroke survives the downsample.
const FAVICON_STROKE_WIDTH = 2.25

/**
 * Encode an SVG string as a base64 data URI. We avoid `encodeURIComponent`
 * here because macOS Chrome has a known regression where URL-encoded SVG
 * favicons set via JS sometimes fail the favicon decode and fall back to the
 * OS generic-document icon. Base64 takes a different code path and is more
 * reliably picked up.
 */
function svgToDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg)
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return `data:image/svg+xml;base64,${btoa(binary)}`
}

export function lucideToSvgDataUrl(
  Icon: LucideIcon,
  color?: string | null,
): string {
  const element = createElement(Icon, {
    size: 32,
    color: color || DEFAULT_LUCIDE_COLOR,
    strokeWidth: FAVICON_STROKE_WIDTH,
  })
  const svg = renderToStaticMarkup(element)
  return svgToDataUrl(svg)
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
  return svgToDataUrl(svg)
}

/**
 * Set the document favicon by hard-replacing every `<link rel~="icon">`
 * with a fresh element. Mutating the existing `<link>`'s `href` is a known
 * Chrome-on-macOS pain point: the favicon pipeline caches the previous
 * resolution and either declines to re-fetch the new `data:` URI or
 * substitutes the OS generic-document icon. Hard-replacing forces a fresh
 * evaluation. `sizes="any"` tells the picker this one SVG covers every
 * favicon size, which short-circuits alternative-source lookup on macOS
 * Chrome.
 */
export function setFavicon(href: string): void {
  const existing = document.head.querySelectorAll<HTMLLinkElement>(
    'link[rel~="icon"]',
  )
  for (const link of Array.from(existing)) {
    link.remove()
  }
  const link = document.createElement("link")
  link.rel = "icon"
  link.type = "image/svg+xml"
  link.setAttribute("sizes", "any")
  link.href = href
  document.head.appendChild(link)
}
