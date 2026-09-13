// POST /internal/rebase-document — the HTTP face of rebase-document.ts.
//
// Called by the Go transfer materialiser once per imported page. Same
// raw-body HMAC path as the other internal routes, so it mounts before
// express.json().
//
//   Request  (application/json)
//     { contentState?: <base64>, markdown?: string,
//       idMap: { "<source uuid>": "<target uuid>" },
//       drop?: [uuid], dropUnmappedKinds?: ["doc"|"host"|"hash"|"credential"] }
//   Response (application/json)
//     { contentState: <base64>, content, references, credentialReferences,
//       hashReferences, hostReferences, imageReferences, fileReferences,
//       checklist: { total, required, answered }, schemaVersion,
//       unmapped: [uuid], dropped, remapped }

import type { Express, Request, Response } from "express";
import { readRawBody, requireSignature } from "./internal-auth.js";
import { rebaseDocument, type ChipKind, type RebaseRequest } from "./rebase-document.js";

// Markdown bodies are capped at 1 MB by the editor; Y.js state can be a few
// times larger. 4 MB of base64 plus the map is a generous envelope.
const MAX_INPUT_BYTES = 6 * 1024 * 1024;

// The schema version stamped on state this route produces. Mirrors
// WIKI_SCHEMA_VERSION in frontend/src/components/wiki/wiki-schema-version.ts:
// the bytes are built from the current wikiSchema, so they are current-schema
// content and must be guarded as such by the stale-client check.
export const REBASE_SCHEMA_VERSION = 1;

const VALID_KINDS = new Set<ChipKind>(["doc", "host", "hash", "credential"]);

interface WireRequest {
  contentState?: unknown;
  markdown?: unknown;
  idMap?: unknown;
  drop?: unknown;
  dropUnmappedKinds?: unknown;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === "string");
}

function isStringMap(v: unknown): v is Record<string, string> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    Object.values(v as Record<string, unknown>).every((s) => typeof s === "string")
  );
}

/** Validate the wire shape into a RebaseRequest, or describe what is wrong. */
export function parseRebaseRequest(
  body: WireRequest,
): { ok: true; req: RebaseRequest } | { ok: false; error: string } {
  const hasState = typeof body.contentState === "string" && body.contentState !== "";
  const hasMarkdown = typeof body.markdown === "string";
  if (hasState === hasMarkdown) {
    return { ok: false, error: "exactly one of contentState or markdown is required" };
  }
  if (body.idMap !== undefined && !isStringMap(body.idMap)) {
    return { ok: false, error: "idMap must be an object of strings" };
  }
  if (body.drop !== undefined && !isStringArray(body.drop)) {
    return { ok: false, error: "drop must be an array of strings" };
  }
  if (body.dropUnmappedKinds !== undefined) {
    if (!isStringArray(body.dropUnmappedKinds)) {
      return { ok: false, error: "dropUnmappedKinds must be an array of strings" };
    }
    for (const k of body.dropUnmappedKinds) {
      if (!VALID_KINDS.has(k as ChipKind)) {
        return { ok: false, error: `unknown chip kind ${JSON.stringify(k)}` };
      }
    }
  }
  return {
    ok: true,
    req: {
      contentState: hasState
        ? new Uint8Array(Buffer.from(body.contentState as string, "base64"))
        : undefined,
      markdown: hasMarkdown ? (body.markdown as string) : undefined,
      idMap: (body.idMap as Record<string, string>) ?? {},
      drop: (body.drop as string[]) ?? [],
      dropUnmappedKinds: (body.dropUnmappedKinds as ChipKind[]) ?? [],
    },
  };
}

export function setupRebaseApi(app: Express): void {
  app.post(
    "/internal/rebase-document",
    readRawBody(MAX_INPUT_BYTES),
    (req: Request, res: Response) => {
      const rawBody = requireSignature(req, res);
      if (!rawBody) return;

      let body: WireRequest;
      try {
        body = JSON.parse(rawBody.toString("utf8")) as WireRequest;
      } catch {
        res.status(400).json({ error: "malformed JSON" });
        return;
      }

      const parsed = parseRebaseRequest(body);
      if (!parsed.ok) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      try {
        const result = rebaseDocument(parsed.req);
        res.status(200).json({
          contentState: Buffer.from(result.contentState).toString("base64"),
          content: result.content,
          references: result.references,
          credentialReferences: result.credentialReferences,
          hashReferences: result.hashReferences,
          hostReferences: result.hostReferences,
          imageReferences: result.imageReferences,
          fileReferences: result.fileReferences,
          checklist: result.checklist,
          schemaVersion: REBASE_SCHEMA_VERSION,
          unmapped: result.unmapped,
          dropped: result.dropped,
          remapped: result.remapped,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "rebase failed";
        console.error("rebase-document error:", err);
        res.status(422).json({ error: message });
      }
    },
  );
}
