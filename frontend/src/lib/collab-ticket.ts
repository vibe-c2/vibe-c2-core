import { apiPost, ApiError } from "@/services/api-client"
import { WIKI_SCHEMA_VERSION } from "@/components/wiki/wiki-schema-version"

/**
 * Thrown when the collab-ticket endpoint refuses to connect this client because
 * its editor schema is older than the schema that authored the document's
 * stored content. The only remedy is reloading to pick up the latest app
 * bundle — connecting anyway would let the stale editor prune node types it
 * doesn't understand (e.g. checklist items) and destroy content.
 */
export class SchemaOutdatedError extends Error {
  constructor() {
    super("wiki client schema outdated")
    this.name = "SchemaOutdatedError"
  }
}

/**
 * Fetch a short-lived collab ticket for Hocuspocus WebSocket auth.
 * The ticket is passed as the `token` when connecting to the WebSocket.
 *
 * Sends the client's compiled-in WIKI_SCHEMA_VERSION so the backend can gate
 * connections from outdated clients. A 409 with code "schema_outdated" is
 * re-thrown as {@link SchemaOutdatedError} so the editor can render a reload
 * prompt instead of silently failing to connect.
 */
export async function fetchCollabTicket(documentId: string): Promise<string> {
  try {
    const res = await apiPost<{ ticket: string }>("/wiki/collab-ticket", {
      documentId,
      schemaVersion: WIKI_SCHEMA_VERSION,
    })
    return res.ticket
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.status === 409 &&
      err.code === "schema_outdated"
    ) {
      throw new SchemaOutdatedError()
    }
    throw err
  }
}
