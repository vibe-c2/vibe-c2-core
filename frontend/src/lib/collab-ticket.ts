import { apiPost } from "@/services/api-client"

/**
 * Fetch a short-lived collab ticket for Hocuspocus WebSocket auth.
 * The ticket is passed as the `token` when connecting to the WebSocket.
 */
export async function fetchCollabTicket(documentId: string): Promise<string> {
  const res = await apiPost<{ ticket: string }>("/wiki/collab-ticket", { documentId })
  return res.ticket
}
