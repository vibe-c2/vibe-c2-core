import type { SignOutReason } from "@/stores/auth"

// Builds the informational line shown above the login form that explains
// why the user is here. Pure so it can be unit-tested without a DOM.
//
// Priority: an involuntary sign-out beats a plain "continue to" hint, and a
// redirect back to the dashboard root is not worth mentioning at all.
export function loginNotice(
  reason: SignOutReason | null,
  from: string | null | undefined,
): string | null {
  const target = displayTarget(from)
  const suffix = target ? ` to continue to ${target}` : ""

  switch (reason) {
    case "expired":
      return `Your session expired. Sign in again${suffix}.`
    case "revoked":
      return `Your session was ended from another device. Sign in again${suffix}.`
    default:
      return target ? `Sign in to continue to ${target}.` : null
  }
}

// "/tasks?x=1" → "/tasks"; "/" or empty → null. Only the path is shown so a
// long query string does not bloat the message.
function displayTarget(from: string | null | undefined): string | null {
  if (!from) return null
  const path = from.split("?")[0]
  if (!path || path === "/") return null
  return path
}
