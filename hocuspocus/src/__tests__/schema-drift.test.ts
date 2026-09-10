// Guards the sidecar schema against the editor drifting away from it.
//
// The sidecar's wiki-schema.ts is what Y.js binary is translated through on
// its way to markdown. A node type the editor writes but this schema does not
// declare is not a styling regression: y-prosemirror drops it outright, and
// the markdown serializer is non-strict, so a node with no serializer entry
// is skipped without a word. Either way the content silently disappears —
// and because an agent's update_wiki_document writes the markdown back, the
// next write deletes it from the document for good.
//
// That is how checklist items, host references, document references and hash
// references all became invisible to agents at once. This test reads the
// editor's own extension files and fails when a new one arrives without the
// two entries it needs here.

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { wikiSchema } from "../wiki-schema.js";
import { serializerNodeNames } from "../markdown-serializer.js";

const here = dirname(fileURLToPath(import.meta.url));
const EDITOR_DIR = join(here, "../../../frontend/src/components/wiki");

// Tiptap declares a node or mark as `Node.create({ name: "wikiX", …})`. The
// name is always the first key, on its own line, in every one of these files.
const DECLARATION = /\b(Node|Mark)\.create\(\{\s*\n\s*name: "([^"]+)"/g;

interface Declaration {
  kind: "Node" | "Mark";
  name: string;
  file: string;
}

function editorDeclarations(): Declaration[] {
  const found: Declaration[] = [];
  for (const file of readdirSync(EDITOR_DIR)) {
    if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
    const source = readFileSync(join(EDITOR_DIR, file), "utf8");
    for (const match of source.matchAll(DECLARATION)) {
      found.push({ kind: match[1] as "Node" | "Mark", name: match[2], file });
    }
  }
  return found;
}

// If this fires, the regex above stopped matching the editor's style rather
// than the editor having lost its custom nodes — which would make every
// assertion below vacuously pass.
test("the editor's custom nodes are discoverable", () => {
  const declared = editorDeclarations();
  assert.ok(
    declared.length >= 7,
    `only found ${declared.length} editor declarations in ${EDITOR_DIR}; ` +
      "the detection regex has probably gone stale",
  );
  assert.ok(
    declared.some((d) => d.name === "wikiChecklistItem"),
    "did not find wikiChecklistItem — detection is broken",
  );
});

test("every editor node exists in the sidecar schema", () => {
  const missing = editorDeclarations().filter((d) =>
    d.kind === "Node" ? !wikiSchema.nodes[d.name] : !wikiSchema.marks[d.name],
  );

  assert.deepEqual(
    missing.map((d) => `${d.name} (${d.file})`),
    [],
    "these editor nodes are absent from hocuspocus/src/wiki-schema.ts. " +
      "y-prosemirror drops what the schema does not declare, so an agent " +
      "reading the document cannot see them and writing it back deletes them",
  );
});

test("every editor node can be serialized to markdown", () => {
  const emitted = serializerNodeNames();

  // wikiCredentialReference is the documented exception: it is lifted to a
  // wikiCredentialBlock before serialization, because a fence is block-level
  // and the chip has to carry a JSON payload for cross-instance import.
  const liftedBeforeSerializing = new Set(["wikiCredentialReference"]);

  const missing = editorDeclarations()
    .filter((d) => d.kind === "Node")
    .filter((d) => !liftedBeforeSerializing.has(d.name))
    .filter((d) => !emitted.has(d.name));

  assert.deepEqual(
    missing.map((d) => `${d.name} (${d.file})`),
    [],
    "these nodes have no entry in hocuspocus/src/markdown-serializer.ts. " +
      "The serializer is non-strict, so they are skipped silently rather " +
      "than raising — the content just vanishes from what an agent reads",
  );
});

// Declaring a node without teaching the parser to read it back is the other
// half of the same failure: the agent sees it, edits around it, and the write
// drops it. Asserted through a real round trip rather than by inspecting the
// token map, because a chip's route home is a post-parse pass, not a token.
test("every custom node survives a markdown round trip", async () => {
  const { parseOutlineMarkdown } = await import("../markdown-parser.js");
  const { serializeWikiDocument } = await import("../markdown-serializer.js");

  const samples: Record<string, string> = {
    wikiChecklistItem:
      ':::checklist {"prompt":"Enumerated SMB?","required":true,"state":"answered"}\nYes.\n\n:::',
    wikiHostReference: "on [host](vibe://host/11111111-1111-1111-1111-111111111111)",
    wikiHashReference: "cracked [hash](vibe://hash/22222222-2222-2222-2222-222222222222)",
    wikiDocumentReference: "see [page](vibe://doc/33333333-3333-3333-3333-333333333333)",
    wikiNotice: ":::warning\nmind the gap\n\n:::",
    wikiFile: "[report.docx 120](/api/v1/wiki/files/44444444-4444-4444-4444-444444444444)",
    // Not declared via Node.create — it comes from Tiptap's own TaskList —
    // but it belongs to the same contract: the serializer emitted GFM
    // checkboxes long before anything parsed them back.
    taskList: "- [x] ran the sweep\n- [ ] wrote it up",
  };

  for (const [node, markdown] of Object.entries(samples)) {
    const parsed = parseOutlineMarkdown(markdown);

    let present = false;
    parsed.descendants((child) => {
      if (child.type.name === node) present = true;
      return !present;
    });
    assert.ok(present, `${node}: markdown sample did not parse into the node`);

    const again = parseOutlineMarkdown(serializeWikiDocument(parsed));
    assert.equal(
      JSON.stringify(again.toJSON()),
      JSON.stringify(parsed.toJSON()),
      `${node}: did not survive serialize → parse`,
    );
  }
});
