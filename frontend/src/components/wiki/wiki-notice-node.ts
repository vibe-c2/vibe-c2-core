import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { WikiNoticeView } from "@/components/wiki/wiki-notice-view"

export type NoticeVariant = "info" | "success" | "warning" | "tip"

export const NOTICE_VARIANTS: NoticeVariant[] = ["info", "success", "warning", "tip"]

export const DEFAULT_NOTICE_VARIANT: NoticeVariant = "info"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    wikiNotice: {
      setNotice: (variant?: NoticeVariant) => ReturnType
    }
  }
}

function isNoticeVariant(value: unknown): value is NoticeVariant {
  return typeof value === "string" && (NOTICE_VARIANTS as string[]).includes(value)
}

export const WikiNoticeExtension = Node.create({
  name: "wikiNotice",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: DEFAULT_NOTICE_VARIANT,
        parseHTML: (el) => {
          const raw = el.getAttribute("data-variant")
          return isNoticeVariant(raw) ? raw : DEFAULT_NOTICE_VARIANT
        },
        renderHTML: (attrs) => ({
          "data-variant": isNoticeVariant(attrs.variant)
            ? attrs.variant
            : DEFAULT_NOTICE_VARIANT,
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="wiki-notice"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "wiki-notice",
        class: "wiki-notice",
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setNotice:
        (variant) =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: this.name,
              attrs: { variant: variant ?? DEFAULT_NOTICE_VARIANT },
              content: [{ type: "paragraph" }],
            })
            .run(),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(WikiNoticeView)
  },
})
