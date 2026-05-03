import { useEffect, useRef, useState } from "react"
import type { Editor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import { getMarkRange } from "@tiptap/core"
import { CheckIcon, CopyIcon, ExternalLinkIcon, Trash2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface WikiLinkPopoverProps {
  editor: Editor | null
}

const LINK_POPOVER_FOCUS_EVENT = "wiki-link-popover-focus"

const popoverInputClass = cn(
  "h-7 w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm",
  "outline-none transition-colors placeholder:text-muted-foreground",
  "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
)

/**
 * Floating link editor. Auto-shows whenever the caret is inside a link mark.
 * Driven by the same BubbleMenu plugin Tiptap uses for the text formatting
 * toolbar — when an input inside this menu has focus, the menu's blur
 * handler keeps it visible (see @tiptap/extension-bubble-menu blurHandler).
 */
export function WikiLinkPopover({ editor }: WikiLinkPopoverProps) {
  const [text, setText] = useState("")
  const [url, setUrl] = useState("")
  const urlInputRef = useRef<HTMLInputElement>(null)
  // Identity of the link we last synced from. While the user types in the
  // form, the editor's link mark hasn't changed, so this key matches and we
  // skip resync — preserving in-progress edits across unrelated transactions.
  const linkKeyRef = useRef("")
  const justOpenedRef = useRef(false)

  useEffect(() => {
    if (!editor) return
    const sync = () => {
      if (!editor.isActive("link")) {
        linkKeyRef.current = ""
        return
      }
      const range = getCurrentLinkRange(editor)
      if (!range) return
      const href = (editor.getAttributes("link").href as string | null) ?? ""
      const key = `${range.from}|${range.to}|${href}`
      if (key === linkKeyRef.current) return
      const wasEmpty = linkKeyRef.current === ""
      linkKeyRef.current = key
      setText(editor.state.doc.textBetween(range.from, range.to))
      setUrl(href)
      // Auto-focus the URL field when the popover opens for a link with
      // no URL yet (just-inserted via /link, ⌘K, or bubble menu button).
      // Don't steal focus when opening over an existing real link.
      if (wasEmpty && !href) {
        justOpenedRef.current = true
      }
    }
    editor.on("selectionUpdate", sync)
    editor.on("transaction", sync)
    sync()
    return () => {
      editor.off("selectionUpdate", sync)
      editor.off("transaction", sync)
    }
  }, [editor])

  // The BubbleMenu plugin debounces show() (default 250ms) and removes its
  // host element from the live DOM while hidden. We can't focus the input
  // until the element is reattached, so poll across animation frames until
  // it's in the document — bounded to avoid spinning forever on edge cases.
  useEffect(() => {
    if (!justOpenedRef.current) return
    let cancelled = false
    let attempts = 0
    const tryFocus = () => {
      if (cancelled) return
      const input = urlInputRef.current
      if (input && document.contains(input)) {
        input.focus()
        input.select()
        justOpenedRef.current = false
        return
      }
      if (attempts++ < 30) {
        requestAnimationFrame(tryFocus)
      } else {
        justOpenedRef.current = false
      }
    }
    requestAnimationFrame(tryFocus)
    return () => {
      cancelled = true
    }
  })

  // External trigger (⌘K / bubble-menu / slash) when already on a link asks
  // us to grab focus into the URL field for quick edit.
  useEffect(() => {
    function onFocusRequest() {
      urlInputRef.current?.focus()
      urlInputRef.current?.select()
    }
    window.addEventListener(LINK_POPOVER_FOCUS_EVENT, onFocusRequest)
    return () => window.removeEventListener(LINK_POPOVER_FOCUS_EVENT, onFocusRequest)
  }, [])

  if (!editor) return null

  function applyChanges() {
    if (!editor) return
    const range = getCurrentLinkRange(editor)
    if (!range) return
    const href = normalizeUrl(url)
    if (!href) {
      // Empty URL — treat as remove
      editor
        .chain()
        .focus()
        .setTextSelection(range)
        .unsetLink()
        .run()
      return
    }
    const display = text.trim() || href
    editor
      .chain()
      .focus()
      .setTextSelection(range)
      .insertContent({
        type: "text",
        text: display,
        marks: [{ type: "link", attrs: { href } }],
      })
      .run()
  }

  function removeLink() {
    if (!editor) return
    editor.chain().focus().extendMarkRange("link").unsetLink().run()
  }

  function openLink() {
    const href = normalizeUrl(url)
    if (!href) return
    window.open(href, "_blank", "noopener,noreferrer")
  }

  async function copyLink() {
    const href = normalizeUrl(url)
    if (!href) return
    try {
      await navigator.clipboard.writeText(href)
    } catch {
      // Clipboard write can fail in non-secure contexts or when the user
      // denied the permission. The popover's "Copy" affordance is best-effort
      // — silently fall back rather than surfacing an error toast.
    }
  }

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="wikiLinkPopover"
      updateDelay={0}
      options={{ placement: "bottom-start", offset: 6 }}
      shouldShow={({ editor }) => editor.isEditable && editor.isActive("link")}
      className="z-50 flex w-[22rem] flex-col gap-2 rounded-lg bg-popover p-2 text-popover-foreground shadow-md ring-1 ring-foreground/10"
    >
      <div className="flex items-center gap-1.5">
        <label className="w-9 shrink-0 text-xs text-muted-foreground">Text</label>
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => onFormKeyDown(e, applyChanges, editor)}
          placeholder="Link"
          className={popoverInputClass}
        />
      </div>
      <div className="flex items-center gap-1.5">
        <label className="w-9 shrink-0 text-xs text-muted-foreground">URL</label>
        <input
          ref={urlInputRef}
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => onFormKeyDown(e, applyChanges, editor)}
          placeholder="https://example.com"
          className={popoverInputClass}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      <div className="flex items-center justify-end gap-0.5">
        <PopoverIconButton
          icon={ExternalLinkIcon}
          tooltip="Open in new tab"
          disabled={!url.trim()}
          onClick={openLink}
        />
        <PopoverIconButton
          icon={CopyIcon}
          tooltip="Copy URL"
          disabled={!url.trim()}
          onClick={copyLink}
        />
        <PopoverIconButton
          icon={Trash2Icon}
          tooltip="Remove link"
          destructive
          onClick={removeLink}
        />
        <div className="mx-0.5 h-4 w-px bg-foreground/10" aria-hidden />
        <PopoverIconButton
          icon={CheckIcon}
          tooltip="Apply"
          onClick={applyChanges}
        />
      </div>
    </BubbleMenu>
  )
}

function onFormKeyDown(
  e: React.KeyboardEvent<HTMLInputElement>,
  apply: () => void,
  editor: Editor,
) {
  if (e.key === "Enter") {
    e.preventDefault()
    apply()
  } else if (e.key === "Escape") {
    e.preventDefault()
    editor.chain().focus().run()
  }
}

function PopoverIconButton({
  icon: Icon,
  tooltip,
  destructive,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  tooltip: string
  destructive?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={disabled}
            className={destructive ? "text-destructive hover:text-destructive" : undefined}
            onMouseDown={(e) => {
              e.preventDefault()
              onClick()
            }}
          />
        }
      >
        <Icon className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  )
}

function getCurrentLinkRange(editor: Editor): { from: number; to: number } | null {
  const linkType = editor.schema.marks.link
  if (!linkType) return null
  const $from = editor.state.doc.resolve(editor.state.selection.from)
  const range = getMarkRange($from, linkType)
  return range ?? null
}

/** Add an https:// scheme when the user typed a bare hostname so the rendered
 *  href actually navigates instead of resolving as a same-origin path. */
function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ""
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  if (trimmed.startsWith("//")) return `https:${trimmed}`
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return `mailto:${trimmed}`
  return `https://${trimmed}`
}

/** Imperative trigger used by the bubble-menu button, ⌘K shortcut, and the
 *  /link slash item. Wraps the current selection in a link mark (or inserts a
 *  "Link" placeholder if the selection is empty), which makes the editor
 *  report `isActive('link')` true and the popover auto-shows above.
 *
 *  Co-located with the component because both share the LINK_POPOVER_FOCUS_EVENT
 *  module constant; splitting would require a third file just to host that. */
// eslint-disable-next-line react-refresh/only-export-components
export function startLinkInsert(editor: Editor) {
  // Already on a link — popover is already showing; just nudge focus to it.
  if (editor.isActive("link")) {
    window.dispatchEvent(new CustomEvent(LINK_POPOVER_FOCUS_EVENT))
    return
  }
  const { selection } = editor.state
  if (selection.empty) {
    // Insert a placeholder "Link" wrapped in a link mark, then select it so
    // isActive('link') becomes true and the popover opens with text=Link.
    const placeholder = "Link"
    const from = selection.from
    editor
      .chain()
      .insertContent({
        type: "text",
        text: placeholder,
        marks: [{ type: "link", attrs: { href: "" } }],
      })
      .setTextSelection({ from, to: from + placeholder.length })
      .focus()
      .run()
    return
  }
  // Wrap existing selection in an empty-href link mark; popover takes over.
  editor.chain().focus().setLink({ href: "" }).run()
}
