import type { Editor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import { NodeSelection } from "@tiptap/pm/state"
import {
  BanIcon,
  BoldIcon,
  CodeIcon,
  HighlighterIcon,
  ItalicIcon,
  LinkIcon,
  StrikethroughIcon,
} from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { startLinkInsert } from "@/components/wiki/wiki-link-popover"
import { WIKI_ICON_COLORS } from "@/components/wiki/icon-color-palette"
import { cn } from "@/lib/utils"

interface WikiEditorBubbleMenuProps {
  editor: Editor | null
}

// Skip the "Default" sentinel (value === "") from the icon palette —
// highlight has no "inherit" concept; the swatch row exposes a dedicated
// Remove action instead. Lifted to module scope so the filter doesn't
// re-run on every HighlightButton render.
const HIGHLIGHT_SWATCHES = WIKI_ICON_COLORS.filter((c) => c.value !== "")

export function WikiEditorBubbleMenu({ editor }: WikiEditorBubbleMenuProps) {
  if (!editor) return null

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor, from, to, state }) => {
        if (!editor.isEditable) return false
        if (from === to) return false
        if (editor.isActive("codeBlock")) return false
        // Node selections (image, etc.) report from !== to but none of the
        // mark toggles in this menu apply to them — hide to avoid offering
        // actions that would silently no-op.
        if (state.selection instanceof NodeSelection) return false
        return true
      }}
      className="flex items-center gap-0.5 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
    >
      <BubbleButton
        icon={BoldIcon}
        tooltip="Bold"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <BubbleButton
        icon={ItalicIcon}
        tooltip="Italic"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <BubbleButton
        icon={StrikethroughIcon}
        tooltip="Strikethrough"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <BubbleButton
        icon={CodeIcon}
        tooltip="Inline code"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />
      <HighlightButton editor={editor} />
      <BubbleButton
        icon={LinkIcon}
        tooltip="Add link (⌘K)"
        active={editor.isActive("link")}
        onClick={() => startLinkInsert(editor)}
      />
    </BubbleMenu>
  )
}

function BubbleButton({
  icon: Icon,
  tooltip,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  tooltip: string
  active?: boolean
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={active ? "secondary" : "ghost"}
            size="icon-xs"
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

function HighlightButton({ editor }: { editor: Editor }) {
  // Track open state locally so we can close the popover after a swatch
  // pick without rebinding the editor's selection — the popover would
  // otherwise stay open and obscure the result the user just applied.
  const [open, setOpen] = useState(false)
  const active = editor.isActive("wikiHighlight")
  // getAttributes returns {} when the mark isn't active, so the optional
  // chain plus empty-string fallback covers both the inactive case and
  // legacy marks stored without a color attribute.
  const currentColor =
    (editor.getAttributes("wikiHighlight").color as string | undefined) ?? ""

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant={active ? "secondary" : "ghost"}
                  size="icon-xs"
                  // Preserve the editor selection across the popover open —
                  // contentEditable would otherwise collapse it on focus
                  // shift. preventDefault on mousedown still allows the
                  // click that PopoverTrigger uses to toggle open state.
                  onMouseDown={(e) => e.preventDefault()}
                />
              }
            />
          }
        >
          <HighlighterIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipContent>Highlight</TooltipContent>
      </Tooltip>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={6}
        // Reach back to the bubble menu's own ring/shadow weight here —
        // the default PopoverContent class ships with shadow-md + extra
        // padding that, when stacked over the bubble menu's own shadow,
        // reads as a heavy floating chip rather than a peer of the
        // formatting row. tailwind-merge lets these classes override the
        // base widths/padding/shadow without re-spelling the whole list.
        className="flex w-auto min-w-0 flex-row items-center gap-1 rounded-lg bg-popover p-1 text-popover-foreground shadow-sm ring-1 ring-foreground/10">
        {HIGHLIGHT_SWATCHES.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-label={c.label}
            title={c.label}
            onMouseDown={(e) => {
              e.preventDefault()
              editor.chain().focus().setWikiHighlight(c.value).run()
              setOpen(false)
            }}
            className={cn(
              "size-5 rounded-full ring-1 ring-border transition-transform hover:scale-110",
              currentColor === c.value && "ring-2 ring-foreground",
            )}
            // Paint the swatch at full saturation so its identity reads
            // clearly against the dark popover surface. The on-text
            // highlight applies the same OKLCH literal at ~28% mix; the
            // swatch is a picker, not a faithful preview, and matching
            // the rendered tint here just made every color read as
            // muddy gray-on-gray.
            style={{ backgroundColor: c.value }}
          />
        ))}
        <button
          type="button"
          aria-label="Remove highlight"
          title="Remove highlight"
          disabled={!active}
          onMouseDown={(e) => {
            e.preventDefault()
            editor.chain().focus().unsetWikiHighlight().run()
            setOpen(false)
          }}
          className={cn(
            "flex size-5 items-center justify-center rounded-full ring-1 ring-border transition-transform hover:scale-110",
            "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100",
          )}
        >
          <BanIcon className="size-3 text-muted-foreground" aria-hidden />
        </button>
      </PopoverContent>
    </Popover>
  )
}
