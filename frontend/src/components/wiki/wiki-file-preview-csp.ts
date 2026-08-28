// Content-Security-Policy injection for attachment previews.
//
// WHY THIS EXISTS
//
// The preview iframe already uses sandbox="" (no allow-scripts, no
// allow-same-origin), which neutralizes embedded scripts. It does NOT stop
// passive subresource loads: a sandboxed document may still fetch images,
// stylesheets, fonts and media. So an attachment containing
//
//     <img src="https://attacker.example/beacon.png">
//
// causes the operator's browser to hit that host the moment the preview panel
// is expanded, leaking their source IP and user agent to whoever authored the
// document. On a red-team platform — where attachments are client deliverables,
// exfiltrated documents and malware samples — that is an engagement burn, not a
// cosmetic issue.
//
// The same hazard arrives through every office format we render into this
// panel: DOCX external image relationships (r:link), INCLUDEPICTURE and IMPORT
// field codes, remote templates, XLSX external workbook links. Converting those
// to HTML preserves the remote URL, so the fix has to live at the frame
// boundary rather than in any one converter.
//
// A meta-tag CSP is enforced by the document itself, so it survives regardless
// of how the srcdoc string was produced. Every renderer that feeds this panel
// must route its HTML through withPreviewCsp().

/** Policy applied to every previewed document.
 *
 *  default-src 'none' is the backstop: it blocks scripts, XHR/fetch, frames,
 *  objects and websockets outright. The allowances below re-enable exactly what
 *  a *self-contained* document needs and nothing that can reach the network:
 *
 *    img-src / media-src  data:  — assets inlined as data URIs still render;
 *                                  http(s) and even same-origin are refused, so
 *                                  no beacon and no probing of our own API.
 *    style-src  'unsafe-inline' data:
 *                                — inline <style> blocks and style="" attributes
 *                                  are how exported reports carry their layout.
 *                                  'unsafe-inline' is safe here precisely because
 *                                  script execution is already impossible.
 *    font-src   data:            — embedded webfonts.
 *    form-action 'none'          — a form POST is an egress channel too.
 *    base-uri 'none'             — no rewriting how relative URLs resolve.
 *
 *  Note frame-ancestors and sandbox are deliberately absent: neither is honoured
 *  in a meta-delivered policy, and the iframe's own sandbox attribute already
 *  covers the latter.
 */
const PREVIEW_CSP = [
  "default-src 'none'",
  "img-src data:",
  "media-src data:",
  "style-src 'unsafe-inline' data:",
  "font-src data:",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ")

const CSP_META = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">`

/** Matches a leading doctype declaration, including any leading whitespace or
 *  BOM. Deliberately anchored — a doctype is only meaningful at the very start,
 *  and we never want to match the string "<!doctype" appearing later in a
 *  document's body text. */
const LEADING_DOCTYPE = /^\uFEFF?\s*<!doctype[^>]*>/i

/**
 * Returns `html` with the preview CSP forced in as the document's first meta.
 *
 * The tag is inserted immediately after the doctype (or at position 0 when
 * there isn't one) rather than after a matched `<head>`. That is deliberate:
 * searching for `<head` invites a silent failure, because a `<head` occurring
 * first inside a comment or a CDATA-ish block would place the policy somewhere
 * the parser treats as text — leaving the preview unprotected while looking
 * correct. Anchoring to the top has no such ambiguity.
 *
 * It is also spec-correct. Per the HTML parsing algorithm a `<meta>` token
 * encountered in the "before head" insertion mode causes the parser to create
 * the head element and place the meta inside it, so a meta at the top of the
 * source becomes head's *first* child even when the document declares its own
 * `<head>` further down. Being first is what matters: a CSP only governs
 * subresources discovered after it is parsed.
 *
 * Documents that reference remote assets will show broken images after this —
 * that is the intended outcome, not a regression.
 */
export function withPreviewCsp(html: string): string {
  const doctype = LEADING_DOCTYPE.exec(html)
  if (doctype === null) {
    return `${CSP_META}${html}`
  }
  return `${doctype[0]}${CSP_META}${html.slice(doctype[0].length)}`
}

/** Exported for tests and for any future renderer that needs to assert on the
 *  exact policy it is running under. */
export const PREVIEW_CSP_POLICY = PREVIEW_CSP
