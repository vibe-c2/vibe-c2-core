// One-time backfill of the `content` search projection on every wiki document.
//
// WHY: `content` is the plain-text field the wiki's text index covers, and it
// is rewritten by the persistence store() callback on each content save. Until
// a recent change it collected only child text, so atom nodes contributed
// nothing — an attachment card keeps its filename in an attribute. A page whose
// body is four files projected to an empty string and could not be found by the
// name of any file on it.
//
// New and edited documents pick the filenames up on their next save. This
// script does the rest, so the fix applies to the wiki as it already exists
// rather than only to what changes from now on.
//
// SCOPE: only `content`. Reference arrays and checklist counts are left alone;
// backfill-references.ts owns those, and re-deriving credential or hash
// references here would step around the public-operation boundary that lives
// in store().
//
// SAFE TO RE-RUN: idempotent. Each document's content is recomputed from its
// current state, so running twice yields the same result.
//
// USAGE
//   Production (one-off container from the already-pulled sidecar image):
//     docker compose run --rm hocuspocus node dist/backfill-search-text.js --dry-run
//     docker compose run --rm hocuspocus node dist/backfill-search-text.js
//   Local development (from the hocuspocus/ directory):
//     MONGO_URI=... MONGO_DATABASE=... npm run backfill-search-text -- --dry-run
//
// Pass --dry-run to compute and report counts without writing.

import { MongoClient, type Document } from "mongodb";
import * as Y from "yjs";

import { extractTextFromFragment } from "./projection.js";

const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017";
const mongoDatabase = process.env.MONGO_DATABASE || "vibec2";
const dryRun = process.argv.includes("--dry-run");

/** Decode a document's content_state into the text the index should hold. */
function deriveContent(doc: Document): string {
  const buffer = doc.content_state?.buffer as Buffer | undefined;
  if (!buffer || buffer.length === 0) return "";

  const ydoc = new Y.Doc();
  try {
    Y.applyUpdate(ydoc, new Uint8Array(buffer));
    return extractTextFromFragment(ydoc.getXmlFragment("default"));
  } finally {
    ydoc.destroy();
  }
}

async function main(): Promise<void> {
  const client = new MongoClient(mongoUri);
  await client.connect();
  try {
    const collection = client.db(mongoDatabase).collection("wiki_documents");

    let processed = 0;
    let changed = 0;
    let gainedText = 0;

    const cursor = collection.find(
      {},
      { projection: { document_id: 1, content: 1, content_state: 1 } },
    );

    for await (const doc of cursor) {
      processed++;

      let content: string;
      try {
        content = deriveContent(doc);
      } catch (err) {
        // A corrupt content_state must not stop the whole backfill.
        console.warn(
          `Skipping document ${String(doc.document_id)}: failed to decode content_state:`,
          err,
        );
        continue;
      }

      const before = typeof doc.content === "string" ? doc.content : "";
      if (content === before) continue;

      changed++;
      if (before === "" && content !== "") gainedText++;

      if (!dryRun) {
        // Only `content`. Deliberately not updateAt: re-indexing is not an
        // edit, and moving the timestamp would reorder every recency list and
        // re-trigger the backup sweep for the whole wiki.
        await collection.updateOne(
          { document_id: doc.document_id },
          { $set: { content } },
        );
      }
    }

    console.log(
      `${dryRun ? "[dry run] " : ""}processed ${processed} documents, ` +
        `${changed} with different text, ${gainedText} previously unsearchable`,
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("backfill-search-text failed:", err);
  process.exitCode = 1;
});
