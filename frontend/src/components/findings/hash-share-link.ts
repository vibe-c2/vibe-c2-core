// Builds the shareable deep-link URL for a hash. Opening this URL lands the
// recipient on the Findings page with the hash details dialog open. Consumed
// by the row context menu and the details dialog header; the page side of
// this contract lives in `pages/findings.tsx`.
export function buildHashShareUrl(hashId: string): string {
  return `${window.location.origin}/findings?hash=${encodeURIComponent(hashId)}`
}
