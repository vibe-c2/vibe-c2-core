// One-time backfill of the image_references / file_references arrays on every
// wiki document.
//
// WHY: these arrays are written by the persistence store() callback on each
// content save. Existing documents that haven't been re-saved since the
// reference-indexing change have no arrays yet — so the attachment garbage
// collector would see them as referencing nothing and delete still-embedded
// images/files. This script decodes each document's Y.js content_state and
// populates the arrays up front, so the sweeper can be enabled safely.
//
// SCOPE: only image_references and file_references. The doc/credential/hash
// arrays are deliberately left untouched — credential/hash references carry a
// public-operation security boundary that lives in store(), and re-deriving
// them here would risk seeding a public doc's inverse index. Attachment refs
// have no such boundary.
//
// SAFE TO RE-RUN: idempotent. Each document is overwritten with the arrays
// derived from its current state, so running twice yields the same result.
//
// USAGE
//   Production (one-off container from the already-pulled sidecar image —
//   inherits MONGO_URI / MONGO_DATABASE and the network from the compose
//   service, and runs on plain node since dist/ ships in the image):
//     docker compose run --rm hocuspocus node dist/backfill-references.js --dry-run
//     docker compose run --rm hocuspocus node dist/backfill-references.js
//   Local development (from the hocuspocus/ directory, tsx available):
//     MONGO_URI=... MONGO_DATABASE=... npm run backfill-references -- --dry-run
//
// Pass --dry-run to compute and report counts without writing.

import { Binary, MongoClient, type Document } from "mongodb";
import * as Y from "yjs";
import {
  collectFileReferenceIds,
  collectImageReferenceIds,
} from "./references.js";

const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017";
const mongoDatabase = process.env.MONGO_DATABASE || "vibec2";
const dryRun = process.argv.includes("--dry-run");

// Mirror of persistence.ts's uuidToBinary: qmgo (Go) serializes uuid.UUID via
// MarshalBinary, which the mongo-go-driver stores as Binary subtype 0.
function uuidToBinary(value: string): Binary {
  const hex = value.replace(/-/g, "");
  if (hex.length !== 32) {
    throw new Error(`invalid uuid: ${value}`);
  }
  return new Binary(Buffer.from(hex, "hex"), Binary.SUBTYPE_DEFAULT);
}

function idsToBinaries(ids: Iterable<string>): Binary[] {
  const out: Binary[] = [];
  for (const id of ids) {
    try {
      out.push(uuidToBinary(id));
    } catch {
      // skip malformed — a single bad id must never abort the backfill
    }
  }
  return out;
}

/** Decode a document's content_state into the image/file id sets. */
function deriveReferences(doc: Document): {
  imageIds: Set<string>;
  fileIds: Set<string>;
} {
  const buffer = doc.content_state?.buffer as Buffer | undefined;
  if (!buffer || buffer.length === 0) {
    return { imageIds: new Set(), fileIds: new Set() };
  }
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, new Uint8Array(buffer));
  const fragment = ydoc.getXmlFragment("default");
  return {
    imageIds: collectImageReferenceIds(fragment),
    fileIds: collectFileReferenceIds(fragment),
  };
}

async function main(): Promise<void> {
  const client = new MongoClient(mongoUri);
  await client.connect();
  try {
    const collection = client.db(mongoDatabase).collection("wiki_documents");

    let processed = 0;
    let updated = 0;
    let totalImageRefs = 0;
    let totalFileRefs = 0;

    const cursor = collection.find(
      {},
      { projection: { document_id: 1, content_state: 1 } },
    );

    for await (const doc of cursor) {
      processed++;
      let imageIds: Set<string>;
      let fileIds: Set<string>;
      try {
        ({ imageIds, fileIds } = deriveReferences(doc));
      } catch (err) {
        // A corrupt content_state must not stop the whole backfill — log and
        // skip so the remaining documents still get indexed.
        console.warn(
          `Skipping document ${String(doc.document_id)}: failed to decode content_state:`,
          err,
        );
        continue;
      }

      totalImageRefs += imageIds.size;
      totalFileRefs += fileIds.size;

      if (dryRun) {
        if (imageIds.size > 0 || fileIds.size > 0) {
          console.log(
            `[dry-run] ${String(doc.document_id)}: ${imageIds.size} image(s), ${fileIds.size} file(s)`,
          );
        }
        continue;
      }

      await collection.updateOne(
        { _id: doc._id },
        {
          $set: {
            image_references: idsToBinaries(imageIds),
            file_references: idsToBinaries(fileIds),
          },
        },
      );
      updated++;
    }

    console.log(
      `Backfill ${dryRun ? "(dry-run) " : ""}complete: ${processed} document(s) scanned, ` +
        `${dryRun ? 0 : updated} updated, ` +
        `${totalImageRefs} image reference(s), ${totalFileRefs} file reference(s).`,
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
