# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

All commands run from the repo root unless noted.

```bash
# Infrastructure (MongoDB, Redis, RabbitMQ, SeaweedFS)
make infra              # start infrastructure containers
make infra-stop         # stop infrastructure
make infra-reset        # stop + delete volumes

# All services including core dev container (hot-reload via air)
make services           # start everything (--profile development)
make services-stop
make services-reset
make services-rebuild   # rebuild dev images, then restart — needed after package.json, go.mod or Dockerfile changes
make sso                # optional dev Keycloak for OIDC login (profile sso); pair with OIDC_ENABLED=true in .env

# Code generation
make gqlgen             # regenerate GraphQL code from schema
make swag               # regenerate Swagger/OpenAPI docs

# Run Go commands directly (from core/ directory)
cd core && go build ./...
cd core && golangci-lint run       # static analysis; config is core/.golangci.yml
make test                          # all Go tests with -race
make test PKG=./pkg/mcp/...        # single package
```

`make test` rather than a bare `go test`: `pkg/environment` validates required
settings in `init()` and reads `.env` from the working directory, which under
`go test` is the package directory. Without `JWT_SECRET_KEY`, `MONGO_URI`,
`MONGO_DATABASE`, `RABBITMQ_DEFAULT_USER` and `RABBITMQ_DEFAULT_PASS` in the
environment every package that imports it fatals before running a test. The
target fills in dummies for whichever of the five `.env` does not provide.

### CI and the lint gate

`.github/workflows/ci-core.yml` runs build, `go mod tidy -diff`,
`go test -race` and `golangci-lint` on every push and PR touching `core/**`.
`publish-core.yml` only builds and pushes the image — it is not a gate.

CI sets the five env vars inline instead of calling `make test`, because the
Makefile does a hard `include .env` and `.env` is untracked, so any `make`
target fails in a fresh checkout. Keep the two lists in sync when a new
required setting is added to `pkg/environment`.

`core/.golangci.yml` is kept green: a linter that fires on existing code gets
the code fixed, or stays out with a note in the config saying why. `nilerr`
and `contextcheck` are currently out and documented there — `nilerr` should be
enabled once a `repository.ErrNotFound` sentinel exists, since today's 23 hits
are almost all the deliberate "row was deleted, render null" pattern in field
resolvers. errcheck is the linter that earns the file: `go vet` does not catch
a dropped error return, which is how 21 repository constructors silently
discarded `CreateIndexes` failures.

The dev container runs air for hot reload on port 8002. GraphQL playground (Altair) is at `GET /api/v1/graphql` in development mode.

## Architecture

This is a Go backend with a hybrid REST + GraphQL API, backed by MongoDB and Redis.

**Module:** `github.com/vibe-c2/vibe-c2-core/core` (Go 1.25, code lives in `core/`)

### Request Flow

```
HTTP Request
  → Gin middleware (recovery → CORS → logger)
  → Public routes: /enroll, /login, /login/refresh, /status,
                   /auth/oidc/login, /auth/oidc/callback (only when OIDC_ENABLED)
  → JWTAuth middleware (bearer token validation)
  → Protected routes:
      REST: /login/me, /logout
      GraphQL: POST /graphql → gqlgen → @hasPermission directive → entity resolver
```

### Key Packages (`core/pkg/`)

| Package | Role |
|---------|------|
| `app/` | App struct wires all dependencies; router defines all routes |
| `auth/` | JWT + refresh token generation/validation, Redis-backed token store |
| `auth/permissions/` | RBAC role definitions (admin, user) and permission constants |
| `auth/oidc/` | OpenID Connect relying party: discovery, code exchange + PKCE, ID token verification, claim → role mapping, sealed handshake cookie. `oidctest/` is an in-process fake provider for tests |
| `controller/` | REST handlers (auth, enroll, status) |
| `graphql/` | gqlgen wiring, schema, generated code, context utils (`gqlctx`) |
| `resolver/` | GraphQL business logic, entity-scoped (user, operation) |
| `repository/` | MongoDB data access via qmgo ODM |
| `database/` | qmgo connection + `Database`/`Collection` proxies; index setup and startup verification (`indexes.go`) |
| `models/` | Domain structs with qmgo's `DefaultField` for timestamps |
| `middleware/` | JWT auth, RBAC, CORS, request logging, panic recovery |
| `cache/` | Redis cache with noop fallback |
| `environment/` | Viper-based config from `.env` |
| `logger/` | Zap structured logging; use `logger.From(ctx)` in request-scoped code |

### GraphQL

- Schema: `core/pkg/graphql/schema/schema.graphql`
- Config: `core/pkg/graphql/gqlgen.yml`
- Generated code: `core/pkg/graphql/generated/` and `core/pkg/graphql/model/` — **do not edit**
- Resolver stubs: `core/pkg/graphql/resolver/schema.resolvers.go` — **auto-generated, delegates to entity resolvers**
- Business logic: `core/pkg/resolver/` — entity-scoped resolvers (UserResolver, OperationResolver)
- Authorization: `@hasPermission(permission: "...")` directive on schema fields, implemented in `graphql/resolver/directive.go`

After editing `schema.graphql`, run `make gqlgen` to regenerate.

### Auth Model

- **Mongo `sessions` is an insert-once creation log.** One row per login: `{session_id, user_id, ip, user_agent, browser, os, device, createAt}`. The collection is never updated and never deleted by the app. It is the audit trail of who authenticated, when, from where. Mongo plays *no* role in authorization.
- **Redis is the single source of truth for *active* authorization.** Two structures, both with native TTL = `AUTH_REFRESH_TTL` (default 7d):
  - `refresh:<uid>:<hash>` — STRING `"<session_id>|<last_activity_unix>"`
  - `session_index:<uid>` — SET of live token keys for that user
- Login mints a refresh token of the form `<user_id>.<random>`, hashes it (SHA-256), inserts the Mongo row, then writes the Redis key + index entry via a single Lua script. Login also mints the access JWT (TTL from `AUTH_ACCESS_TTL`, default 15m).
- **Rotation = single Lua CAS** in Redis (`redis_token_store.go:rotateScriptSrc`). The script GETs the old key, parses the embedded session_id (stable across rotations), writes the new key with refreshed `last_activity_unix`, updates the index, deletes the old key — all atomic. NOTFOUND is the loser-of-race / replay signal: clear cookies, return 401, no Mongo write. Concurrent rotations across pods are linearizable.
- **Refresh re-reads the user from Mongo** to mint the new access JWT with current roles/username. One Mongo read per refresh (~every 15min per user) keeps role-revocation latency at one access-TTL window.
- **Expiration = native Redis TTL.** No sweeper, no expiry queue, no background goroutine, no audit on termination. The key just vanishes when its TTL hits.
- **Logout / revoke**: SMEMBERS the user index → MGET to find the token key whose value carries the target session_id → delete via Lua. No Mongo writes.
- **AdminRevokeSession** by id: Mongo `findByID` to learn `user_id`, then the same delete-by-session_id flow.
- **Status / lastActivityAt are derived fields.** The resolver pages Mongo rows and decorates each one with `is_active=true` (and `last_activity_at` from Redis) iff a corresponding Redis entry exists. Inactive sessions render `last_activity_at = null`. `models.Session.Status` and `LastActivityAt` are bson `-` (never persisted).
- **GraphQL `activeOnly: true`** path: ListByUser from Redis to get live session_ids, then `find({session_id: $in})` in Mongo. Bounded by the active set size.
- **CSRF**: stateless double-submit. Login/refresh sets a non-httpOnly `csrf_token` cookie; the SPA echoes it in `X-CSRF-Token` on every state-changing request; `pkg/middleware/csrf.go` enforces. Defense in depth on top of `SameSite=Strict` (prod). `/login` and `/enroll` are exempt.
- **No max-sessions enforcement.** Unlimited sessions per user.
- **No termination reasons.** Anyone needing per-termination detail subscribes to the event bus (`SessionTerminatedEvent` carries the reason string).
- **Mongo `sessions` retention**: unbounded, no TTL. Revisit when it becomes a problem.
- First admin created via `/api/v1/enroll` (not env vars).
- Two roles: `admin` (wildcard), `user` (read + update own profile).

### OIDC / single sign-on (optional)

- Off unless `OIDC_ENABLED=true`. Any discovery-compliant provider; Keycloak is the reference (`make sso` starts a dev instance with realm import from `deploy/keycloak/`). Full design: `docs/oidc-auth-design.md`.
- **SSO only changes authentication.** `GET /auth/oidc/login` seals `{state, nonce, pkce_verifier, return_to}` into an AES-GCM httpOnly cookie (`oidc_handshake`, 10 min, key derived from `JWT_SECRET_KEY` with the `oidc-handshake` label) and redirects to the provider. `GET /auth/oidc/callback` opens + clears the cookie, checks state, exchanges the code with PKCE, verifies the ID token and nonce, merges `/userinfo` claims, then calls the same `IssueSession` as password login. From there the session is a normal vibe session (Redis refresh, CSRF, `/login/me`).
- **Provisioning is JIT**: accounts are keyed by `(oidc.issuer, oidc.subject)` (partial unique index). Roles come from `OIDC_ROLES_CLAIM` through `OIDC_ROLE_MAPPING` → `OIDC_DEFAULT_ROLES`, validated at boot, and are **re-synced on every SSO login** (provider is source of truth; local role edits last until then). No mapped role and no default → login denied.
- SSO accounts have `auth_source=oidc`, no password; `POST /login`, `updateUser.password/username` and `updateOwnProfile.password/username` refuse them. `AUTH_LOCAL_LOGIN_ENABLED=false` hides the password form (403 on `/login`) and is only accepted together with OIDC. `/enroll` is unaffected.
- Provider tokens are never stored. Provider outage at boot is non-fatal: `/status.oidc.unavailable_reason` is set, the SPA disables the SSO button, discovery retries on the next attempt.
- Nothing URL-shaped is configured on our side: `redirect_uri` is derived per request (`oidc.RedirectURI`: scheme/host from `X-Forwarded-*` or the request, fixed path `/api/v1/auth/oidc/callback`) and sealed into the handshake so the token exchange repeats it. The post-login origin is the `Referer` origin when it is in `CORS_ALLOWED_ORIGINS`, else the API origin (`oidc.SPAOrigin`). Register `<public origin>/api/v1/auth/oidc/callback` at the provider.
- Callback failures redirect to `<spa origin>/login?error=sso_*` (codes in `controller/oidc_controller.go`, messages in `frontend/src/lib/sso-errors.ts`); details only in the server log.
- `/status` also returns `local_login_enabled` and `oidc{enabled, display_name, login_url, unavailable_reason}`; `login_url` is relative to the `/api/v1` base the SPA already prefixes.

### Dependency Injection

`App` in `app/app.go` constructs all services and passes them explicitly — no global singletons. Repositories, auth provider, cache, and logger are composed at startup and threaded through controllers/resolvers.

### Interface Contracts

All major components are interface-based: `IAuthProvider`, `IUserRepository`, `IOperationRepository`, `Database`, `Collection`, `Cache`, `TokenStore`, `IUserResolver`, `IOperationResolver`. New implementations must satisfy these interfaces.

**Indexes are declared per repository and verified at startup.** A constructor
calls `db.EnsureIndexes(ctx, collection, models)` rather than
`coll.CreateIndexes`. `EnsureIndexes` returns nothing on purpose: constructors
are single-value, and an error return would just be dropped at every call site
— which is the bug it replaced. Failures are recorded on the `Database` and
`NewApp` drains them via `IndexSetupErr()`, refusing to boot. A failed index
build is fatal because Mongo answers the query anyway, by scanning the
collection: the service looks healthy and just gets slower as data grows. The
usual cause is a changed definition rejected with `IndexOptionsConflict`, which
needs a deliberate drop or migration. See `pkg/database/indexes.go`.

### Per-request caches

Two request-scoped caches accelerate list and tree queries, and **"request"
means one GraphQL operation, not one HTTP request**:

- `gqlctx.WithOperationMemo` / `gqlctx.LoadOperation` — almost every resolver
  authorizes against its operation, and a list response does so once per row,
  all fetching the same document. Authorize through `LoadOperation`, not
  `operationRepo.FindByID`, or the fetch is not shared. The exception is a
  re-read after a write (`operation_resolver.go` does this): the memo would
  return the pre-write copy, so those stay on `FindByID`.
- `resolver.WikiTreeLoader` — lets a tree query hand precomputed `childCount`
  and ancestor values to the per-document field resolvers.

Both are attached by the `AroundOperations` hook in `graphql/handler.go`, not by
the Gin handler. The same handler serves `POST /graphql` and `GET /graphql/ws`,
and a WebSocket request context lives as long as the socket — anything cached
there would be shared by every operation on that connection for hours.
Subscriptions are deliberately excluded for the same reason: they are
long-lived and must re-authorize per event against live reads, or a membership
revocation would never reach a connected client. REST gets the memo from
`middleware.OperationMemo()`, mounted on the wiki group only — not `v1`, which
would sweep in `/graphql/ws`.
