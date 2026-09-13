# OIDC single sign-on — design

Status: implemented (branch `feat/oidc-auth`). Companion ADR: `vibe-c2-docs` ADR-0005.

## Goal

Let operators sign in through an external OpenID Connect provider (Keycloak is
the reference; any provider with a discovery document works) without touching
how sessions, CSRF, API keys, agent keys, GraphQL or the SPA bootstrap work.
Everything is opt-in via `.env`; with `OIDC_ENABLED=false` the server behaves
exactly as before, apart from two additive fields on `GET /api/v1/status`.

## One-sentence design

**OIDC only changes how a user proves who they are.** After the provider
callback, core calls the same `IssueSession` helper the password login uses,
so an SSO login *is* an ordinary vibe session from that point on.

## Flow

```
Browser                      core (/api/v1)                        Provider
  │  GET /auth/oidc/login?return_to=/wiki/x                          │
  │──────────────────────────►│                                       │
  │                           │ mint Handshake{state,nonce,           │
  │                           │   pkce_verifier,return_to,issued_at}  │
  │                           │ seal → oidc_handshake cookie          │
  │  302 → /auth?state&nonce&code_challenge(S256)…                    │
  │◄──────────────────────────│                                       │
  │───────────────────────────────────────────────────────────────────►│ user authenticates (MFA etc.)
  │  302 → /auth/oidc/callback?code&state                              │
  │◄───────────────────────────────────────────────────────────────────│
  │──────────────────────────►│ open cookie, clear it (single use)     │
  │                           │ state == cookie.state (const-time)     │
  │                           │ POST /token (code + verifier) ────────►│
  │                           │◄──────── id_token (+access_token) ─────│
  │                           │ verify sig/iss/aud/exp; nonce match    │
  │                           │ GET /userinfo (optional) ─────────────►│
  │                           │ merge claims → Identity                │
  │                           │ find by (issuer,sub) | link | create   │
  │                           │ sync roles                             │
  │                           │ IssueSession (Mongo row, Redis, cookies)
  │  302 → <spa origin><return_to>  + access/refresh/csrf cookies       │
  │◄──────────────────────────│                                       │
  │  SPA boots, /login/me hydrates the store as usual                  │
```

Failures never carry provider detail to the browser. The callback redirects to
`<spa origin>/login?error=<code>` with one of: `sso_unavailable`,
`sso_denied`, `sso_state`, `sso_provider`, `sso_no_roles`,
`sso_username_taken`, `sso_inactive`, `sso_internal`. The full reason is in the
server log at WARN.

## Code map

| Concern | Where |
|---|---|
| Env + validation | `core/pkg/environment/environment.go` (`OIDCSettings`, `validateAuthSettings`) |
| Relying-party logic (no Gin) | `core/pkg/auth/oidc/` — `provider.go` (discovery, exchange, verify, userinfo), `handshake.go` (sealed cookie payload), `claims.go` (claim extraction + role mapping) |
| Fake provider for tests | `core/pkg/auth/oidc/oidctest/` |
| HTTP handlers | `core/pkg/controller/oidc_controller.go` (`Login`, `Callback`, `resolveUser`) |
| Session issuance (shared) | `core/pkg/controller/auth_controller.go` `IssueSession` |
| Cookie | `core/pkg/auth/cookies/cookies.go` `SetOIDCHandshakeCookie` |
| Routes | `core/pkg/app/router.go` (`GET /auth/oidc/login`, `GET /auth/oidc/callback`, public) |
| `/status` | `core/pkg/controller/status_controller.go`, `responses.OIDCStatus` |
| User model | `core/pkg/models/user.go` (`AuthSource`, `OIDC{Issuer,Subject,LastLoginAt}`) |
| Repo | `core/pkg/repository/user_repository.go` `FindByOIDCIdentity`, partial unique index on `(oidc.issuer, oidc.subject)` |
| Guards | `authController.Login` refuses SSO accounts and honours `AUTH_LOCAL_LOGIN_ENABLED`; `resolver.rejectSSOManagedFields` blocks password/username edits |
| SPA | `frontend/src/pages/login.tsx`, `services/auth.ts`, `lib/sso-errors.ts`, `lib/post-login-check.ts`, Users table/edit dialog |

## Where the URLs come from

Nothing URL-shaped about *us* is configured. OIDC requires the client to send
`redirect_uri` on the authorization request and repeat it on the token exchange
(RFC 6749 §4.1.1, §4.1.3), and the provider checks it against what was
registered — so core must know it, but it can derive it:

- **`redirect_uri`** = public origin of the request that hits
  `/auth/oidc/login` (scheme from `X-Forwarded-Proto` or TLS, host from
  `X-Forwarded-Host` or `Host`) + the fixed path `/api/v1/auth/oidc/callback`.
  It is sealed into the handshake so the exchange repeats the identical string
  even if another replica, without the proxy headers, handles the callback.
  A forged `Host` can only produce a value the provider has not registered.
- **Post-login origin** = the `Referer` origin of that same request when it is
  one of `CORS_ALLOWED_ORIGINS` (the list of front-end origins, already
  required in production); otherwise the API's own origin, which is the
  single-origin layout behind nginx or the ingress. A link from an unlisted
  site therefore cannot choose where a victim lands. Also sealed, so even an
  expired handshake sends the browser back where it started; only a missing
  or tampered cookie falls back to the API origin.

Register `<public origin>/api/v1/auth/oidc/callback` at the provider — for the
dev stack that is `http://localhost:8002/...` and `https://localhost:8443/...`,
both already in the realm import.

## Security notes

- **State** (CSRF on the callback) and **nonce** (ID-token replay) are random
  32-byte values; **PKCE S256** protects the code even though the client is
  confidential. All three live in one AES-256-GCM sealed cookie
  (`oidc_handshake`, httpOnly, `Path=/api/v1/auth/oidc`, `SameSite=Lax`, 10 min).
  The key is derived from `JWT_SECRET_KEY` with its own label
  (`auth.DeriveKey(secret, "oidc-handshake")`), so it never equals the grace
  key. No server-side row means the callback can land on any pod and there
  is nothing to leak or sweep.
- The cookie is cleared on every callback outcome; a tampered, expired, or
  wrong-key cookie all collapse to the same `sso_state` error.
- **Issuer pinning.** Identities are keyed by the configured `OIDC_ISSUER_URL`
  (which go-oidc verified the ID token against), never by an `iss` claim from
  userinfo. `MergeClaims` refuses to let userinfo override `iss`/`sub`, and
  a userinfo `sub` that differs from the ID token's is rejected outright.
- **Open redirect on the landing origin** is closed by the `Referer` /
  `CORS_ALLOWED_ORIGINS` allowlist described above.
- **return_to** is sanitised to a same-origin relative path (`/x`, never `//x`,
  `/\x`, absolute URLs, or CR/LF) before it is sealed, so the callback cannot
  become an open redirect.
- **No provider tokens are stored.** The access/ID tokens are used once for
  the exchange and userinfo call and dropped. Session lifetime is vibe's own
  (`AUTH_ACCESS_TTL`/`AUTH_REFRESH_TTL`); revoking a user at the provider takes
  effect on their next SSO login, deactivating them in vibe takes effect on the
  next refresh (≤ one access TTL) as today.
- **Password paths are closed for SSO accounts**: `POST /login` answers the
  generic "invalid credentials", `updateUser`/`updateOwnProfile` refuse
  `password` and `username`. `AUTH_LOCAL_LOGIN_ENABLED=false` additionally
  turns `POST /login` into a 403 and hides the form; core refuses to boot with
  that flag when OIDC is off (lockout guard). `/enroll` is untouched so a fresh
  install can always bootstrap a local admin.
- **Provider outage ≠ core outage.** Discovery failure at boot is logged and
  `/status` reports `oidc.unavailable_reason`; the SPA shows the SSO button
  disabled and the password form still works. Discovery is retried on the next
  SSO attempt.

## Provisioning and roles

1. `FindByOIDCIdentity(issuer, sub)` hit → that account. Roles are
   re-synced from the provider on every login (`syncUser`); `last_login_at`
   updated. Inactive → `sso_inactive`.
2. Miss: look up the username claim (trimmed, lowercased).
   - Exists and `OIDC_LINK_EXISTING_BY_USERNAME=true` and not already linked →
     adopt the local account (password cleared, `auth_source=oidc`, identity
     written, roles synced).
   - Exists otherwise → `sso_username_taken`. Nothing is modified.
3. Otherwise create `{username, roles, active=true, auth_source=oidc,
   oidc{issuer,sub}}` and publish `user.created` with the system actor.

Role mapping: `OIDC_ROLES_CLAIM` is a dot-path into the merged claims
(`realm_access.roles` for Keycloak realm roles, `resource_access.<client>.roles`
for client roles, `groups` for most other providers). Each provider role is
looked up in `OIDC_ROLE_MAPPING`; if nothing matches, `OIDC_DEFAULT_ROLES` is
applied; if that is empty too the login is denied (`sso_no_roles`). Vibe roles
are validated at boot against `permissions.GetPermissionsByRole`.

Admins may still edit an SSO user's roles locally (break-glass); the Users page
says the change lasts until the user's next SSO login.

## Keycloak setup (production)

1. Create a realm (or use an existing one). Note the issuer:
   `https://<keycloak>/realms/<realm>`.
2. Clients → Create: Client ID `vibe-c2`, Client authentication **on**,
   Standard flow **on**, everything else off. Valid redirect URIs:
   `https://<vibe host>/api/v1/auth/oidc/callback` (the public origin your
   users reach core on; core derives the same value from the request). Web origins:
   `https://<vibe host>`. Copy the secret from the Credentials tab.
3. Realm roles → create `vibec2-admin` and `vibec2-user` (or pick your own
   names and adjust `OIDC_ROLE_MAPPING`). Assign them to users or groups.
4. Roles in the token: either leave `OIDC_USE_USERINFO=true` (realm roles are
   in userinfo by default) or add a **User Realm Role** mapper on the client
   with *Add to ID token* on and claim name `realm_access.roles`. The dev realm
   import (`deploy/keycloak/vibec2-realm.json`) does the latter.
5. Set the env block from `.env.example` (`OIDC_ENABLED=true`, issuer, client
   id/secret; nothing about our own URLs). Helm: `core.config.oidc.*` plus
   `secrets.values.oidcClientSecret`.

### Local development

```
make sso                      # Keycloak on http://keycloak.localhost:8180, admin/admin
# .env: OIDC_ENABLED=true, OIDC_CLIENT_SECRET=changeme_oidc_client_secret
make services                 # or restart core-dev
```

Sign in with `kc-admin` / `kc-admin` (→ admin), `kc-user` / `kc-user` (→ user),
`kc-norole` / `kc-norole` (→ falls back to `OIDC_DEFAULT_ROLES`; set it empty to
see `sso_no_roles`). `keycloak.localhost` is used on purpose: the browser and
the `core-dev` container must see the **same** issuer URL, and the compose file
gives the Keycloak service that name as a network alias. If your OS does not
resolve `*.localhost` to loopback, add `127.0.0.1 keycloak.localhost` to
`/etc/hosts`.

## Other providers

| Provider | Issuer | Roles claim | Notes |
|---|---|---|---|
| Keycloak | `https://kc/realms/<realm>` | `realm_access.roles` or `resource_access.<client>.roles` | reference |
| Authentik | `https://auth/application/o/<slug>/` | `groups` | groups scope is in `profile` by default |
| Microsoft Entra ID | `https://login.microsoftonline.com/<tenant>/v2.0` | `roles` (app roles) or `groups` | add the claim to the ID token in the app manifest |
| Okta | `https://<org>.okta.com/oauth2/default` | `groups` | add a groups claim filter to the auth server |
| Google | `https://accounts.google.com` | none | use `OIDC_DEFAULT_ROLES` only; Google has no group claim in OIDC |

## Out of scope (follow-ups)

Back-channel / front-channel logout from the provider, RP-initiated logout,
multiple providers at once, group → operation membership, and SSO for the
Hocuspocus sidecar (it already trusts the core-issued collab ticket).
