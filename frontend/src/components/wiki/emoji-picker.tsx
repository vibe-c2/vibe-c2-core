import { useState } from "react"
import { useTheme } from "next-themes"
import data from "@emoji-mart/data"
import Picker from "@emoji-mart/react"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"

interface EmojiPickerProps {
  emoji: string
  onSelect: (emoji: string) => void
  disabled?: boolean
  /** Controlled open state (used by tree node context menu). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function EmojiPicker({
  emoji,
  onSelect,
  disabled,
  open: controlledOpen,
  onOpenChange,
}: EmojiPickerProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const { resolvedTheme } = useTheme()

  const isOpen = controlledOpen ?? internalOpen
  const setOpen = onOpenChange ?? setInternalOpen

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            className="shrink-0 text-base"
          />
        }
      >
        {emoji || "\u{1F4C4}"}
      </PopoverTrigger>
      <PopoverContent className="w-auto border-none p-0 shadow-lg" align="start">
        <Picker
          data={data}
          onEmojiSelect={(e: { native: string }) => {
            onSelect(e.native)
            setOpen(false)
          }}
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          previewPosition="none"
          skinTonePosition="none"
        />
      </PopoverContent>
    </Popover>
  )
}
