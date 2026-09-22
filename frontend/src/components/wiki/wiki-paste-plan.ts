// What the editor does with a text paste, kept pure so it can be unit-tested
// without a DOM or a ProseMirror schema. The handler in wiki-editor.tsx reads
// the clipboard and dispatches; this function only decides.
//
// The `scrollIntoView` field is the interesting one, and it is the fix for a
// real regression: pasting a long snippet into a code block left the reader at
// the bottom of the page.
//
// ProseMirror's default paste dispatches with scrollIntoView(), which assigns
// scrollTop up the ancestor chain to reveal the caret — by then sitting at the
// END of everything pasted. A paste long enough to matter also pushes the block
// past the collapse threshold (see wiki-code-block), so one frame later the
// NodeView clamps it to a ~16-line preview and the document loses every pixel
// the scroll was aimed at. The browser clamps the now-impossible offset, and the
// reader ends up at the bottom of the page, nowhere near their caret or the
// block they pasted into.
//
// So a code-block paste plans no scroll: the reader stays exactly where they
// were, looking at the block they pasted into. Prose pastes keep the normal
// follow-the-caret behaviour, because nothing there collapses under them.

export type PasteKind =
  // Inside a code block: insert the clipboard text verbatim, markers and all,
  // because the markers are part of the source being copied in.
  | "code-literal"
  // Prose, and the clipboard holds something Markdown-shaped: convert it.
  // StarterKit only registers *typed* input rules, so pasted
  // headings/lists/fences/links would otherwise land as flat plaintext.
  | "markdown"
  // Nothing to do here — let ProseMirror handle it.
  | "passthrough"

export interface PastePlan {
  kind: PasteKind
  /** Whether the dispatch should ask ProseMirror to reveal the caret. */
  scrollIntoView: boolean
}

export interface PasteInput {
  /** Whether the selection sits inside a code block. */
  inCodeBlock: boolean
  /** Plain text on the clipboard, or null/empty when there is none. */
  plainText: string | null | undefined
  /** Whether the clipboard looks like Markdown source. The detection lives in
   *  wiki-markdown-paste.ts; this function only judges the result. */
  hasMarkdown: boolean
}

export function pastePlan({
  inCodeBlock,
  plainText,
  hasMarkdown,
}: PasteInput): PastePlan {
  if (inCodeBlock) {
    // With no text there is nothing to insert literally, and handing an empty
    // paste back to ProseMirror costs nothing — it will decide there is nothing
    // to do too, and its scroll would be a no-op on an unchanged document.
    if (!plainText) return { kind: "passthrough", scrollIntoView: false }
    return { kind: "code-literal", scrollIntoView: false }
  }
  if (hasMarkdown) return { kind: "markdown", scrollIntoView: true }
  return { kind: "passthrough", scrollIntoView: false }
}
