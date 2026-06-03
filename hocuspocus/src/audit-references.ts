// READ-ONLY reference-first damage report for wiki attachments.
//
// This is the COMPLEMENT of the Go `wiki-attachment-audit` subcommand. That
// one scans metadata → storage ("do surviving metadata rows still have their
// blob?"). This one scans the other, more important direction:
//
//   document body → metadata ("does every image/file a document embeds still
//   have a metadata row?")
//
// WHY THIS DIRECTION MATTERS: when the old GC bug deleted an attachment it
// removed BOTH the blob AND the metadata row. Such an attachment leaves no
// metadata row at all, so a metadata-first scan reports zero damage even
// though the document still embeds the (now-dangling) reference — exactly the
// "image not found" symptom. To find those we must decode each document's
// Y.js content_state, collect the image/file ids it references, and flag the
// ids that have no corresponding metadata row.
//
// It NEVER writes anything. Does not depend on the backfill having run — it
// reads content_state directly.
//
// USAGE
//   Production (one-off container from the already-pulled sidecar image):
//     docker compose run --rm hocuspocus node dist/audit-references.js
//   Local development:
//     MONGO_URI=... MONGO_DATABASE=... npm run audit-references

import { Binary, MongoClient, type Document } from "mongodb";
import * as Y from "yjs";
import {
  collectFileReferenceIds,
  collectImageReferenceIds,
} from "./references.js";

const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017";
const mongoDatabase = process.env.MONGO_DATABASE || "vibec2";

// Inverse of persistence.ts's uuidToBinary: turn a stored Binary (subtype 0,
// 16 bytes, written by qmgo's MarshalBinary on the Go side) back into a
// canonical lowercase UUID string so it can be compared against the ids the
// collectors return.
function binaryToUuid(bin: Binary): string {
  const hex = Buffer.from(bin.buffer).toString("hex");
  if (hex.length !== 32) {
    throw new Error(`invalid binary uuid length: ${hex.length}`);
  }
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

/** Load the set of ids that still have a metadata row in `collectionName`. */
async function loadExistingIds(
  db: ReturnType<MongoClient["db"]>,
  collectionName: string,
  idField: string,
): Promise<Set<string>> {
  const out = new Set<string>();
  const cursor = db
    .collection(collectionName)
    .find({}, { projection: { [idField]: 1 } });
  for await (const row of cursor) {
    const raw = row[idField];
    if (raw instanceof Binary) {
      try {
        out.add(binaryToUuid(raw));
      } catch {
        // skip malformed id
      }
    }
  }
  return out;
}

interface DeadDoc {
  documentId: string;
  title: string;
  operationId: string;
  deleted: boolean;
  missingImages: string[];
  missingFiles: string[];
}

function decodeReferences(doc: Document): {
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
    const db = client.db(mongoDatabase);

    // Snapshot which attachment ids still have metadata. Anything a document
    // references that is NOT in these sets is a dangling reference.
    const liveImageIds = await loadExistingIds(db, "wiki_images", "image_id");
    const liveFileIds = await loadExistingIds(db, "wiki_files", "file_id");
    console.log(
      `metadata rows present: ${liveImageIds.size} image(s), ${liveFileIds.size} file(s)`,
    );

    const dead: DeadDoc[] = [];
    let scannedDocs = 0;
    let totalMissingImages = 0;
    let totalMissingFiles = 0;

    const cursor = db.collection("wiki_documents").find(
      {},
      {
        projection: {
          document_id: 1,
          title: 1,
          operation_id: 1,
          deleted_at: 1,
          content_state: 1,
        },
      },
    );

    for await (const doc of cursor) {
      scannedDocs++;
      let imageIds: Set<string>;
      let fileIds: Set<string>;
      try {
        ({ imageIds, fileIds } = decodeReferences(doc));
      } catch (err) {
        console.warn(
          `Skipping document ${String(doc.document_id)}: decode failed:`,
          err,
        );
        continue;
      }

      const missingImages = [...imageIds].filter((id) => !liveImageIds.has(id));
      const missingFiles = [...fileIds].filter((id) => !liveFileIds.has(id));
      if (missingImages.length === 0 && missingFiles.length === 0) {
        continue;
      }

      totalMissingImages += missingImages.length;
      totalMissingFiles += missingFiles.length;
      dead.push({
        documentId: String(
          doc.document_id instanceof Binary
            ? binaryToUuid(doc.document_id)
            : doc.document_id,
        ),
        title: typeof doc.title === "string" ? doc.title : "(untitled)",
        operationId: String(
          doc.operation_id instanceof Binary
            ? binaryToUuid(doc.operation_id)
            : doc.operation_id,
        ),
        deleted: doc.deleted_at != null,
        missingImages,
        missingFiles,
      });
    }

    report(dead, scannedDocs, totalMissingImages, totalMissingFiles);
  } finally {
    await client.close();
  }
}

function report(
  dead: DeadDoc[],
  scannedDocs: number,
  totalMissingImages: number,
  totalMissingFiles: number,
): void {
  console.log("\n=== Wiki dangling-reference report ===");
  console.log(`documents scanned:       ${scannedDocs}`);
  console.log(`documents with dead refs: ${dead.length}`);
  console.log(`dangling image refs:     ${totalMissingImages}`);
  console.log(`dangling file refs:      ${totalMissingFiles}`);

  if (dead.length === 0) {
    console.log("\nNo dangling references. Nothing to clean up.\n");
    return;
  }

  // Sort: live documents first (user-visible), then trashed; by title within.
  dead.sort((a, b) => {
    if (a.deleted !== b.deleted) return a.deleted ? 1 : -1;
    return a.title.localeCompare(b.title);
  });

  console.log("\n--- documents embedding missing attachments ---");
  for (const d of dead) {
    const tag = d.deleted ? " [trashed]" : "";
    console.log(
      `\n  ${d.title}${tag}  (doc ${d.documentId}, op ${d.operationId})`,
    );
    for (const id of d.missingImages) {
      console.log(`    image  ${id}  (no metadata — deleted)`);
    }
    for (const id of d.missingFiles) {
      console.log(`    file   ${id}  (no metadata — deleted)`);
    }
  }
  console.log("");
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
