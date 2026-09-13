# MCP + Agent Skill: speed and token-usage review

Scope: `core/pkg/mcp` (42 tools, resources, prompts, generated skill) and the
sidecar paths it depends on (`pkg/wiki/hocuspocus_client.go`,
`hocuspocus/src/apply-markdown.ts`), plus the auth middleware every call passes
through. Reviewed 2026-09-13 against the current tree.

Measured (built the server in a test and listed tools over an in-memory client):

| Surface | Size | Paid when |
|---|---|---|
| `tools/list` schema, 42 tools | 40.4 KB (~10k tokens) | every turn, unless the client prompt-caches |
| `instructions` string | 2.0 KB (~500 tokens) | every turn |
| `SKILL.md` | 6.0 KB (~1.5k tokens) | every turn once installed |
| `reference/tools.md` | 11.3 KB | when the agent opens it |
| `reference/workflows.md` | 13.5 KB | when the agent opens it |
| `vibe://guide` resource | 30.4 KB (~7.5k tokens) | when a fresh agent follows the instructions and reads it |
| Max single tool response | 60 KB (~15k tokens) | per call |
| Max wiki body in one read | 40 KB (~10k tokens) | per `get_wiki_document` |

Overall verdict: the design is already deliberately token-aware (compact JSON,
views instead of models, snippets, outline/section reads, edit-by-snippet,
truncation notes). The remaining cost is concentrated in five places: the tool
schema size, the whole-page default read, the duplicated guidance, sequential
per-call I/O in the dispatcher, and N+1 lookups in a few handlers.

---

## Priority list

| # | Problem | Impact | Effort |
|---|---|---|---|
| P1 | `get_wiki_document` sends up to 40 KB by default; the "use outline" hint arrives after the cost is paid | tokens, high | low |
| P2 | Tool schema is 40 KB across 42 tools with heavily repeated field prose and near-duplicate tools | tokens per turn, high | medium |
| P3 | Every call does 6 to 9 sequential network hops before and after the handler; operation is loaded twice; audit insert blocks the response | latency, high | medium |
| P4 | Wiki reads go Mongo (full `content_state`) then HTTP to the sidecar to render markdown, on every read and every edit | latency, high | medium |
| P5 | `edit_wiki_document` is read-modify-replace of the whole page, computed from the persisted state rather than the live doc | latency + correctness | medium |
| P6 | Guidance is duplicated three ways (instructions, SKILL.md, guide resource) and `tools.md` repeats the schema the client already has | tokens, medium | low |
| P7 | N+1 lookups in `get_task`, `get_timeline`; full-document loads for tree, summary, template listing | latency, medium | low |
| P8 | `list_wiki_tree` has no paging or subtree filter, so a large wiki is silently halved and the rest is unreachable | tokens + agent behaviour | low |
| P9 | Hash listing returns full hash values; long formats blow the budget to a dozen rows | tokens, medium | low |
| P10 | Orientation costs two calls (`get_user_focus` then `get_operation_summary`); summary runs five counts serially | latency, low | low |

---

## P1. Whole-page read is the default

**Where:** `tools_wiki_read.go` `handleGetWikiDocument`, `views.go` `truncateBody`.

**Problem.** Without arguments the tool returns the body up to 40 KB. The
outline hint is appended only when the page exceeds 8 KB, and it is appended to
a response that already carries the full 40 KB. A model that follows the skill
literally ("read the page first") pays ~10k tokens per read of any large page,
then usually reads it again after editing despite the skill saying not to.

**Solutions.**

1. Invert the default above a threshold. For pages larger than
   `outlineHintBytes` (8 KB), return the outline plus the preamble and a note,
   and require `full:true` to get the body. Small pages keep the current
   behaviour. This alone removes most of the wasted read tokens.
2. Add `max_bytes` (clamped to 40 KB) so an agent that wants "the first few
   paragraphs" can ask for 4 KB.
3. Lower `maxWikiBodyBytes` for the default path to 16 KB. The 40 KB ceiling
   can stay for `full:true`.
4. Make `search_wiki` hits carry `bytes` so the agent can choose outline vs full
   before opening.

## P2. Tool schema size and count

**Where:** all `tools_*.go`, `args_host.go`, `views.go`.

**Problem.** 42 tools, 40 KB of JSON. The two host tools alone are 6.6 KB
because the interface, route and login sub-schemas are inlined into each. The
phrase "Defaults to whatever the operator currently has open." appears in about
twenty field descriptions, "(default 25, maximum 50)" in six, and most `*_id`
fields say where the id comes from. Tool descriptions carry behavioural advice
("Prefer this over...", "propose this rather than deciding") that is repeated in
SKILL.md. More tools also means worse tool selection, independent of tokens.

**Solutions.**

1. **Shorten field prose.** State the focus default once in instructions and
   once in SKILL.md; make the field description `"Operation id. Omit to use the
   operator's current operation."` or shorter. Same for limit/cursor. Target:
   under 25 KB with no loss of meaning.
2. **Move advice out of descriptions.** Keep a description to what the tool
   does and its one non-obvious constraint. Guidance on *when* to prefer it
   belongs in SKILL.md, which is loaded once, not in the schema, which is
   loaded every turn.
3. **Collapse near-duplicate tools** (42 → about 33):
   - `append_wiki_section` + `prepend_wiki_section` → `add_wiki_section`
     with `position: "end" | "start"` (default end).
   - `assign_task_to_me` + `unassign_task_from_me` → `set_task_assignment`
     with `assigned: bool`.
   - `add_task_wiki_reference` + `add_task_credential_reference` →
     `link_task` taking `wiki_ids` and `credential_ids`, which mirrors the
     shape `create_task` already has.
   - `create_wiki_document_from_template` → optional `template_id` on
     `create_wiki_document`.
   - `update_hash` + `mark_hash_cracked` can stay; the skill relies on the
     distinction.
4. **Share sub-schemas** for interface/route/login via `$defs` if the SDK
   emits them; otherwise trim the three per-field descriptions to one line
   each. Saves about 3 KB.
5. Keep `IdempotencyKey` but shorten its description to one clause.

## P3. Sequential per-call I/O in the dispatcher

**Where:** `middleware/api_key.go` `authenticateAgentKey`, `dispatch.go`
`register`/`record`, `ratelimit.go`, `auth.go` `authorizeOperation`, every
resolver's `authorizeForOperation`.

**Problem.** A trivial read such as `get_host` performs, in sequence:

1. Mongo: agent key by key id
2. Mongo: owner user by id
3. Redis: idempotency GET (only when a key is passed)
4. Redis: rate-limit INCR (one for reads, two for writes)
5. Redis: focus GET (when `operation_id` is omitted)
6. Mongo: operation `FindByID` in `authorizeOperation`
7. Mongo: the same operation again inside the resolver's `authorizeForOperation`
8. Mongo: the entity itself
9. Mongo: audit `Insert`, synchronous, before the response is written
10. RabbitMQ publish

That is eight to ten dependent round trips for one record. Steps 6 and 7 load
the same document. Step 9 sits on the critical path even though it is declared
best-effort.

**Solutions.**

1. **Cache the agent-key + owner pair** for 30 to 60 s (Redis or an in-process
   LRU keyed by key id, invalidated on disable/delete/rotate). Removes two Mongo
   hits per call. The enabled/active flags are the only things that change, and
   the revocation paths can evict.
2. **Request-scoped operation memo.** Put a small loader in the context (the
   resolvers already have a per-request loader for child counts) so
   `authorizeOperation` and `authorizeForOperation` share one fetch.
3. **Make the audit write asynchronous.** Hand `auditEntry` to a bounded
   channel drained by one goroutine with a detached context; drop with a
   counter when the buffer is full. The response no longer waits on Mongo. If
   ordering per key matters, keep a single writer.
4. **One Redis round trip for rate limiting.** Use a pipeline or a Lua script
   that bumps both counters and returns both values; the current code does two
   INCRs for writes.
5. Skip the focus read when the key is scoped to exactly one operation and
   that operation is the only candidate.

## P4. Wiki reads render through the sidecar every time

**Where:** `tools_wiki_read.go` `documentMarkdown`, `wiki/hocuspocus_client.go`
`YjsToMarkdown`.

**Problem.** Every `get_wiki_document`, outline, section, and edit loads the
full document from Mongo including the Y.js `content_state` binary, ships that
binary to the sidecar over HTTP, and the sidecar decodes a Y.Doc and serialises
markdown. An agent editing a page three times renders it three times, and an
outline call costs the same as a full read server-side.

**Solutions.**

1. **Cache rendered markdown** keyed by `(document_id, content_state_at)` or a
   hash of `content_state`, in Redis with a short TTL (a few minutes). The
   sidecar persists `content_state_at`, so staleness is detectable without
   parsing. This is the content-hash cache pattern; hit rate during an editing
   session will be high.
2. **Sidecar-side read endpoint** that renders from the live in-memory Y.Doc
   when the page is open, avoiding the Mongo `content_state` transfer entirely
   and always reflecting what the operator sees.
3. **Project out `content_state`** from Mongo reads that do not need it
   (see P7). The outline path needs markdown, so it still renders, but it
   should render from the cache.

## P5. `edit_wiki_document` is whole-page replace from persisted state

**Where:** `tools_wiki_write.go` `handleEditWikiDocument`,
`hocuspocus/src/apply-markdown.ts` `spliceFragment`.

**Problem.** The edit reads markdown rendered from the *persisted*
`content_state`, applies `strings.Replace`, and sends the whole body back with
mode `replace`. The sidecar re-parses the whole body into blocks and splices the
differing middle against the *live* doc. Two consequences:

- Cost: a one-line change on a 200 KB page moves 400 KB between services and
  re-parses the page twice.
- Correctness: the sidecar debounces persistence, so the agent may compute its
  replacement from text older than what the operator is typing. The splice then
  rewrites every block between the first and last differing block, which can
  revert the operator's in-flight change in that range. The skill's claim that
  "edit, append and prepend all merge" is only true for append and prepend.

**Solutions.**

1. Add an **`edit` mode to `apply-markdown`** that takes `old_text`,
   `new_text`, `replace_all` and performs the match and replacement inside the
   Y.js transaction against the live fragment, touching only the block(s) that
   contain the match. One hop, no stale read, true merge, and the Go side stops
   needing the rendered body at all for edits. `diagnoseNoMatch` moves to the
   sidecar or is replicated there.
2. Until then, at minimum re-render from the sidecar's live doc (P4.2) rather
   than persisted state so the base is not stale.

## P6. Guidance duplicated three ways; `tools.md` repeats the schema

**Where:** `mcp.go` `serverInstructions`, `skillassets/SKILL.md.tmpl`,
`skill.go` `GuideText`/`renderToolsReference`, `resources.go`.

**Problem.**

- `serverInstructions` (2 KB, every turn) restates nine rules that SKILL.md
  also states (1.5k tokens, every turn). With the skill installed, ~2k tokens
  per turn are redundant.
- `reference/tools.md` (11 KB) is the tool descriptions again. The client
  already sent them in the schema. An agent that opens it pays twice.
- `vibe://guide` (30 KB) is SKILL.md + tools.md + workflows.md flattened, and
  the instructions tell a first-time agent to read it. That is 7.5k tokens for
  a fresh session, half of it a copy of the schema.
- `workflows.md` is one 13.5 KB file, so progressive disclosure stops at file
  granularity: an agent wanting "how do I change a page" also loads the icon
  palette, the task-linking rules and the attachment guidance.

**Solutions.**

1. Cut `serverInstructions` to identity, scope, "results are capped", and the
   pointer to the guide. Target 700 to 900 bytes. The behavioural rules live in
   SKILL.md; for clients without skills, in the guide resource.
2. Replace `tools.md` with a **one-line index**: group intro plus `name —
   six words`. Keep the write marker. Target 3 KB.
3. Split `workflows.md` into `reference/wiki.md`, `reference/findings.md`,
   `reference/tasks.md`, `reference/attachments.md`, `reference/icons.md`, and
   list them in SKILL.md with a one-line "open when" each.
4. Offer the guide as several resources (`vibe://guide`, `vibe://guide/wiki`,
   ...) mirroring the files, and drop the tool reference from the flattened
   guide.
5. Drop the "Generated from server version ... describing N tools" paragraph
   from SKILL.md into a comment; the agent does not need it every turn.

## P7. N+1 lookups and over-fetching

**Where:** `tools_tasks.go` `namedWikiReferences`/`namedCredentialReferences`,
`tools_timeline.go` `handleGetTimeline`, `tools_wiki_read.go`
`handleListWikiTree`, `tools_operations.go` `handleGetOperationSummary`,
`repository/wiki_document_repository.go` `FindAllByOperationID`.

**Problems.**

- `get_task` fetches each referenced wiki page through the resolver: one
  operation lookup plus one full document (with `content_state`) per reference,
  to obtain a title. Ten references is 20+ queries and possibly megabytes.
- `get_timeline` calls `ActorLabel` per event, which does a user lookup per
  event: 50 events, 50 queries.
- `list_wiki_tree`, the template listing, and the summary's page count all use
  `FindAllByOperationID`, which returns every document with `content_state` and
  the search projection, to produce titles or a count.
- `get_operation_summary` runs five count queries one after another.

**Solutions.**

1. Add `FindTitlesByIDs(ids)` with a `{document_id, title}` projection and use
   it in `get_task`; same for credentials (`{credential_id, name}`).
2. In `get_timeline`, collect distinct `ActorID`s, one `FindByIDs`, then label
   in memory.
3. Give `FindAllByOperationID` a projection that excludes `content_state` and
   `content` (or add `FindTreeByOperationID`), and use a `CountDocuments` for
   the summary.
4. Run the five summary counts concurrently with an `errgroup`.

## P8. `list_wiki_tree` cannot page or scope

**Where:** `tools_wiki_read.go` `handleListWikiTree`, `budget.go` `fit`.

**Problem.** The tree is returned whole and then halved by `fit` until it is
under 60 KB. There is no cursor and no subtree argument, so on a large wiki the
agent sees the first half and a note, with no way to reach the rest. The
halving is also coarse: a 61 KB result becomes 30 KB when trimming a few rows
would have fitted.

**Solutions.**

1. Add `parent_id` and `depth` arguments (default: top two levels), and a
   cursor.
2. Return `childCount` per row so the agent knows where to descend.
3. In `fit`, after the halving loop, binary-search back up between the last
   failing and last passing size, or trim one row at a time once under 2×.

## P9. Hash listing returns full values

**Where:** `views.go` `hashView`, `tools_hashes.go`.

**Problem.** `find_hashes` rows carry the whole hash. NTLM is 32 chars, but
Kerberos tickets, sha512crypt and NetNTLMv2 blobs run 200 B to 4 KB each. Fifty
of those exceed the budget and `fit` drops to 12 or 6 rows, so the agent pages
through a dump in tiny slices.

**Solutions.**

1. In the list view, return `valuePrefix` (first 24 chars), `length`, and
   `format` if known; keep the full value on `get_hash`.
2. Add a `status` filter to `find_hashes` so "what is cracked" does not page
   through everything.

## P10. Orientation costs two calls; summary is serial

**Where:** `tools_focus.go`, `tools_operations.go`.

**Problem.** The skill's opening move is `get_user_focus` then
`get_operation_summary`. Both are cheap in tokens but each is a full dispatcher
round trip (P3), and the summary itself does five serial queries.

**Solutions.**

1. Include the summary counts in `get_user_focus` when an operation is in
   focus (or add an `orient` tool that returns focus + summary + role). One
   call instead of two.
2. When `resolveOperation` fails for a multi-scoped key, include the candidate
   operation ids and names in the error instead of telling the agent to call
   `list_operations`. The scope list is already on the key.

---

## Smaller notes

- Per-call notes such as "This is one section, not the whole page..." and the
  outline size note are repeated on every call. They are cheap (~40 tokens)
  and prevent an expensive mistake; keep them, but shorten to one sentence.
- `wikiWriteResultView.Note` ("The operator has this page open and saw your
  edit appear.") can be a boolean the skill explains once.
- `MaxResponseBytes` of 60 KB is about 15k tokens per call. Consider 32 KB as
  the default and let a `limit` request raise it; most lists are read for a
  handful of rows.
- Prompts (`triage_findings` and friends) are well shaped and cheap. No change.
- Idempotency and rate limiting cost one Redis hop each; fine once P3.4 lands.
- Timestamps are RFC3339 with seconds; acceptable. Dropping `updatedAt` from
  list rows unless requested would save ~30 bytes per row.

## Suggested order of work

1. P1 (default outline above 8 KB) and P9 (hash prefix): a day, biggest token
   win per line changed.
2. P3.1 to P3.3 (auth cache, request-scoped operation memo, async audit):
   largest latency win, no contract change.
3. P6 (trim instructions, index-only tools.md, split workflows): no code risk,
   cuts fixed per-turn cost.
4. P2 (schema trim, tool merges): contract change for installed agents, so do
   it in one release with a skill regeneration.
5. P4 + P5 (markdown cache, sidecar edit mode): the wiki path becomes one hop
   and edits stop being whole-page replaces.
6. P7, P8, P10 as follow-ups.

---

## Status (2026-09-13): P1, P2, P3, P4, P5, P6, P9 implemented

Measured the same way as above, after the changes:

| Surface | Before | After |
|---|---|---|
| Tool schema | 42 tools, 40.4 KB | 38 tools, 26.9 KB |
| Instructions string | 2.0 KB | 0.85 KB |
| SKILL.md | 6.0 KB | 3.8 KB |
| `reference/tools.md` | 11.3 KB (descriptions again) | 4.3 KB (index) |
| Workflow references | one 13.5 KB file | five files, 0.9 to 3.4 KB each |
| `vibe://guide` | 30.4 KB | 7.7 KB, plus `vibe://guide/{wiki,findings,tasks,attachments,icons}` on demand |
| Default read of a page over 8 KB | body, up to 40 KB | outline, a few hundred bytes |
| Hash listing row | full value | first 48 chars plus `valueLength` |

Per-call I/O for a read such as `get_host`, before and after:

| Step | Before | After |
|---|---|---|
| Agent key + owner | 2 Mongo reads | 1 Redis read (30 s TTL, evicted on every key mutation) |
| Operation for authorization | 2 Mongo reads (tool + resolver) | 1, shared through a request-scoped memo |
| Focus lookup | 1 Redis read | skipped when the key has exactly one scope |
| Rate-limit counters on a write | 2 sequential Redis calls | 2 concurrent |
| Audit row + event | synchronous, before the response | queued, written by a worker, drained at shutdown |

Wiki path:

- Rendered markdown is cached per document in Redis against the persistence
  stamp (`content_state_at` plus state length) and evicted by every write
  through the tools, so repeated reads of a page render once.
- `edit_wiki_document` is one hop. The sidecar's `apply-markdown` gained an
  `edit` mode that matches `old_text` against the live document inside the
  Y.js transaction and splices only the changed blocks. The Go side no longer
  renders the page or sends the body back, and the base can no longer lag what
  the operator is typing. The no-match diagnostics moved to the sidecar.

Tool surface changes (installed skills must be regenerated):

- `append_wiki_section` + `prepend_wiki_section` → `add_wiki_section` with `position`.
- `assign_task_to_me` + `unassign_task_from_me` → `set_task_assignment` with `assigned`.
- `add_task_wiki_reference` + `add_task_credential_reference` → `link_task` with `wiki_ids` and `credential_ids`.
- `create_wiki_document_from_template` → `template_id` on `create_wiki_document`.
- `get_wiki_document` gained `full`; `find_hashes` gained `status`.

Deployment notes:

- Core and the Hocuspocus sidecar must ship together: the edit tool depends on
  the sidecar's `edit` mode and returns an error against an older sidecar.
- Agent-key changes (disable, rotate, rescope, delete) take effect immediately
  through cache eviction. Changes to the owner (deactivation, role edits) reach
  agent traffic within 30 seconds.

Verification: `make test` (whole core module, race detector) passes;
`npm run typecheck` and `npm test` in `hocuspocus` pass (166 tests, 8 new for
edit mode); `go vet ./...` clean. New Go tests cover the edit client's answer
mapping, the operation memo, auth-cache eviction on every mutation, the
middleware cache hit path and its refusal of a wrong secret, the markdown
cache's stamp validation and eviction, and the outline-by-default decision.

## Status (2026-09-13, later): P7, P8, P10 implemented; timeline milestones added to the skill

- **P7.** `get_task` names its references through two projected queries
  (`FindTitlesByIDs`, `FindNamesByIDs`) instead of one full document or
  credential per reference. `get_timeline` labels actors with one batched user
  lookup (`ActorLabels`). The tree, the template listing and the wiki count
  read through `FindSummariesByOperationID` and `CountByOperationID`, which
  project out `content` and `content_state`. The five summary counts run
  concurrently.
- **P8.** `list_wiki_tree` returns depth-first rows with `childCount`, shows
  two levels by default, takes `parent_id` to descend and `depth:-1` for
  everything, and pages with a cursor (default 100, max 250 rows). The budget
  fit binary-searches back up after halving, so a page just over budget loses
  the rows that do not fit rather than half of them.
- **P10.** `get_user_focus` carries the focused operation's counts, so
  orienting is one call. A multi-scoped key that omits `operation_id` is told
  the candidate operations by name and id instead of being sent to
  `list_operations`.
- **Skill.** SKILL.md gained a "put milestones on the timeline" rule and
  `findings.md` a section on what counts as one (a DC owned, a foothold lost,
  a login form patched, a credential that opened a new segment), how to name
  it, and what not to record. `create_timeline_event`'s description says the
  same in one sentence.

New MCP dependencies: `WikiDocRepo` and `CredentialRepo` (wired in
`router.go`). New repository methods carry no behaviour change for GraphQL.

Sizes after this round: 38 tools, 27.5 KB schema; SKILL.md 4.1 KB;
`findings.md` 2.4 KB; guide 8.2 KB. Verification: `make test` for the whole
core module passes, `go vet ./...` clean; new tests cover the tree walk, depth
cut-off, subtree, cursor round trip and continuation, and the finer fit.
