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

- Login returns JWT access token (15min prod / 24h dev) + opaque refresh token (7 days, Redis-stored as SHA-256 hash)
- Max 10 sessions per user; replay detection invalidates all sessions on failed refresh
- First admin created via `/api/v1/enroll` (not env vars)
- Two roles: `admin` (full access), `user` (read + update own profile)

### Dependency Injection

`App` in `app/app.go` constructs all services and passes them explicitly — no global singletons. Repositories, auth provider, cache, and logger are composed at startup and threaded through controllers/resolvers.

### Interface Contracts

All major components are interface-based: `IAuthProvider`, `IUserRepository`, `IOperationRepository`, `Database`, `Collection`, `Cache`, `TokenStore`, `IUserResolver`, `IOperationResolver`. New implementations must satisfy these interfaces.
