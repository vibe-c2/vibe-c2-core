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

# Code generation
make gqlgen             # regenerate GraphQL code from schema
make swag               # regenerate Swagger/OpenAPI docs

# Run Go commands directly (from core/ directory)
cd core && go build ./...
cd core && go test ./...
cd core && go test ./pkg/auth/...   # single package
```

The dev container runs air for hot reload on port 8002. GraphQL playground (Altair) is at `GET /api/v1/graphql` in development mode.

## Architecture

This is a Go backend with a hybrid REST + GraphQL API, backed by MongoDB and Redis.

**Module:** `github.com/vibe-c2/vibe-c2-core/core` (Go 1.25, code lives in `core/`)

### Request Flow

```
HTTP Request
  → Gin middleware (recovery → CORS → logger)
  → Public routes: /enroll, /login, /login/refresh, /status
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
| `controller/` | REST handlers (auth, enroll, status) |
| `graphql/` | gqlgen wiring, schema, generated code, context utils (`gqlctx`) |
| `resolver/` | GraphQL business logic, entity-scoped (user, operation) |
| `repository/` | MongoDB data access via qmgo ODM |
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

### Dependency Injection

`App` in `app/app.go` constructs all services and passes them explicitly — no global singletons. Repositories, auth provider, cache, and logger are composed at startup and threaded through controllers/resolvers.

### Interface Contracts

All major components are interface-based: `IAuthProvider`, `IUserRepository`, `IOperationRepository`, `Database`, `Collection`, `Cache`, `TokenStore`, `IUserResolver`, `IOperationResolver`. New implementations must satisfy these interfaces.
