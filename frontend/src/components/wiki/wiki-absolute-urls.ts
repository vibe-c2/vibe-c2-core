/**
 * Rewrite a page's attachment and image links to absolute URLs for export.
 *
 * Inside the app a link like `/api/v1/wiki/files/<id>` resolves against the
 * current origin and works. Taken somewhere else — Obsidian, a ticket, a
 * report — it resolves against nothing and is dead. The relative form stays
 * canonical in the document; this is applied only on the way out.
 *
 * The origin comes from the browser rather than from server config because
 * the browser knows the address the operator actually reaches this
 * deployment on, which is the one that has to work when they paste the link
 * elsewhere. A server behind a proxy often does not.
 */

// Only the two media routes, and only with a well-formed id. Narrow on
// purpose: the replacement runs over the whole document, including code
// fences, and a loose pattern would rewrite prose that merely mentions a
// path.
const MEDIA_LINK = new RegExp(
  "\\]\\((/api/v1/wiki/(?:images|files)/" +
    "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\\)",
  "gi",
)

/**
 * Prefix every wiki media link in `markdown` with `origin`.
 *
 * A trailing slash on the origin is tolerated — `window.location.origin`
 * never has one, but a caller-supplied value might, and doubling the slash
 * would produce a URL that 404s.
 */
export function absolutizeWikiMedia(markdown: string, origin: string): string {
  if (!origin) return markdown
  const base = origin.replace(/\/+$/, "")
  return markdown.replace(MEDIA_LINK, (_match, path: string) => `](${base}${path})`)
}
