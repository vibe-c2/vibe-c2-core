import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { WikiChecklistItemView } from "@/components/wiki/wiki-checklist-item-view"

// Operator-toggled coverage overrides. "" is the derived default (answered iff
// the answer region holds content). not_applicable counts as answered; flagged
// is "needs attention" and never counts.
export type ChecklistItemState = "" | "not_applicable" | "flagged"

export interface ChecklistItemAttrs {
  key: string | null
  prompt: string
  commandHint: string
  commandHintEnabled: boolean
  required: boolean
  state: ChecklistItemState
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikiChecklistItem: {
      insertChecklistItem: (attrs?: Partial<ChecklistItemAttrs>) => ReturnType
    }
  }
}

// A reasonably-unique stable key for an item — survives the byte-copy into
// instances and lets coverage/diffing address items independently. crypto is
// always present in the editor's browser context.
function newItemKey(): string {
  return crypto.randomUUID()
}

// A freshly-inserted item should land the caret in the question prompt (a plain
// textarea living outside ProseMirror), not the answer region where the editor
// selection lands by default. The insert command records the new item's key
// here; the NodeView consumes it once on mount and focuses its prompt input.
// Kept out of node attributes so it never persists into the document or syncs.
let pendingPromptFocusKey: string | null = null

export function requestChecklistPromptFocus(key: string): void {
  pendingPromptFocusKey = key
}

// Returns true exactly once for the key that was last requested, then clears it
// so the focus only fires for the just-inserted item and never on reload.
export function consumeChecklistPromptFocus(key: string): boolean {
  if (pendingPromptFocusKey !== key) return false
  pendingPromptFocusKey = null
  return true
}

function parseBool(raw: string | null, fallback: boolean): boolean {
  if (raw === "true") return true
  if (raw === "false") return false
  return fallback
}

/**
 * Block node holding one checklist question and its answer. The structure
 * (prompt, command hint, required, state) lives in node attributes; the
 * answer is the content region (`block+`) — freeform markdown, including any
 * reference chip (/credential, /hash, and in future /host) inserted exactly as
 * it would be anywhere else in the wiki. There is no "answer type": every
 * question accepts any content. Coverage is derived from this shape by the
 * Hocuspocus sidecar (answered iff the region is non-empty, or marked N/A).
 * Mirrors the wikiNotice block-with-content pattern.
 *
 * Serializes to `<div data-type="wiki-checklist-item" …>` so HTML consumers
 * that strip custom nodes still see a stable marker plus the answer prose.
 */
export const WikiChecklistItemExtension = Node.create({
  name: "wikiChecklistItem",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      key: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-key"),
        renderHTML: (attrs) =>
          attrs.key ? { "data-key": attrs.key as string } : {},
      },
      prompt: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-prompt") ?? "",
        renderHTML: (attrs) => ({
          "data-prompt": (attrs.prompt as string) || "",
        }),
      },
      commandHint: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-command-hint") ?? "",
        renderHTML: (attrs) => ({
          "data-command-hint": (attrs.commandHint as string) || "",
        }),
      },
      commandHintEnabled: {
        default: false,
        parseHTML: (el) =>
          parseBool(el.getAttribute("data-command-hint-enabled"), false),
        renderHTML: (attrs) =>
          attrs.commandHintEnabled
            ? { "data-command-hint-enabled": "true" }
            : {},
      },
      required: {
        default: true,
        parseHTML: (el) => parseBool(el.getAttribute("data-required"), true),
        renderHTML: (attrs) => ({
          "data-required": attrs.required ? "true" : "false",
        }),
      },
      state: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-state") ?? "",
        renderHTML: (attrs) => ({ "data-state": (attrs.state as string) || "" }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="wiki-checklist-item"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "wiki-checklist-item",
        class: "wiki-checklist-item",
      }),
      0,
    ]
  },

  addCommands() {
    return {
      insertChecklistItem:
        (attrs) =>
        ({ chain }) => {
          const key = attrs?.key ?? newItemKey()
          // Steer the caret to the prompt textarea once the NodeView mounts,
          // instead of leaving it in the answer region.
          requestChecklistPromptFocus(key)
          return chain()
            .insertContent({
              type: this.name,
              attrs: {
                key,
                prompt: attrs?.prompt ?? "",
                commandHint: attrs?.commandHint ?? "",
                commandHintEnabled: attrs?.commandHintEnabled ?? false,
                required: attrs?.required ?? true,
                state: attrs?.state ?? "",
              },
              // Seed an empty paragraph so the answer region has a cursor target.
              content: [{ type: "paragraph" }],
            })
            .run()
        },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiChecklistItemView)
  },
})
