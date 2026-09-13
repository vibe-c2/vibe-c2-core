import { graphqlClient } from "@/lib/graphql-client"
import { MySessionsDocument } from "@/graphql/gql/graphql"
import { useSessionStore } from "@/stores/sessions"

// Fire-and-forget: after a fresh login, warn if the account already had
// other active sessions. Shared by the password form and the SSO landing.
export function warnIfMultipleSessions(): void {
  graphqlClient(MySessionsDocument, { activeOnly: true, first: 1 })
    .then((data) => {
      if (data.mySessions.totalCount > 1) {
        useSessionStore.getState().openMySessionsDialogWithWarning()
      }
    })
    .catch(() => {}) // Non-critical — silently ignore errors
}

// The SSO flow leaves and re-enters the SPA through a full navigation, so
// the login page cannot run the check itself. It sets this marker before
// leaving; the protected shell consumes it on the first authenticated render.
const SSO_PENDING_KEY = "vibec2.sso-login-pending"

// Minimal Storage surface so the helpers stay testable without a DOM.
type MarkerStore = Pick<Storage, "getItem" | "setItem" | "removeItem">

function defaultStore(): MarkerStore | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage
  } catch {
    return null
  }
}

export function markSsoLoginPending(store = defaultStore()): void {
  try {
    store?.setItem(SSO_PENDING_KEY, "1")
  } catch {
    // Storage unavailable (private mode quirks) — skip the warning.
  }
}

export function consumeSsoLoginPending(store = defaultStore()): boolean {
  try {
    const pending = store?.getItem(SSO_PENDING_KEY) === "1"
    if (pending) store?.removeItem(SSO_PENDING_KEY)
    return pending
  } catch {
    return false
  }
}
