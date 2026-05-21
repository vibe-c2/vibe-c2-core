import type { Editor, Range } from "@tiptap/core"
import {
  CircleAlertIcon,
  CircleCheckIcon,
  FileTextIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  InfoIcon,
  KeyIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  PaperclipIcon,
  QuoteIcon,
  SquareCodeIcon,
  StarIcon,
  TableIcon,
  type LucideIcon,
} from "lucide-react"
import { pickAndUploadWikiImage } from "@/components/wiki/wiki-image-upload"
import { pickAndUploadWikiFile } from "@/components/wiki/wiki-file-upload"
import { startLinkInsert } from "@/components/wiki/wiki-link-popover"
import { openCredentialPicker } from "@/components/wiki/wiki-credential-picker"
import { openDocumentPicker } from "@/components/wiki/wiki-document-picker"
import type { NoticeVariant } from "@/components/wiki/wiki-notice-node"

/** Context the slash command plugin passes through to every item's command.
 *  Extensions forward this via their `options.context` so items that need
 *  document-scoped resources (uploads, presence) can reach them. */
export interface SlashItemContext {
  documentId: string
  /** Operation this document belongs to. Threaded so cross-feature slash items
   *  (e.g. credential references) can query operation-scoped data without
   *  re-deriving it from the document. */
  operationId: string
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

interface NoticeSpec {
  variant: NoticeVariant
  title: string
  description: string
  keywords: string[]
  icon: LucideIcon
}

const NOTICE_SPECS: NoticeSpec[] = [
  {
    variant: "info",
    title: "Info notice",
    description: "Highlight a piece of information",
    keywords: ["info", "notice", "callout", "note"],
    icon: InfoIcon,
  },
  {
    variant: "success",
    title: "Success notice",
    description: "Confirm an outcome or completed step",
    keywords: ["success", "notice", "callout", "ok", "done"],
    icon: CircleCheckIcon,
  },
  {
    variant: "warning",
    title: "Warning notice",
    description: "Call out a risk or caveat",
    keywords: ["warning", "notice", "callout", "caution", "danger", "alert"],
    icon: CircleAlertIcon,
  },
  {
    variant: "tip",
    title: "Tip notice",
    description: "Share a tip or shortcut",
    keywords: ["tip", "notice", "callout", "hint", "advice"],
    icon: StarIcon,
  },
]

const NOTICE_ITEMS: SlashItem[] = NOTICE_SPECS.map((spec) => ({
  title: spec.title,
  description: spec.description,
  keywords: spec.keywords,
  icon: spec.icon,
  command: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).setNotice(spec.variant).run()
  },
}))

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
  ...NOTICE_ITEMS,
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
  {
    title: "File",
    description: "Attach a file (up to 50 MB)",
    keywords: ["file", "attachment", "upload", "pdf", "doc", "zip"],
    icon: PaperclipIcon,
    command: ({ editor, range, context }) => {
      editor.chain().focus().deleteRange(range).run()
      const pos = editor.state.selection.from
      pickAndUploadWikiFile(editor, context.documentId, { pos })
    },
  },
  {
    title: "Link",
    description: "Insert a URL with custom text",
    keywords: ["link", "url", "href", "anchor", "hyperlink"],
    icon: LinkIcon,
    command: ({ editor, range }) => {
      // Drop the slash range first, then hand off to the shared inserter so
      // the Cmd+K, bubble-menu, and slash entry points all behave the same.
      editor.chain().focus().deleteRange(range).run()
      startLinkInsert(editor)
    },
  },
  {
    title: "Document reference",
    description: "Link inline to another wiki document",
    keywords: [
      "doc",
      "doc:",
      "document",
      "page",
      "wiki",
      "ref",
      "reference",
      "mention",
    ],
    icon: FileTextIcon,
    command: ({ editor, range, context }) => {
      // Drop the slash trigger first so the chip lands where the user typed.
      editor.chain().focus().deleteRange(range).run()
      const pos = editor.state.selection.from
      openDocumentPicker({
        editor,
        operationId: context.operationId,
        insertPos: pos,
        excludeIds: [context.documentId],
      })
    },
  },
  {
    title: "Credential reference",
    description: "Reference a stored credential from this operation",
    keywords: [
      "findings:credential",
      "credential",
      "credentials",
      "creds",
      "findings",
      "secret",
      "password",
      "key",
      "auth",
    ],
    icon: KeyIcon,
    command: ({ editor, range, context }) => {
      // Drop the slash trigger first so the chip lands where the user typed.
      editor.chain().focus().deleteRange(range).run()
      const pos = editor.state.selection.from
      openCredentialPicker({
        editor,
        operationId: context.operationId,
        insertPos: pos,
      })
    },
  },
]

// Memoize filtered results so repeated calls with the same query return the
// SAME array reference. @tiptap/suggestion calls `items({query})` on every
// transaction where the trigger range shifted (e.g. a remote collaborator
// typed before the local caret), even when the query string is unchanged.
// Without this cache, `.filter()` would allocate a fresh array each time and
// downstream React code that uses reference equality (SlashMenu's
// selectedIndex guard) would reset state on every remote keystroke.
const filterCache = new Map<string, SlashItem[]>()

export function filterItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_ITEMS
  const cached = filterCache.get(q)
  if (cached) return cached
  const filtered = SLASH_ITEMS.filter((item) => {
    if (item.title.toLowerCase().includes(q)) return true
    return item.keywords.some((k) => k.toLowerCase().includes(q))
  })
  filterCache.set(q, filtered)
  return filtered
}
