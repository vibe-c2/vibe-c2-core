// The sidecar's own writes must declare the schema they author at.
//
// Reported as "an agent edits a document and it never shows as recently
// updated". The cause was worse than the symptom: persistence.ts discards a
// write that comes from a client older than the schema which authored the
// stored content AND shrinks the document. That guard is meant for a browser
// tab left open across a deploy.
//
// A server-side write had no schema version, so it defaulted to 0 — older than
// any document a person has touched. Every agent edit that removed anything was
// therefore thrown away while the caller was told it applied: replacements: 1,
// and nothing persisted. Appends survived, which is why the bug looked like a
// missing timestamp rather than lost writes.
//
// Both server-side authoring routes must keep saying so. Run `npm test`.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { WIKI_SCHEMA_VERSION } from "../wiki-schema-version.js";
import { REBASE_SCHEMA_VERSION } from "../rebase-api.js";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..");

test("the authored schema version is a real version, never the default 0", () => {
  // 0 is what an unversioned client reports, and it is what makes the
  // stale-client guard treat a write as destructive.
  assert.ok(
    WIKI_SCHEMA_VERSION >= 1,
    "a server-side write reporting 0 is discarded on any document a person has edited",
  );
});

test("the rebase route authors at the same version", () => {
  assert.equal(REBASE_SCHEMA_VERSION, WIKI_SCHEMA_VERSION);
});

test("the markdown apply route declares its schema on the connection", () => {
  // Asserted against the source because the alternative is standing up a
  // Hocuspocus server and a Mongo. What matters is that the context carries
  // the version at all: its absence is silent, and the symptom appears
  // somewhere else entirely.
  const source = readFileSync(join(src, "apply-markdown.ts"), "utf8");
  assert.match(
    source,
    /schemaVersion:\s*WIKI_SCHEMA_VERSION/,
    "openDirectConnection must pass schemaVersion, or agent deletions are discarded",
  );
});

test("the markdown apply route passes the editing operator through", () => {
  // Same class of omission: without a user the save lands unattributed, and
  // the recently-updated list both sorts on and filters by that field.
  const source = readFileSync(join(src, "apply-markdown.ts"), "utf8");
  assert.match(source, /userId:\s*parsed\.userId/);
});
