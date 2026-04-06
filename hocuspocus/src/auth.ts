import jwt from "jsonwebtoken";
import type { onAuthenticatePayload } from "@hocuspocus/server";

const ticketSecret = process.env.HOCUSPOCUS_TICKET_SECRET || "";

export interface CollabTicketClaims {
  userId: string;
  username: string;
  operationId: string;
  documentId: string;
  readOnly?: boolean;
}

/**
 * Hocuspocus onAuthenticate hook.
 * Verifies the collab ticket JWT signed by the Go backend.
 * No MongoDB query, no membership logic — the ticket already proves authorization.
 */
export function onAuthenticate({
  token,
  context,
  connection,
}: onAuthenticatePayload): Promise<CollabTicketClaims> {
  return new Promise((resolve, reject) => {
    if (!token) {
      return reject(new Error("No authentication token provided"));
    }

    if (!ticketSecret) {
      return reject(new Error("HOCUSPOCUS_TICKET_SECRET not configured"));
    }

    try {
      const decoded = jwt.verify(token, ticketSecret) as CollabTicketClaims;

      // Store claims in connection context for use in other hooks
      context.userId = decoded.userId;
      context.username = decoded.username;
      context.operationId = decoded.operationId;
      context.documentId = decoded.documentId;
      context.readOnly = decoded.readOnly === true;

      // Server-authoritative write enforcement: viewers get live updates
      // but Hocuspocus rejects any Y.js updates they try to send.
      if (decoded.readOnly === true) {
        connection.readOnly = true;
      }

      resolve(decoded);
    } catch (err) {
      reject(new Error("Invalid or expired collab ticket"));
    }
  });
}
