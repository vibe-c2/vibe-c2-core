// After an agent writes to a page, say how its file links landed.
//
// A wiki attachment is shown as a card only when the link to it was lifted
// into a wikiFile block; a link with text beside it, or one the parser could
// not lift, stays an ordinary link that the operator sees as plain text. The
// page reads back as identical markdown either way, so an agent cannot tell
// the two apart by re-reading. This audit runs on the live fragment after a
// write and reports both counts, so the write result can say "one of your
// file links is not an attachment card" and the agent can fix it.

import * as Y from "yjs";
import { FILE_HREF_PATTERN } from "./markdown-parser.js";

export interface StrayFileLink {
  fileId: string;
  label: string;
}

export interface AttachmentAudit {
  /** wikiFile blocks on the page: files shown as attachment cards. */
  attachmentCards: number;
  /** Links to /api/v1/wiki/files/<id> that stayed plain links. */
  strayFileLinks: StrayFileLink[];
}

export function auditAttachments(fragment: Y.XmlFragment | Y.XmlElement): AttachmentAudit {
  const audit: AttachmentAudit = { attachmentCards: 0, strayFileLinks: [] };
  walk(fragment, audit);
  return audit;
}

function walk(node: Y.XmlFragment | Y.XmlElement, audit: AttachmentAudit): void {
  for (const child of node.toArray()) {
    if (child instanceof Y.XmlText) {
      collectStrayLinks(child, audit);
      continue;
    }
    if (!(child instanceof Y.XmlElement)) continue;
    if (child.nodeName === "wikiFile") {
      audit.attachmentCards += 1;
      continue;
    }
    walk(child, audit);
  }
}

// y-prosemirror stores a mark as a delta attribute keyed by mark name, so a
// linked run is an insert op whose `link` attribute carries the href.
function collectStrayLinks(text: Y.XmlText, audit: AttachmentAudit): void {
  for (const op of text.toDelta() as Array<{ insert?: unknown; attributes?: Record<string, unknown> }>) {
    if (typeof op.insert !== "string") continue;
    const link = op.attributes?.link as { href?: unknown } | undefined;
    if (!link || typeof link.href !== "string") continue;
    const m = FILE_HREF_PATTERN.exec(link.href);
    if (!m) continue;
    audit.strayFileLinks.push({ fileId: m[1], label: op.insert });
  }
}
