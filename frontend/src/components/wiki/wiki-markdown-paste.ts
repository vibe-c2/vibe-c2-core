import MarkdownIt from "markdown-it"
import {
  DOMParser as PMDOMParser,
  type Schema,
  type Slice,
} from "@tiptap/pm/model"
import { CODE_LANGUAGES } from "@/lib/wiki-lowlight"

// Map common shorthand language tags onto the canonical highlight.js IDs our
// `CODE_LANGUAGES` list exposes. Anything missing from both the alias map and
// `KNOWN_LANGUAGES` falls back to "plaintext" so the language selector
// renders a real option instead of a blank value (and so the highlight plugin
// gets a stable id to memoize against).
const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  kt: "kotlin",
  cs: "csharp",
  "c#": "csharp",
  "c++": "cpp",
  sh: "bash",
  zsh: "bash",
  yml: "yaml",
  md: "markdown",
  html: "xml",
  htm: "xml",
}

const KNOWN_LANGUAGES = new Set<string>(CODE_LANGUAGES.map((l) => l.value))

function normalizeLanguage(raw: string): string {
  if (!raw) return "plaintext"
  const lower = raw.toLowerCase()
  const alias = LANGUAGE_ALIASES[lower] ?? lower
  return KNOWN_LANGUAGES.has(alias) ? alias : "plaintext"
}

const md = new MarkdownIt({
  // Strip raw HTML embedded in the markdown source. Anything the editor's
  // schema wouldn't accept gets dropped by the DOMParser anyway, but stripping
  // upstream keeps the surface narrow and prevents accidental script tags
  // from sneaking past extension whitelists.
  html: false,
  // Auto-link bare URLs (e.g. "see https://example.com") to match GitHub's
  // paste behavior.
  linkify: true,
  // Single newlines stay as paragraph continuations, not <br>.
  breaks: false,
  // Don't rewrite quotes/dashes — the user's punctuation is theirs.
  typographer: false,
})

// Canonicalize the language tag on fenced code blocks so the rendered
// <pre><code class="language-…"> always matches one of our known languages,
// and so unknown/aliased tags (e.g. ```js) snap to the canonical id the
// CodeBlock dropdown and incremental highlighter expect. Also drop the
// trailing newline markdown-it appends to the content; the CodeBlock node
// preserves whitespace verbatim and would otherwise render a stray empty
// final line.
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const language = normalizeLanguage((token.info ?? "").trim())
  const content = md.utils.escapeHtml(token.content).replace(/\n$/, "")
  return `<pre><code class="language-${language}">${content}</code></pre>\n`
}

// Strong-signal markdown patterns. If a pasted blob matches at least one of
// these, we hand it to the markdown parser instead of letting Tiptap drop it
// in as flat plain text. The list is intentionally permissive — we'd rather
// occasionally over-convert (e.g. a "## TODO" line in a code comment) than
// silently lose the user's markdown structure. Pastes inside an existing
// code block short-circuit upstream and never reach this check.
const MARKDOWN_PROBES: ReadonlyArray<RegExp> = [
  /^#{1,6}[ \t]+\S/m, // ATX heading
  /^[-*_]{3,}\s*$/m, // Thematic break
  /^>[ \t]+\S/m, // Blockquote
  /^[ \t]*[-*+][ \t]+\S/m, // Bullet list
  /^[ \t]*\d+\.[ \t]+\S/m, // Ordered list
  /^```/m, // Fenced code (backticks)
  /^~~~/m, // Fenced code (tildes)
  /\[[^\]\n]+\]\([^)\n]+\)/, // Inline link
  /!\[[^\]\n]*\]\([^)\n]+\)/, // Image
  /\*\*[^*\n]+\*\*/, // Bold (asterisks)
  /__[^_\n]+__/, // Bold (underscores)
  /~~[^~\n]+~~/, // Strikethrough
  /^\|.+\|\s*$/m, // Table row
]

export function looksLikeMarkdown(text: string): boolean {
  if (!text) return false
  return MARKDOWN_PROBES.some((re) => re.test(text))
}

export function markdownToSlice(markdown: string, schema: Schema): Slice {
  const html = md.render(markdown)
  const container = document.createElement("div")
  container.innerHTML = html
  const parser = PMDOMParser.fromSchema(schema)
  return parser.parseSlice(container, { preserveWhitespace: false })
}

export function extractMarkdownFromClipboard(
  clipboardData: DataTransfer | null | undefined,
): string | null {
  if (!clipboardData) return null
  const text = clipboardData.getData("text/plain") ?? ""
  if (!looksLikeMarkdown(text)) return null
  return text
}
