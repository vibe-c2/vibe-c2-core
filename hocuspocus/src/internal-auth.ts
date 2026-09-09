// Shared plumbing for the internal HTTP API: raw-body capture and HMAC
// verification.
//
// The signature has to cover the exact bytes the Go client signed, so these
// routes cannot sit behind express.json() — it would consume and reparse the
// body first. Every internal route therefore reads the body itself, which is
// why this lives in one place rather than being copied per route.

import type { Request, Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";

const internalSecret = process.env.HOCUSPOCUS_WEBHOOK_SECRET || "";

export const SIGNATURE_HEADER = "x-internal-signature-256";

/** Request with the raw bytes captured by readRawBody attached. */
export type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * verifyInternalSignature checks the HMAC-SHA256 of the raw body against the
 * shared secret, in constant time.
 *
 * Fails closed when no secret is configured: an unsigned internal API that
 * can rewrite wiki documents is worse than a broken one.
 */
export function verifyInternalSignature(
  rawBody: Buffer,
  headerValue: string | undefined
): boolean {
  if (!internalSecret || !headerValue) return false;
  // The Go client always sends "sha256=<hex>". Requiring the prefix keeps a
  // bare hex digest from being accepted by a future client that forgets it.
  if (!headerValue.startsWith("sha256=")) return false;

  const provided = headerValue.slice("sha256=".length);
  const expected = createHmac("sha256", internalSecret).update(rawBody).digest("hex");

  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
}

/**
 * readRawBody buffers the request body up to maxBytes and attaches it as
 * req.rawBody. Over-sized requests are rejected mid-stream rather than after
 * the fact, so a hostile caller cannot make the process buffer without bound.
 *
 * The 1 KB slack covers the JSON envelope around the payload the limit is
 * really about.
 */
export function readRawBody(maxBytes: number) {
  return (req: Request, res: Response, next: () => void): void => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes + 1024) {
        if (!res.headersSent) res.status(413).json({ error: "request too large" });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (res.headersSent) return;
      (req as RawBodyRequest).rawBody = Buffer.concat(chunks);
      next();
    });

    req.on("error", (err: Error) => {
      if (res.headersSent) return;
      res.status(400).json({ error: err.message });
    });
  };
}

/**
 * requireSignature is the guard every internal write route runs first.
 * Returns the verified body, or null once it has already answered the request.
 */
export function requireSignature(req: Request, res: Response): Buffer | null {
  const rawBody = (req as RawBodyRequest).rawBody;
  if (!rawBody) {
    res.status(400).json({ error: "empty body" });
    return null;
  }
  const header = req.headers[SIGNATURE_HEADER];
  const sig = Array.isArray(header) ? header[0] : header;
  if (!verifyInternalSignature(rawBody, sig)) {
    res.status(401).json({ error: "invalid or missing signature" });
    return null;
  }
  return rawBody;
}
