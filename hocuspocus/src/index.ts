import { Hocuspocus } from "@hocuspocus/server";
import express from "express";
import { onAuthenticate } from "./auth.js";
import { createDatabaseExtension, debounceMs } from "./persistence.js";
import { setupDisconnectApi } from "./disconnect.js";

const port = parseInt(process.env.PORT || "1234", 10);
const maxActiveRooms = parseInt(process.env.MAX_ACTIVE_ROOMS || "100", 10);
const maxClientsPerRoom = parseInt(
  process.env.MAX_CLIENTS_PER_ROOM || "20",
  10
);

const webhookUrl = process.env.HOCUSPOCUS_WEBHOOK_URL || "";
const webhookSecret = process.env.HOCUSPOCUS_WEBHOOK_SECRET || "";

/**
 * Send a webhook notification to the Go backend.
 */
async function sendWebhook(
  event: string,
  documentId: string,
  operationId: string,
  userId: string,
  username: string
): Promise<void> {
  if (!webhookUrl) return;

  const payload = JSON.stringify({
    event,
    documentId,
    operationId,
    userId,
    username,
  });

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (webhookSecret) {
      const crypto = await import("crypto");
      const hmac = crypto.createHmac("sha256", webhookSecret);
      hmac.update(payload);
      headers["X-Hocuspocus-Signature-256"] = "sha256=" + hmac.digest("hex");
    }

    await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: payload,
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.warn(`Webhook (${event}) failed:`, err);
  }
}

// Create the Hocuspocus server
const server = new Hocuspocus({
  port,
  debounce: debounceMs,
  maxDebounce: debounceMs * 5,

  // Authentication via collab ticket
  onAuthenticate,

  // Connection hooks for capacity limits and presence webhooks
  async onConnect({ documentName, context, instance }) {
    // Check server-level room limit
    if (instance.documents.size >= maxActiveRooms) {
      throw new Error("Maximum active rooms reached");
    }

    // Check per-room client limit
    const doc = instance.documents.get(documentName);
    if (doc && doc.getConnectionsCount() >= maxClientsPerRoom) {
      throw new Error("Maximum clients per room reached");
    }

    // Notify Go backend of connection
    const docId = documentName.split("/").pop() || documentName;
    await sendWebhook(
      "onConnect",
      docId,
      context?.operationId || "",
      context?.userId || "",
      context?.username || ""
    );
  },

  async onDisconnect({ documentName, context }) {
    const docId = documentName.split("/").pop() || documentName;
    await sendWebhook(
      "onDisconnect",
      docId,
      context?.operationId || "",
      context?.userId || "",
      context?.username || ""
    );
  },

  extensions: [createDatabaseExtension()],
});

// Set up internal Express HTTP server for the disconnect API
const app = express();
app.use(express.json());
setupDisconnectApi(app, server);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", documents: server.documents.size });
});

// Start both the Hocuspocus WebSocket server and the Express HTTP server
server.listen().then(() => {
  console.log(`Hocuspocus WebSocket server listening on port ${port}`);
});

// Internal HTTP API on port + 1
const httpPort = port + 1;
app.listen(httpPort, () => {
  console.log(`Hocuspocus HTTP API listening on port ${httpPort}`);
});
