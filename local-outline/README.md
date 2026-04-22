# local-outline

Isolated [Outline](https://www.getoutline.com/) stack for reference use by the
vibe-c2-core wiki work. **Not wired to the main project** — runs on its own
compose project, network, Postgres, and Redis.

## Why

Outline is the design inspiration for our wiki (`docs/wiki-feature-spec.md`).
Having it running locally lets us:

1. Compare feature behaviour (slash commands, mentions, embeds, permissions,
   export flows) while we reimplement equivalents in our TipTap editor.
2. Capture markdown exports as fixtures to validate our future markdown
   importer against a canonical source.

## One-time setup

Prereqs on the host: Docker and `openssl`. (`make hash` runs `htpasswd`
inside a throwaway `httpd:2.4-alpine` container, so you don't need apache
installed on the host.)

```bash
cd local-outline
cp .env.example .env

# 1. Generate the three hex secrets.
make secrets         # copy the output lines into .env

# 2. Generate the bcrypt hash for your admin password.
make hash PASSWORD=yourpassword   # copy the OUTLINE_DEX_ADMIN_HASH line into .env

# 3. Set OUTLINE_POSTGRES_PASSWORD in .env to anything non-default.

# 4. Make Dex's issuer hostname resolvable from your browser.
echo "127.0.0.1 outline-dex" | sudo tee -a /etc/hosts
```

Why the `/etc/hosts` line: Dex's OIDC issuer URL is
`http://outline-dex:5556/dex`. Inside Docker the name `outline-dex` resolves
via compose DNS; on the host (where your browser runs) it does not. Adding
the entry makes the browser reach the same Dex that Outline's server reaches,
so the issuer matches on both sides.

## Daily use

```bash
make up           # boot the stack
```

Open <http://localhost:3001>:

1. Click **Continue with Local**.
2. Dex login page → email `admin@local.test`, password = whatever you passed to `make hash`.
   (The `.test` TLD is reserved for local/testing use per RFC 2606 and Outline's email validator requires a real-looking address.)
3. Outline onboarding runs once (team name, etc.).

```bash
make logs         # tail Outline logs
make down         # stop, keep data
make reset        # stop and wipe volumes
```

## Markdown export test workflow

When we're ready to build our wiki's markdown importer:

1. In Outline, create a reference document exercising the features we care
   about — headings, lists, tables, code blocks, images, callouts, mentions,
   embeds, nested docs.
2. Document menu → Download → Markdown.
3. Save the `.md` file under `local-outline/fixtures/` (gitignored by default;
   add specific files explicitly if you want them tracked).
4. Feed those files through the importer under test; diff the resulting
   rendered document against the Outline source.

## Ports

| Port | Service |
|------|---------|
| 3001 | Outline web UI |
| 5556 | Dex OIDC (browser hits this during login) |

Chosen to avoid collisions with the main vibe-c2-core stack (which uses
8080, 27018, 6379, 5672, 15672).

## Isolation guarantees

- Own compose project (`name: local-outline`) — containers, volumes, and
  network are prefixed `local-outline_*` / `local-outline-*`.
- Own Postgres and Redis — no dependency on `vibec2-redis` / `vibec2-mongodb`.
- Zero edits to the main project's `docker-compose.yml`, `Makefile`, or
  `.env`. You can run `make services` at the repo root and `make up` here
  concurrently without interference.
