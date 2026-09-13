// Error codes the backend appends to /login?error=<code> when a single
// sign-on attempt fails. Keep in sync with core/pkg/controller/oidc_controller.go.
const SSO_ERROR_MESSAGES: Record<string, string> = {
  sso_unavailable:
    "Single sign-on is temporarily unavailable — the identity provider could not be reached.",
  sso_denied: "Sign-in was cancelled or refused by the identity provider.",
  sso_state:
    "The sign-in attempt expired or was started in another browser. Please try again.",
  sso_provider: "The identity provider returned an invalid response. Please try again.",
  sso_no_roles:
    "Your account has no role that grants access here. Ask an administrator to assign one at the identity provider.",
  sso_username_taken:
    "A local account with your username already exists. Ask an administrator to link or rename it.",
  sso_inactive: "Your account is deactivated.",
  sso_internal: "Sign-in failed because of a server error. Please try again.",
}

export function ssoErrorMessage(code: string | null): string | null {
  if (!code) return null
  return SSO_ERROR_MESSAGES[code] ?? "Single sign-on failed. Please try again."
}
