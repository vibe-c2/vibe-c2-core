// Builds the shareable deep-link URL for a credential. Opening this URL lands
// the recipient on the Findings page with the credential details dialog open.
// Consumed by the row context menu and the details dialog header; the page
// side of this contract lives in `pages/findings.tsx`.
export function buildCredentialShareUrl(credentialId: string): string {
  return `${window.location.origin}/findings?credential=${encodeURIComponent(
    credentialId,
  )}`
}
