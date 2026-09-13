// Remembers which sign-in surface the user chose last so the login page can
// open on it next time (SSO button expanded vs. password form expanded).

export type LoginMethod = "sso" | "password"

const LOGIN_METHOD_KEY = "vibec2.login-method"

// Minimal Storage surface so the helpers stay testable without a DOM.
type MethodStore = Pick<Storage, "getItem" | "setItem">

function defaultStore(): MethodStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}

export function rememberLoginMethod(method: LoginMethod, store = defaultStore()): void {
  try {
    store?.setItem(LOGIN_METHOD_KEY, method)
  } catch {
    // Storage unavailable (private mode quirks) — the preference is a nicety.
  }
}

export function recallLoginMethod(store = defaultStore()): LoginMethod | null {
  try {
    const value = store?.getItem(LOGIN_METHOD_KEY)
    return value === "sso" || value === "password" ? value : null
  } catch {
    return null
  }
}
