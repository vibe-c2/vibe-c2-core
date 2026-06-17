import { Database } from "@hocuspocus/extension-database";
import { Binary, MongoClient, type Db } from "mongodb";
import * as Y from "yjs";
import {
  collectChecklistCoverage,
  collectCredentialReferenceIds,
  collectDocReferenceIds,
  collectFileReferenceIds,
  collectHashReferenceIds,
  collectHostReferenceIds,
  collectImageReferenceIds,
  type ChecklistCoverage,
} from "./references.js";

/**
 * Convert a UUID string to a BSON Binary matching how the Go backend (qmgo)
 * serializes `uuid.UUID` fields. Without this, Mongo filters keyed on a JS
 * string never match documents written by Go.
 *
 * Used for both document IDs (in the query filter) and user IDs (persisted
 * into last_updated_by_id).
 */
function uuidToBinary(value: string): Binary {
  const hex = value.replace(/-/g, "");
  if (hex.length !== 32) {
    throw new Error(`invalid uuid: ${value}`);
  }
  // qmgo (Go backend) serializes uuid.UUID via MarshalBinary, which the
  // mongo-go-driver writes as Binary subtype 0 (generic), NOT subtype 4.
  return new Binary(Buffer.from(hex, "hex"), Binary.SUBTYPE_DEFAULT);
}

const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017";
const mongoDatabase = process.env.MONGO_DATABASE || "vibec2";
const webhookUrl = process.env.HOCUSPOCUS_WEBHOOK_URL || "";
const webhookSecret = process.env.HOCUSPOCUS_WEBHOOK_SECRET || "";
const debounceMs = parseInt(process.env.HOCUSPOCUS_DEBOUNCE_MS || "2000", 10);

// Hardcoded UUID of the synthetic Public operation. Mirrors
// `models.PublicOperationID` in the Go backend (core/pkg/models/public_operation.go).
// Wiki documents under this operation are world-readable, so credential
// references must never be written into them — credentials are
// operation-private and a /credential chip in a public doc would surface
// credential metadata to every authenticated user. Kept as a code-level
// constant rather than a required env var because the value is fixed and
// must match the Go side exactly.
const PUBLIC_OPERATION_ID = "00000000-0000-0000-0000-000000000001";

let db: Db;

async function getDb(): Promise<Db> {
  if (!db) {
    const client = new MongoClient(mongoUri);
    await client.connect();
    db = client.db(mongoDatabase);
  }
  return db;
}

/**
 * Parse the document ID from the Hocuspocus room name.
 * Room names follow the pattern: wiki/{documentId}
 */
function parseDocumentId(documentName: string): string {
  const parts = documentName.split("/");
  return parts[parts.length - 1];
}

/**
 * Send a webhook notification to the Go backend with retry.
 * 3 attempts with exponential backoff: 1s, 2s, 4s.
 */
async function sendWebhook(
  event: string,
  documentId: string,
  operationId: string,
  userId?: string,
  username?: string
): Promise<void> {
  if (!webhookUrl) return;

  const payload = JSON.stringify({
    event,
    documentId,
    operationId,
    userId: userId || "",
    username: username || "",
  });

  const delays = [1000, 2000, 4000];

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Add HMAC signature if secret is configured
      if (webhookSecret) {
        const crypto = await import("crypto");
        const hmac = crypto.createHmac("sha256", webhookSecret);
        hmac.update(payload);
        headers["X-Hocuspocus-Signature-256"] =
          "sha256=" + hmac.digest("hex");
      }

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers,
        body: payload,
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) return;

      console.warn(
        `Webhook attempt ${attempt + 1} failed: ${response.status}`
      );
    } catch (err) {
      console.warn(`Webhook attempt ${attempt + 1} error:`, err);
    }

    if (attempt < delays.length) {
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }

  console.error(`Webhook failed after ${delays.length + 1} attempts`);
}

/**
 * Create the Hocuspocus Database extension for MongoDB persistence.
 * - fetch(): reads content_state from wiki_documents
 * - store(): writes content_state + derived markdown + sends webhook
 */
export function createDatabaseExtension(): Database {
  return new Database({
    fetch: async ({ documentName }) => {
      const docId = parseDocumentId(documentName);
      const database = await getDb();
      const collection = database.collection("wiki_documents");

      const doc = await collection.findOne(
        { document_id: uuidToBinary(docId) },
        { projection: { content_state: 1 } }
      );

      if (!doc?.content_state?.buffer) {
        return null;
      }

      return new Uint8Array(doc.content_state.buffer);
    },

    store: async ({ documentName, state, context }) => {
      const docId = parseDocumentId(documentName);
      const database = await getDb();
      const collection = database.collection("wiki_documents");

      // Extract plain text for the searchable `content` field.
      // TipTap stores rich content in a Y.XmlFragment on key "default".
      // Legacy documents from the textarea era use Y.Text on key "content".
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, state);

      const xmlFragment = ydoc.getXmlFragment("default");
      let markdown: string;
      let referenceBinaries: Binary[] = [];
      let credentialReferenceBinaries: Binary[] = [];
      let hashReferenceBinaries: Binary[] = [];
      let hostReferenceBinaries: Binary[] = [];
      // Attachment reference indexes. These power the image/file garbage
      // collector on the Go side: a blob is kept alive only while its id is
      // present in some document's image_references / file_references array.
      // The `content` field below is plain text (search index) and does NOT
      // carry attachment URLs, so these arrays are the ONLY queryable record
      // of which attachments a document uses.
      let imageReferenceBinaries: Binary[] = [];
      let fileReferenceBinaries: Binary[] = [];
      // Checklist coverage counts (total items, required subset, answered). Zero
      // for ordinary wiki docs — collectChecklistCoverage finds no checklist items.
      let checklistCoverage: ChecklistCoverage = {
        total: 0,
        required: 0,
        answered: 0,
      };
      if (xmlFragment.length > 0) {
        markdown = extractTextFromFragment(xmlFragment);
        referenceBinaries = idsToBinaries(collectDocReferenceIds(xmlFragment));
        credentialReferenceBinaries = idsToBinaries(
          collectCredentialReferenceIds(xmlFragment),
        );
        hashReferenceBinaries = idsToBinaries(
          collectHashReferenceIds(xmlFragment),
        );
        hostReferenceBinaries = idsToBinaries(
          collectHostReferenceIds(xmlFragment),
        );
        imageReferenceBinaries = idsToBinaries(
          collectImageReferenceIds(xmlFragment),
        );
        fileReferenceBinaries = idsToBinaries(
          collectFileReferenceIds(xmlFragment),
        );
        checklistCoverage = collectChecklistCoverage(xmlFragment);
      } else {
        markdown = ydoc.getText("content").toString();
      }

      // context is populated by onAuthenticate (auth.ts). userId is the
      // typist that ended the debounce window — attribute the save to them.
      const ctx = context as
        | { userId?: string; operationId?: string }
        | undefined;

      // Security boundary: public wiki documents cannot hold credential
      // references. Credentials are operation-private; a /credential chip
      // persisted into a public doc would surface credential metadata to
      // any authenticated user. Drop the references silently so the save
      // itself still completes — the editor JSON may still contain the
      // chip nodes, but the inverse index that powers credential
      // backlinks (and any cross-domain leak path) stays empty.
      if (ctx?.operationId === PUBLIC_OPERATION_ID) {
        credentialReferenceBinaries = [];
        // Same security boundary for hashes — hash material is
        // operation-private, so a /hash chip must never seed the inverse
        // index on a world-readable public document.
        hashReferenceBinaries = [];
        // Same boundary for hosts — host identity (hostnames, interfaces,
        // routes) is operation-private, so a /host chip must never seed the
        // inverse index on a world-readable public document.
        hostReferenceBinaries = [];
      }

      // Distinguish a real human edit from a no-op write triggered purely by
      // *opening* the document. Opening an old doc can mutate the Y.js state
      // with zero user input — legacy textarea→rich-text migration, lazy
      // code-block id backfill, or ProseMirror schema normalization of content
      // authored before the current extension set. Each produces a Y.js update,
      // which fires this store() exactly like a keystroke would. Without a
      // guard we stamp the opener as the last editor and bump updateAt,
      // corrupting the edit history of documents nobody actually touched.
      //
      // The fix lives here rather than in the editor because it is the single
      // chokepoint every such branch funnels through — guarding it neutralizes
      // both today's branches and any future schema change that re-normalizes
      // old content on load.
      //
      // We compare the *meaningful* persisted projection (plain-text content +
      // every reference/attachment index + checklist coverage) against what is
      // already stored. The raw content_state bytes are deliberately NOT part
      // of this comparison: normalization rewrites the binary while leaving the
      // visible document identical, which is precisely the case we must treat
      // as "unchanged". content_state is still re-persisted below regardless,
      // so a one-time normalization settles permanently after the first open.
      const existing = await collection.findOne(
        { document_id: uuidToBinary(docId) },
        {
          projection: {
            content: 1,
            references: 1,
            credential_references: 1,
            hash_references: 1,
            host_references: 1,
            image_references: 1,
            file_references: 1,
            checklist_total: 1,
            checklist_required: 1,
            checklist_answered: 1,
          },
        },
      );

      const meaningfulChanged =
        !existing ||
        existing.content !== markdown ||
        !binarySetEqual(existing.references, referenceBinaries) ||
        !binarySetEqual(
          existing.credential_references,
          credentialReferenceBinaries,
        ) ||
        !binarySetEqual(existing.hash_references, hashReferenceBinaries) ||
        !binarySetEqual(existing.host_references, hostReferenceBinaries) ||
        !binarySetEqual(existing.image_references, imageReferenceBinaries) ||
        !binarySetEqual(existing.file_references, fileReferenceBinaries) ||
        existing.checklist_total !== checklistCoverage.total ||
        existing.checklist_required !== checklistCoverage.required ||
        existing.checklist_answered !== checklistCoverage.answered;

      const now = new Date();
      const updates: Record<string, unknown> = {
        content_state: Buffer.from(state),
        content: markdown,
        content_state_at: now,
        // Rewrite the full references array on every save. Removing the
        // last /doc chip leaves an empty array (not absent), so the
        // backlinks resolver immediately stops returning this doc.
        references: referenceBinaries,
        // Parallel index for credential backlinks. Same rewrite semantics:
        // removing the last /credential chip clears the array, so the
        // Findings page's backlinks list updates on the next persist.
        credential_references: credentialReferenceBinaries,
        // Parallel index for hash backlinks — same rewrite semantics as the
        // credential array above. Powers the "Referenced in" section of the
        // hash details dialog.
        hash_references: hashReferenceBinaries,
        // Parallel index for host backlinks — same rewrite semantics as the
        // credential/hash arrays. Powers the inverse "which wiki docs reference
        // this host" lookup.
        host_references: hostReferenceBinaries,
        // Attachment liveness indexes for the Go garbage collector. Full
        // rewrite on every save: removing an image/file from the body drops
        // its id here, and once it's referenced by no document the sweeper
        // may reclaim the blob. Not gated by the public-operation boundary —
        // attachment bytes are not operation-private the way credentials are.
        image_references: imageReferenceBinaries,
        file_references: fileReferenceBinaries,
        // Checklist coverage projection. Rewritten on every save like the
        // reference arrays: as items are answered the numerator climbs, and a
        // doc with no checklist items persists 0/0/0. Powers the per-document
        // coverage bar (which renders whenever checklist_total > 0) and the
        // operation rollup. Not gated by the public-operation boundary — counts
        // are not operation-private.
        checklist_total: checklistCoverage.total,
        checklist_required: checklistCoverage.required,
        checklist_answered: checklistCoverage.answered,
      };

      // Authorship + updateAt are stamped ONLY for real edits. An open-time
      // normalization re-persists content_state and the derived indexes (above)
      // but must not re-attribute the document or move its updatedAt — that is
      // the whole point of the guard.
      if (meaningfulChanged) {
        // The Go backend's qmgo DefaultField auto-manages `updateAt` on qmgo
        // writes, but this path uses the raw mongo driver, so qmgo's hook never
        // fires. Set it explicitly so GraphQL `updatedAt` reflects content
        // edits, not just metadata ones.
        updates.updateAt = now;

        // context is populated by onAuthenticate (auth.ts). userId is the
        // typist that ended the debounce window — attribute the save to them.
        if (ctx?.userId) {
          try {
            updates.last_updated_by_id = uuidToBinary(ctx.userId);
            updates.last_updated_at = now;
          } catch (err) {
            // Malformed userId — persist the save without attribution rather
            // than dropping the content edit.
            console.warn(`Skipping attribution for ${docId}:`, err);
          }
        }
      }

      await collection.updateOne(
        { document_id: uuidToBinary(docId) },
        { $set: updates }
      );

      // Notify the Go backend only for real edits. A no-op open-time persist
      // must not publish WikiDocumentUpdatedEvent — subscribers would see a
      // phantom "document changed" for a doc nobody edited.
      if (meaningfulChanged) {
        const operationId = ctx?.operationId || "";
        await sendWebhook("onChange", docId, operationId, ctx?.userId);
      }
    },
  });
}

/**
 * Recursively extract plain text from a Y.XmlFragment (TipTap document).
 * Block-level elements are separated by newlines.
 */
function extractTextFromFragment(node: Y.XmlFragment | Y.XmlElement): string {
  const parts: string[] = [];
  for (const child of node.toArray()) {
    if (child instanceof Y.XmlText) {
      parts.push(child.toString());
    } else if (child instanceof Y.XmlElement) {
      parts.push(extractTextFromFragment(child));
    }
  }
  return parts.join("\n").trim();
}

/**
 * Convert a set of UUID strings to BSON Binaries matching the qmgo (Go)
 * serialisation. Pure ID extraction lives in references.ts; persistence only
 * owns the I/O boundary (Mongo Binary, Y.js round-trip, webhook dispatch).
 *
 * uuidToBinary validates hex length — defense in depth on top of the UUID
 * regex inside the walker. A single bad ID never blocks the save.
 */
function idsToBinaries(ids: Iterable<string>): Binary[] {
  const out: Binary[] = [];
  for (const id of ids) {
    try {
      out.push(uuidToBinary(id));
    } catch {
      // skip malformed
    }
  }
  return out;
}

/**
 * Compare a stored reference array (as read back from Mongo) against the
 * freshly-derived Binary set, ignoring order. Reference indexes are built from
 * Y.js walker Sets, so element order is not stable between saves — comparison
 * must be set-based to avoid flagging an identical document as changed.
 *
 * `stored` is typed loosely because it comes straight off a Mongo document
 * (unknown projection value); anything that isn't an array of Binary is treated
 * as empty, so a missing field compares equal to an empty derived set.
 */
export function binarySetEqual(stored: unknown, next: Binary[]): boolean {
  const storedArr = Array.isArray(stored) ? stored : [];
  if (storedArr.length !== next.length) return false;
  if (next.length === 0) return true;

  const toHex = (b: unknown): string | null =>
    b instanceof Binary ? Buffer.from(b.buffer).toString("hex") : null;

  const a = storedArr
    .map(toHex)
    .filter((x): x is string => x !== null)
    .sort();
  const b = next.map((x) => Buffer.from(x.buffer).toString("hex")).sort();
  if (a.length !== b.length) return false;
  return a.every((value, i) => value === b[i]);
}

export { debounceMs };
