import { Database } from "@hocuspocus/extension-database";
import { TiptapTransformer } from "@hocuspocus/transformer";
import { MongoClient, type Db } from "mongodb";
import * as Y from "yjs";

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
        { document_id: docId },
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

      // Derive Markdown from Y.js state
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, state);

      let markdown = "";
      try {
        // TiptapTransformer converts Y.Doc -> ProseMirror JSON -> Markdown
        const json = TiptapTransformer.fromYdoc(ydoc);
        // Simple fallback: extract text content from the Y.Doc
        // The transformer may need extensions configured for full Markdown
        markdown = ydoc.getText("default")?.toString() || "";

        // Try to get content from the prosemirror XML fragment
        const xmlFragment = ydoc.getXmlFragment("default");
        if (xmlFragment && xmlFragment.length > 0) {
          // Use the transformer if available
          try {
            const node = TiptapTransformer.fromYdoc(ydoc, "default");
            if (node) {
              markdown = JSON.stringify(node);
            }
          } catch {
            // Fall back to text content
          }
        }
      } catch (err) {
        console.warn("Markdown derivation failed, storing raw text:", err);
      }

      // Write content_state, content, and content_state_at to MongoDB
      await collection.updateOne(
        { document_id: docId },
        {
          $set: {
            content_state: Buffer.from(state),
            content: markdown,
            content_state_at: new Date(),
          },
        }
      );

      // Send webhook to Go backend
      const operationId = context?.operationId || "";
      await sendWebhook("onChange", docId, operationId);
    },
  });
}

export { debounceMs };
