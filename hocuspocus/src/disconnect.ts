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

    // Find and close matching connections
    // Hocuspocus stores connections per document
    for (const [, document] of server.documents) {
      for (const connection of document.getConnections()) {
        const ctx = connection.context;
        if (ctx?.userId === userId && ctx?.operationId === operationId) {
          // Close with code 4403 (custom: role insufficient).
          // @hocuspocus/server's Connection.close type is `close(event?:
          // CloseEvent): void`, but the underlying WebSocket.close accepts
          // (code, reason) at runtime, which is what we need here. Suppress
          // the type error rather than wrap a CloseEvent — the runtime
          // signature is what we depend on.
          // @ts-expect-error — see comment above
          connection.close(4403, "role-insufficient");
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
