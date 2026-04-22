import { Database } from "@hocuspocus/extension-database";
import { Binary, MongoClient, type Db } from "mongodb";
import * as Y from "yjs";

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
      if (xmlFragment.length > 0) {
        markdown = extractTextFromFragment(xmlFragment);
      } else {
        markdown = ydoc.getText("content").toString();
      }

      // context is populated by onAuthenticate (auth.ts). userId is the
      // typist that ended the debounce window — attribute the save to them.
      const ctx = context as
        | { userId?: string; operationId?: string }
        | undefined;

      const now = new Date();
      const updates: Record<string, unknown> = {
        content_state: Buffer.from(state),
        content: markdown,
        content_state_at: now,
        // The Go backend's qmgo DefaultField auto-manages `updateAt` on
        // qmgo writes, but this path uses the raw mongo driver, so qmgo's
        // hook never fires. Set it explicitly so GraphQL `updatedAt`
        // reflects content edits, not just metadata ones.
        updateAt: now,
      };

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

      await collection.updateOne(
        { document_id: uuidToBinary(docId) },
        { $set: updates }
      );

      // Send webhook to Go backend
      const operationId = ctx?.operationId || "";
      await sendWebhook("onChange", docId, operationId, ctx?.userId);
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

export { debounceMs };
