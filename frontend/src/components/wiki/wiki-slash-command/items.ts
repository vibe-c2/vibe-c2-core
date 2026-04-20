import type { Editor, Range } from "@tiptap/core"
import {
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  QuoteIcon,
  SquareCodeIcon,
  TableIcon,
  type LucideIcon,
} from "lucide-react"
import { pickAndUploadWikiImage } from "@/components/wiki/wiki-image-upload"

/** Context the slash command plugin passes through to every item's command.
 *  Extensions forward this via their `options.context` so items that need
 *  document-scoped resources (uploads, presence) can reach them. */
export interface SlashItemContext {
  documentId: string
}

export interface SlashItem {
  title: string
  description: string
  keywords: string[]
  icon: LucideIcon
  command: (props: {
    editor: Editor
    range: Range
    context: SlashItemContext
  }) => void
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    title: "Heading 1",
    description: "Big section heading",
    keywords: ["h1", "title", "big"],
    icon: Heading1Icon,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run()
    },
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    keywords: ["h2", "subtitle"],
    icon: Heading2Icon,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run()
    },
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    keywords: ["h3"],
    icon: Heading3Icon,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run()
    },
  },
  {
    title: "Bullet list",
    description: "Unordered list",
    keywords: ["bullet", "ul", "unordered"],
    icon: ListIcon,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: "Numbered list",
    description: "Ordered list",
    keywords: ["number", "ol", "ordered"],
    icon: ListOrderedIcon,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: "Task list",
    description: "Checkable to-do list",
    keywords: ["task", "todo", "check"],
    icon: ListTodoIcon,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run()
    },
  },
  {
    title: "Code block",
    description: "Fenced code with syntax",
    keywords: ["code", "fence", "pre"],
    icon: SquareCodeIcon,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
  },
  {
    title: "Quote",
    description: "Blockquote",
    keywords: ["blockquote", "cite"],
    icon: QuoteIcon,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    title: "Table",
    description: "3×3 table with header row",
    keywords: ["table", "grid", "rows", "columns"],
    icon: TableIcon,
    command: ({ editor, range }) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run()
    },
  },
  {
    title: "Image",
    description: "Upload from your computer",
    keywords: ["image", "picture", "photo", "img", "upload"],
    icon: ImageIcon,
    command: ({ editor, range, context }) => {
      // Delete the slash range first; capture the caret position *after*
      // the deletion so the uploaded image lands where the trigger was.
      editor.chain().focus().deleteRange(range).run()
      const pos = editor.state.selection.from
      pickAndUploadWikiImage(editor, context.documentId, { pos })
    },
  },
]

export function filterItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_ITEMS
  return SLASH_ITEMS.filter((item) => {
    if (item.title.toLowerCase().includes(q)) return true
    return item.keywords.some((k) => k.toLowerCase().includes(q))
  })
}
