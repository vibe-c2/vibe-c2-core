import type { Express } from "express";
import type { Hocuspocus } from "@hocuspocus/server";

interface DisconnectRequest {
  userId: string;
  operationId: string;
}

/**
 * Set up the internal disconnect API endpoint.
 * Called by the Go backend to force-close WebSocket connections
 * when a user's role is demoted below operator or membership is revoked.
 */
export function setupDisconnectApi(app: Express, server: Hocuspocus): void {
  app.post("/api/disconnect", (req, res) => {
    const { userId, operationId } = req.body as DisconnectRequest;

    if (!userId || !operationId) {
      res.status(400).json({ error: "userId and operationId required" });
      return;
    }

    let disconnected = 0;

    // Hocuspocus stores connections per document; iterate every doc and close
    // any connection whose auth context targets the (userId, operationId) we
    // were asked to evict. Code 4403 is a custom WebSocket close code we use
    // to signal "role insufficient" to the client.
    const closeEvent = { code: 4403, reason: "role-insufficient" };
    for (const [, document] of server.documents) {
      for (const connection of document.getConnections()) {
        const ctx = connection.context;
        if (ctx?.userId === userId && ctx?.operationId === operationId) {
          connection.close(closeEvent);
          disconnected++;
        }
      }
    }

    console.log(
      `Disconnected ${disconnected} connections for user ${userId} in operation ${operationId}`
    );

    res.json({ ok: true, disconnected });
  });
}
