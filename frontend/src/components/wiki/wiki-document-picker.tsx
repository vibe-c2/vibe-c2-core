import type { Editor } from "@tiptap/core"
import { openWikiDocumentPicker } from "@/components/wiki/wiki-command-palette"

// Compatibility shim for the /doc slash-command call site. The picker UI
// itself is the unified search/picker palette in `wiki-command-palette.tsx`,
// mounted once at the app shell — this wrapper just captures the editor +
// insertion position at the moment the slash command fires and forwards to
// the shared palette (pick mode) with a doc-reference-insert onPick callback.
//
// Kept as a separate module so the slash-command items file doesn't need to
// know about wikiDocumentReference node attrs (the editor-specific bit) or
// the palette's imperative store (the surface-agnostic bit).

interface PickerArgs {
  editor: Editor
  operationId: string
  insertPos: number
  /** Document IDs to disable in the picker — typically the currently open
   *  document, so users can't link a page to itself. */
  excludeIds?: string[]
}

export function openDocumentPicker({
  editor,
  operationId,
  insertPos,
  excludeIds,
}: PickerArgs) {
  openWikiDocumentPicker({
    operationId,
    excludeIds,
    title: "Insert document reference",
    description: "Pick another wiki document in this operation to link inline.",
    onPick: (doc) => {
      // Use the captured insertion position rather than the editor's current
      // selection — by the time the dialog closes the cursor has moved into
      // the dialog and back.
      editor
        .chain()
        .focus()
        .insertContentAt(insertPos, {
          type: "wikiDocumentReference",
          attrs: { documentId: doc.id },
        })
        .run()
    },
  })
}
