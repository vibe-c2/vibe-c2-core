// Internal HTTP API exposed on the same Express server that hosts the
// disconnect API and the health check. Reachable from the Go backend only;
// HMAC-signed with the existing HOCUSPOCUS_WEBHOOK_SECRET so neither side
// has to manage a second shared secret.
//
// The header name is intentionally distinct from the webhook header
// (X-Hocuspocus-Signature-256) so the direction is unambiguous on the
// wire and in logs.

import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { Binary, MongoClient, type Db } from "mongodb";
import * as Y from "yjs";
import { markdownToYjsUpdate } from "./markdown-to-yjs.js";
import { yjsUpdateToMarkdown } from "./yjs-to-markdown.js";
import {
  collectCredentialReferenceIds,
  collectHashReferenceIds,
} from "./references.js";

const internalSecret = process.env.HOCUSPOCUS_WEBHOOK_SECRET || "";
const SIGNATURE_HEADER = "x-internal-signature-256";
const MAX_MARKDOWN_BYTES = 1024 * 1024; // 1 MB — matches WikiDocument.Content cap.
// Y.js updates can be larger than the markdown they encode (CRDT metadata
// overhead), but Mongo's BSON binary cap and our import cap give a natural
// ceiling. 4 MB is generous; anything larger is almost certainly corrupt.
const MAX_YJS_BYTES = 4 * 1024 * 1024;

interface MarkdownRequestBody {
  markdown?: unknown;
}

// Match the qmgo (Go) `uuid.UUID` BSON serialisation — Binary subtype 0 with
// the raw 16 bytes. Mongo filters keyed on a JS string never match the docs
// the Go backend wrote, so the backfill must produce the same encoding the
// persistence layer uses.
function uuidStringToBinary(value: string): Binary {
  const hex = value.replace(/-/g, "");
  if (hex.length !== 32) {
    throw new Error(`invalid uuid: ${value}`);
  }
  return new Binary(Buffer.from(hex, "hex"), Binary.SUBTYPE_DEFAULT);
}

// Hardcoded UUID of the synthetic Public operation. Mirrors
// models.PublicOperationID (Go) and the same constant in persistence.ts. Wiki
// documents under this operation are world-readable, so credential and hash
// references must never seed the inverse index — both are operation-private.
// The live save path enforces this in persistence.ts; the backfills below
// apply the same guard so a re-run can't reintroduce the leak the live path
// already prevents.
const PUBLIC_OPERATION_ID = "00000000-0000-0000-0000-000000000001";
const PUBLIC_OPERATION_BINARY = uuidStringToBinary(PUBLIC_OPERATION_ID);

function isPublicOperation(operationId: unknown): boolean {
  return (
    operationId instanceof Binary &&
    Buffer.from(operationId.buffer).equals(
      Buffer.from(PUBLIC_OPERATION_BINARY.buffer),
    )
  );
}

function verifySignature(rawBody: Buffer, headerValue: string | undefined): boolean {
  if (!internalSecret || !headerValue) return false;
  if (!headerValue.startsWith("sha256=")) return false;

  const provided = headerValue.slice("sha256=".length);
  const expected = crypto
    .createHmac("sha256", internalSecret)
    .update(rawBody)
    .digest("hex");

  // Constant-time comparison.
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(provided, "hex"),
    Buffer.from(expected, "hex")
  );
}

const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017";
const mongoDatabase = process.env.MONGO_DATABASE || "vibec2";

let backfillDb: Db | undefined;

async function getBackfillDb(): Promise<Db> {
  if (!backfillDb) {
    const client = new MongoClient(mongoUri);
    await client.connect();
    backfillDb = client.db(mongoDatabase);
  }
  return backfillDb;
}

interface BackfillSummary {
  scanned: number;
  updated: number;
  failed: number;
}

// Sweep every wiki document, decode content_state into a transient Y.Doc, run
// the credential walker, and write the result to credential_references. The
// sweep loads docs in batches and operates on a per-doc transient Y.Doc — it
// does NOT touch the live Hocuspocus open-document map, so concurrent editing
// sessions are unaffected.
//
// Idempotent: re-running just rewrites the same array.
async function runCredentialReferenceBackfill(): Promise<BackfillSummary> {
  const db = await getBackfillDb();
  const collection = db.collection("wiki_documents");

  const summary: BackfillSummary = { scanned: 0, updated: 0, failed: 0 };
  const batchSize = 200;

  const cursor = collection.find(
    { content_state: { $ne: null } },
    { projection: { document_id: 1, content_state: 1, operation_id: 1 }, batchSize },
  );

  for await (const doc of cursor) {
    summary.scanned += 1;
    const state = doc.content_state as Binary | undefined;
    if (!state?.buffer) continue;

    try {
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, new Uint8Array(state.buffer));
      const fragment = ydoc.getXmlFragment("default");
      const ids = collectCredentialReferenceIds(fragment);

      const binaries: Binary[] = [];
      for (const id of ids) {
        try {
          binaries.push(uuidStringToBinary(id));
        } catch {
          // Bad UUID; skip without aborting the doc.
        }
      }

      // Public-operation guard — mirrors persistence.ts. A /credential chip in
      // a world-readable doc must never seed the inverse index.
      const refs = isPublicOperation(doc.operation_id) ? [] : binaries;

      await collection.updateOne(
        { _id: doc._id },
        { $set: { credential_references: refs } },
      );
      summary.updated += 1;
    } catch (err) {
      summary.failed += 1;
      console.error(
        `backfill: doc ${doc.document_id?.toString?.() ?? "?"} failed:`,
        err,
      );
    }
  }

  return summary;
}

// Sibling of runCredentialReferenceBackfill for the hash backlinks index.
// Sweeps every wiki document, decodes content_state into a transient Y.Doc,
// runs the hash walker, and writes the result to hash_references. Idempotent.
async function runHashReferenceBackfill(): Promise<BackfillSummary> {
  const db = await getBackfillDb();
  const collection = db.collection("wiki_documents");

  const summary: BackfillSummary = { scanned: 0, updated: 0, failed: 0 };
  const batchSize = 200;

  const cursor = collection.find(
    { content_state: { $ne: null } },
    { projection: { document_id: 1, content_state: 1, operation_id: 1 }, batchSize },
  );

  for await (const doc of cursor) {
    summary.scanned += 1;
    const state = doc.content_state as Binary | undefined;
    if (!state?.buffer) continue;

    try {
      const ydoc = new Y.Doc();
      Y.applyUpdate(ydoc, new Uint8Array(state.buffer));
      const fragment = ydoc.getXmlFragment("default");
      const ids = collectHashReferenceIds(fragment);

      const binaries: Binary[] = [];
      for (const id of ids) {
        try {
          binaries.push(uuidStringToBinary(id));
        } catch {
          // Bad UUID; skip without aborting the doc.
        }
      }

      // Public-operation guard — mirrors persistence.ts. A /hash chip in a
      // world-readable doc must never seed the inverse index.
      const refs = isPublicOperation(doc.operation_id) ? [] : binaries;

      await collection.updateOne(
        { _id: doc._id },
        { $set: { hash_references: refs } },
      );
      summary.updated += 1;
    } catch (err) {
      summary.failed += 1;
      console.error(
        `backfill: doc ${doc.document_id?.toString?.() ?? "?"} failed:`,
        err,
      );
    }
  }

  return summary;
}

export function setupInternalApi(app: Express): void {
  // Read the request body as raw bytes so the HMAC signs exactly what the
  // Go client signed. The general express.json() middleware in index.ts
  // would parse the body before we get a chance to verify, so this route
  // takes its own raw-body path.
  app.post(
    "/internal/markdown-to-yjs",
    (req: Request, res: Response, next: () => void) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        const total = chunks.reduce((n, c) => n + c.length, 0);
        if (total > MAX_MARKDOWN_BYTES + 1024) {
          // 1 KB slack for JSON envelope overhead.
          res.status(413).json({ error: "request too large" });
          req.destroy();
        }
      });
      req.on("end", () => {
        if (res.headersSent) return;
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.concat(chunks);
        next();
      });
      req.on("error", (err: Error) => {
        if (res.headersSent) return;
        res.status(400).json({ error: err.message });
      });
    },
    (req: Request, res: Response) => {
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      if (!rawBody) {
        res.status(400).json({ error: "empty body" });
        return;
      }

      const sigHeader = req.headers[SIGNATURE_HEADER];
      const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      if (!verifySignature(rawBody, sig)) {
        res.status(401).json({ error: "invalid or missing signature" });
        return;
      }

      let parsed: MarkdownRequestBody;
      try {
        parsed = JSON.parse(rawBody.toString("utf8")) as MarkdownRequestBody;
      } catch {
        res.status(400).json({ error: "malformed JSON" });
        return;
      }

      if (typeof parsed.markdown !== "string") {
        res.status(400).json({ error: "markdown field required" });
        return;
      }
      if (Buffer.byteLength(parsed.markdown, "utf8") > MAX_MARKDOWN_BYTES) {
        res.status(413).json({ error: "markdown exceeds 1 MB" });
        return;
      }

      try {
        const update = markdownToYjsUpdate(parsed.markdown);
        res
          .status(200)
          .setHeader("Content-Type", "application/octet-stream")
          .send(Buffer.from(update));
      } catch (err) {
        const message = err instanceof Error ? err.message : "conversion failed";
        console.error("markdown-to-yjs conversion error:", err);
        res.status(500).json({ error: message });
      }
    }
  );

  // Inverse direction: a Y.js update binary in, markdown out. Used by the
  // wiki export flow on the Go backend to render each document's stored
  // content_state back to Outline-flavored markdown for the export zip.
  app.post(
    "/internal/yjs-to-markdown",
    (req: Request, res: Response, next: () => void) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        const total = chunks.reduce((n, c) => n + c.length, 0);
        if (total > MAX_YJS_BYTES + 1024) {
          res.status(413).json({ error: "request too large" });
          req.destroy();
        }
      });
      req.on("end", () => {
        if (res.headersSent) return;
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.concat(chunks);
        next();
      });
      req.on("error", (err: Error) => {
        if (res.headersSent) return;
        res.status(400).json({ error: err.message });
      });
    },
    (req: Request, res: Response) => {
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      if (!rawBody) {
        res.status(400).json({ error: "empty body" });
        return;
      }

      const sigHeader = req.headers[SIGNATURE_HEADER];
      const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      if (!verifySignature(rawBody, sig)) {
        res.status(401).json({ error: "invalid or missing signature" });
        return;
      }

      if (rawBody.length === 0) {
        res
          .status(200)
          .setHeader("Content-Type", "text/markdown; charset=utf-8")
          .send("");
        return;
      }
      if (rawBody.length > MAX_YJS_BYTES) {
        res.status(413).json({ error: "yjs update exceeds 4 MB" });
        return;
      }

      try {
        const markdown = yjsUpdateToMarkdown(
          new Uint8Array(
            rawBody.buffer,
            rawBody.byteOffset,
            rawBody.byteLength,
          ),
        );
        res
          .status(200)
          .setHeader("Content-Type", "text/markdown; charset=utf-8")
          .send(markdown);
      } catch (err) {
        const message = err instanceof Error ? err.message : "conversion failed";
        console.error("yjs-to-markdown conversion error:", err);
        res.status(500).json({ error: message });
      }
    },
  );

  // One-shot backfill for credential backlinks. Sweeps every wiki document,
  // decodes content_state into a transient Y.Doc, runs the credential walker,
  // and writes credential_references. Idempotent — safe to re-run. Body is
  // empty (the HMAC signs the empty string); the response is a JSON summary.
  //
  // Required after deploying the credential backlinks feature so docs that
  // already embed /credential chips populate the inverse index without
  // waiting for the next editing session.
  app.post(
    "/internal/backfill-credential-references",
    (req: Request, res: Response, next: () => void) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        if (chunks.reduce((n, c) => n + c.length, 0) > 1024) {
          // Backfill takes no body; reject anything over 1 KB outright.
          res.status(413).json({ error: "request too large" });
          req.destroy();
        }
      });
      req.on("end", () => {
        if (res.headersSent) return;
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.concat(chunks);
        next();
      });
      req.on("error", (err: Error) => {
        if (res.headersSent) return;
        res.status(400).json({ error: err.message });
      });
    },
    async (req: Request, res: Response) => {
      const rawBody =
        (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);

      const sigHeader = req.headers[SIGNATURE_HEADER];
      const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      if (!verifySignature(rawBody, sig)) {
        res.status(401).json({ error: "invalid or missing signature" });
        return;
      }

      try {
        const summary = await runCredentialReferenceBackfill();
        res.status(200).json(summary);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "backfill failed";
        console.error("backfill-credential-references error:", err);
        res.status(500).json({ error: message });
      }
    },
  );

  // One-shot backfill for hash backlinks. Sibling of the credential backfill
  // above — sweeps every wiki document, runs the hash walker, and writes
  // hash_references. Idempotent. Required after deploying the hash backlinks
  // feature so docs that already embed /hash chips populate the inverse index.
  app.post(
    "/internal/backfill-hash-references",
    (req: Request, res: Response, next: () => void) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        if (chunks.reduce((n, c) => n + c.length, 0) > 1024) {
          // Backfill takes no body; reject anything over 1 KB outright.
          res.status(413).json({ error: "request too large" });
          req.destroy();
        }
      });
      req.on("end", () => {
        if (res.headersSent) return;
        (req as Request & { rawBody?: Buffer }).rawBody = Buffer.concat(chunks);
        next();
      });
      req.on("error", (err: Error) => {
        if (res.headersSent) return;
        res.status(400).json({ error: err.message });
      });
    },
    async (req: Request, res: Response) => {
      const rawBody =
        (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);

      const sigHeader = req.headers[SIGNATURE_HEADER];
      const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      if (!verifySignature(rawBody, sig)) {
        res.status(401).json({ error: "invalid or missing signature" });
        return;
      }

      try {
        const summary = await runHashReferenceBackfill();
        res.status(200).json(summary);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "backfill failed";
        console.error("backfill-hash-references error:", err);
        res.status(500).json({ error: message });
      }
    },
  );
}
