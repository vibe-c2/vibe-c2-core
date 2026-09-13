// Rebase a wiki document body onto a new set of identifiers.
//
// A page that moves between operations or installations references things
// by id: other pages, hosts, hashes, credentials, its own attachments. Every
// one of those ids is minted by the target on import, so the body has to be
// rewritten before it is stored. The rewrite happens here, on the ProseMirror
// tree, because the ids live in node attributes — not in any text a regex
// could safely reach. The same pass derives the persisted projection so the
// Go backend can create the page fully indexed in one write, exactly as
// persistence.ts would have indexed it after an editor save.
//
// Input is either raw Y.js state (a native bundle) or markdown (a foreign
// zip); output is always fresh Y.js state plus the projection.

import * as Y from "yjs";
import type { Node } from "prosemirror-model";
import { prosemirrorJSONToYDoc, yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import { wikiSchema } from "./wiki-schema.js";
import { parseOutlineMarkdown } from "./markdown-parser.js";
import { REFERENCE_CHIP_KINDS } from "./markdown-serializer.js";
import { deriveProjection, type BodyProjection } from "./projection.js";

export const Y_FRAGMENT_FIELD = "default";

/** Reference kinds a caller may name in `dropUnmappedKinds`. */
export type ChipKind = "doc" | "host" | "hash" | "credential";

export interface RebaseRequest {
  /** Existing Y.js state to rebase. Exactly one of contentState / markdown. */
  contentState?: Uint8Array;
  /** Markdown to parse and rebase. Exactly one of contentState / markdown. */
  markdown?: string;
  /** source id → target id, for every kind of reference. Lowercase or not. */
  idMap: Record<string, string>;
  /** Ids whose chips are lowered to their plain label, whatever their kind. */
  drop?: string[];
  /**
   * Chip kinds for which an id absent from idMap (and not in drop) is
   * lowered to text rather than left in place. A cross-operation import
   * names every kind here; a same-operation import names none, because an
   * unmapped host or page id is still valid there.
   */
  dropUnmappedKinds?: ChipKind[];
}

export interface RebaseResult extends BodyProjection {
  /** Fresh Y.js update encoding the rebased document. */
  contentState: Uint8Array;
  /** Ids the body still references that were neither mapped nor dropped. */
  unmapped: string[];
  /** Number of chips lowered to plain text. */
  dropped: number;
  /** Number of id attributes rewritten. */
  remapped: number;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_SRC_RE =
  /^(.*\/api\/v1\/wiki\/images\/)([0-9a-f-]{36})(.*)$/i;

type JsonNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  text?: string;
  marks?: unknown[];
};

interface Kind {
  kind: ChipKind;
  node: string;
  idAttr: string;
  label: string;
}

// The inline reference chips, from the serializer's single source of truth,
// plus the credential chip which the serializer carries as a fenced block
// rather than a link and therefore does not list there.
const CHIP_KINDS: Kind[] = [
  ...REFERENCE_CHIP_KINDS.map((k) => ({
    kind: k.segment as ChipKind,
    node: k.node,
    idAttr: k.idAttr,
    label: k.label,
  })),
  {
    kind: "credential",
    node: "wikiCredentialReference",
    idAttr: "credentialId",
    label: "credential",
  },
];

class Rewriter {
  private readonly idMap = new Map<string, string>();
  private readonly drop = new Set<string>();
  private readonly dropKinds: Set<ChipKind>;
  readonly unmapped = new Set<string>();
  dropped = 0;
  remapped = 0;

  constructor(req: RebaseRequest) {
    for (const [from, to] of Object.entries(req.idMap ?? {})) {
      this.idMap.set(from.toLowerCase(), to.toLowerCase());
    }
    for (const id of req.drop ?? []) this.drop.add(id.toLowerCase());
    this.dropKinds = new Set(req.dropUnmappedKinds ?? []);
  }

  /** Rewrite a node in place; returns a replacement node, or null to keep. */
  visit(node: JsonNode): JsonNode | null {
    const kind = CHIP_KINDS.find((k) => k.node === node.type);
    if (kind) return this.visitChip(node, kind);
    if (node.type === "image") return this.visitImage(node);
    if (node.type === "wikiFile") return this.visitFile(node);
    return null;
  }

  private visitChip(node: JsonNode, kind: Kind): JsonNode | null {
    const raw = String(node.attrs?.[kind.idAttr] ?? "");
    const id = raw.toLowerCase();
    if (!UUID_RE.test(id)) {
      // A chip with no usable id is already dead; lower it so it cannot be
      // mistaken for a live reference on the target.
      return this.lower(kind);
    }
    const mapped = this.idMap.get(id);
    if (mapped !== undefined) {
      this.remapped += 1;
      return { ...node, attrs: { ...node.attrs, [kind.idAttr]: mapped } };
    }
    if (this.drop.has(id) || this.dropKinds.has(kind.kind)) {
      return this.lower(kind);
    }
    this.unmapped.add(id);
    return null;
  }

  private lower(kind: Kind): JsonNode {
    this.dropped += 1;
    return { type: "text", text: kind.label };
  }

  private visitImage(node: JsonNode): JsonNode | null {
    const src = node.attrs?.src;
    if (typeof src !== "string") return null;
    const m = IMAGE_SRC_RE.exec(src);
    if (!m) return null;
    const id = m[2].toLowerCase();
    const mapped = this.idMap.get(id);
    if (mapped === undefined) {
      this.unmapped.add(id);
      return null;
    }
    this.remapped += 1;
    // Always store the canonical relative form: an exported page may carry
    // an absolute URL, and baking one deployment's host into another's
    // documents is exactly the drift the rebase exists to prevent.
    return {
      ...node,
      attrs: { ...node.attrs, src: `/api/v1/wiki/images/${mapped}${m[3]}` },
    };
  }

  private visitFile(node: JsonNode): JsonNode | null {
    const raw = String(node.attrs?.fileId ?? "");
    const id = raw.toLowerCase();
    if (!UUID_RE.test(id)) return null;
    const mapped = this.idMap.get(id);
    if (mapped === undefined) {
      this.unmapped.add(id);
      return null;
    }
    this.remapped += 1;
    return {
      ...node,
      attrs: {
        ...node.attrs,
        fileId: mapped,
        url: `/api/v1/wiki/files/${mapped}`,
      },
    };
  }
}

function walk(node: JsonNode, rw: Rewriter): JsonNode {
  const replaced = rw.visit(node);
  if (replaced) return replaced;
  if (!Array.isArray(node.content)) return node;
  return { ...node, content: node.content.map((c) => walk(c, rw)) };
}

function loadDocument(req: RebaseRequest): Node {
  if (req.contentState && req.contentState.length > 0) {
    const ydoc = new Y.Doc();
    try {
      Y.applyUpdate(ydoc, req.contentState);
      const fragment = ydoc.getXmlFragment(Y_FRAGMENT_FIELD);
      if (fragment.length === 0) {
        return wikiSchema.nodes.doc.create(null, wikiSchema.nodes.paragraph.create());
      }
      return yXmlFragmentToProseMirrorRootNode(fragment, wikiSchema);
    } finally {
      ydoc.destroy();
    }
  }
  return parseOutlineMarkdown(req.markdown ?? "");
}

/**
 * Rebase a document body. Throws only when the input bytes are not a Y.js
 * update or the rewritten tree no longer fits the schema — both are
 * per-document failures the caller records and moves past.
 */
export function rebaseDocument(req: RebaseRequest): RebaseResult {
  const source = loadDocument(req);
  const rw = new Rewriter(req);
  const rewritten = walk(source.toJSON() as JsonNode, rw);
  // Validate against the schema before encoding: an invalid tree would
  // otherwise become bytes the editor can never open.
  const checked = wikiSchema.nodeFromJSON(rewritten);
  checked.check();

  const ydoc = prosemirrorJSONToYDoc(wikiSchema, checked.toJSON(), Y_FRAGMENT_FIELD);
  try {
    const projection = deriveProjection(ydoc.getXmlFragment(Y_FRAGMENT_FIELD));
    return {
      ...projection,
      contentState: Y.encodeStateAsUpdate(ydoc),
      unmapped: [...rw.unmapped].sort(),
      dropped: rw.dropped,
      remapped: rw.remapped,
    };
  } finally {
    ydoc.destroy();
  }
}
