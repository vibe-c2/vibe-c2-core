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
import { markdownToYjsUpdate } from "./markdown-to-yjs.js";

const internalSecret = process.env.HOCUSPOCUS_WEBHOOK_SECRET || "";
const SIGNATURE_HEADER = "x-internal-signature-256";
const MAX_MARKDOWN_BYTES = 1024 * 1024; // 1 MB — matches WikiDocument.Content cap.

interface MarkdownRequestBody {
  markdown?: unknown;
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
}
