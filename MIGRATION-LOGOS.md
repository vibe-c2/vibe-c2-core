# Production migration: vibe-c2-core -> Logos images

Runbook for moving this deployment onto `ghcr.io/logos/*` images. Measured
against this deployment on 2026-09-24: 1 user, 1 agent key, 0 API keys,
24 wiki documents, 4 credentials, 8 tasks, 0 registered channel modules,
0 messages in flight.

Your data is **not** rewritten by this migration. Nothing in Mongo changes
shape, so rollback is bringing the old stack back up.

---

## What actually breaks, and why

| Change | Effect | Action |
| --- | --- | --- |
| `auth.Issuer` `vibe-c2` -> `logos`, validated on every parse | every access + refresh token is rejected | users log in again |
| API/agent key prefix `vc2_`/`vca_` -> `lgs_`/`lga_` | old raw tokens fail the prefix check | holder rewrites the prefix; **no re-issue** |
| AMQP namespace `vibe.*` -> `logos.*` | new durable exchanges/queues declared at boot | upgrade core + every channel **together** |
| Wiki export markers (`.vibewiki.zip`, `vibe-wiki-bundle`, `vibe:meta`) | previously exported archives no longer import | re-export before migrating, if you need them |

Not affected: Mongo schema, blob storage, bucket names (`wiki-images`,
`wiki-files`, `skills` — all brand-free), document content, credentials, tasks.

---

## 0. Back up first

This is the only irreversible risk. The stack must be down for a consistent copy.

```sh
docker compose down
for v in mongodb rabbitmq redis seaweedfs_master seaweedfs_filer seaweedfs_volume; do
  docker run --rm -v vibe-c2-core_${v}_data:/from -v "$PWD/backup":/to alpine \
    tar czf /to/${v}.tar.gz -C /from .
done
```

## 1. Leave `.env` alone

Infra credentials live **inside** the volumes. `.env.example` now ships `logos`
defaults, but `.env` is gitignored and your values are authoritative. Do not
"update" these to match the new example or Mongo will authenticate against a
database that does not exist:

`MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_DATABASE`, `MONGO_DATABASE`,
`MONGO_URI`, `RABBITMQ_DEFAULT_USER`, `RABBITMQ_ERLANG_COOKIE`,
`SEAWEEDFS_S3_ACCESS_KEY` — all stay `vibec2`.

No environment variable was *renamed*, so nothing else needs editing.

## 2. Deploy this build first, then swap

This release is the migration. It is deployed the ordinary way, on the old
images, and it does three things that make the later image swap a plain image
swap:

- **writes** chips and credential fences under the current spellings
  (`logos://`, ```` ```logos-credential ````)
- **reads** either spelling, so pages written before it keep working
- **backfills** the derived markdown of every wiki document and backup at
  startup, via `runStartupBackfills` in `core/pkg/app/bootstrap.go`

The backfill matters because `wiki_documents.content` is what the CRDT rebuild
path reads. A page whose Y.js state has to be reconstructed is reconstructed
from that markdown, so a body left on the old spelling would lower its chips
into plain links and code fences — permanently. Chips themselves are stored
structurally (`wikiHostReference` and friends carry only an id), so nothing in
`content_state` needs touching.

```sh
docker compose up -d --build            # or pull the released tag
docker compose logs core-dev | grep 'reference scheme backfill'
```

Expect one line per collection that had rows to fix, e.g.
`wiki reference scheme backfill complete {"rows": 128}`. A second boot logs
nothing: the filter only matches rows still carrying an old spelling.

Confirm there is nothing left before moving on:

```sh
docker exec vibec2-mongodb mongosh --quiet -u "$MONGO_INITDB_ROOT_USERNAME" \
  -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin "$MONGO_DATABASE" --eval '
print(db.wiki_documents.countDocuments({content:/vibe:\/\/|vibe-credential/}) + " documents, " +
      db.wiki_document_backups.countDocuments({content:/vibe:\/\/|vibe-credential/}) + " backups")'
# expect: 0 documents, 0 backups
```

Only once that reads `0 documents, 0 backups` is the stack ready for Logos
images. Nothing here is manual surgery — it is a normal deploy, and the counts
are a check, not a step.

## 2b. Re-export wiki bundles you want to keep importable

Old archives are rejected by the new importer. Do this from the running stack
before step 3, or skip it if you do not rely on old exports.

## 3. Swap the stack

```sh
docker compose -f docker-compose.yml down
docker compose -f docker-compose.logos.yml up -d
docker compose -f docker-compose.logos.yml logs -f core
```

`docker-compose.logos.yml` pins the volumes as `external` under their existing
`vibe-c2-core_*` names, so Compose attaches the real data and can neither
create nor delete it.

## 4. Log in again

Every session is gone. Optionally clear the refresh tokens rather than waiting
for them to expire:

```sh
docker exec logos-mig-redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning FLUSHDB
```

## 5. Fix the one agent key

The prefix is **not stored** — only `key_id` and `secret_hash`. The same key
works once its holder rewrites the prefix:

```
vca_<key_id>_<secret>   ->   lga_<key_id>_<secret>
vc2_<key_id>_<secret>   ->   lgs_<key_id>_<secret>
```

No database change. This deployment has 1 agent key and 0 API keys.

## 6. Delete the orphaned AMQP topology

Verified empty (0 messages) before migrating, so nothing is lost. Confirm again,
then drop them:

```sh
docker exec logos-mig-rabbitmq rabbitmqctl list_queues name messages
docker exec logos-mig-rabbitmq rabbitmqctl delete_queue    vibe.core.rpc
docker exec logos-mig-rabbitmq rabbitmqctl delete_exchange vibe.core.rpc
docker exec logos-mig-rabbitmq rabbitmqctl delete_exchange vibe.events
```

If you run channel modules, they must be on Logos images too — a channel
publishing to `vibe.channel.rpc` is not heard by a core consuming
`logos.channel.rpc`. This deployment has 0 registered modules.

## 7. Verify

```sh
curl -sk https://localhost:8443/healthz
# log in; then confirm the data is the pre-migration data:
docker exec logos-mig-mongodb mongosh --quiet -u vibec2 -p "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin vibec2 \
  --eval 'print(db.wiki_documents.countDocuments()+" docs, "+db.users.countDocuments()+" users, "+db.credentials.countDocuments()+" credentials")'
# expect: 24 docs, 1 users, 4 credentials
```

Also check a wiki page opens and edits (proves Hocuspocus + the Y.js
`content_state` round-trip), and that a file attachment downloads (proves
SeaweedFS credentials survived).


## Cosmetic leftovers (no action required)

Stale brand text inside records that are not markers and are never parsed:

| Where | What |
| --- | --- |
| `agent_actions.arguments` | historical MCP audit records |
| `wiki_files.filename` | an uploaded file whose name contains "Vibe C2 Docs" |
| wiki page body | a user-authored link to `github.com/vibe-c2`, which still resolves |

The backfill deliberately does not touch these: its filter matches only
`vibe://` and `vibe-credential`, so a link someone typed into a page is left
exactly as they wrote it.

## Rollback

Roll back to **this** release, not to one before it. Earlier builds do not know
the `logos://` spelling this one writes, so they would stop lowering chips.
