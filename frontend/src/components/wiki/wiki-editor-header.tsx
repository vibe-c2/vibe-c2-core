import { useRef, useState } from "react"
import { ClockIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useUpdateWikiDocument, useWikiDocumentPresence } from "@/graphql/hooks/wiki"
import { useWikiStore } from "@/stores/wiki"
import { EmojiPicker } from "@/components/wiki/emoji-picker"
import type { WikiDocumentFieldsFragment } from "@/graphql/gql/graphql"

interface WikiEditorHeaderProps {
  document: WikiDocumentFieldsFragment
  isEditor: boolean
}

export function WikiEditorHeader({
  document: doc,
  isEditor,
}: WikiEditorHeaderProps) {
  const updateDocument = useUpdateWikiDocument()
  const openBackupPanel = useWikiStore((s) => s.openBackupPanel)

  const { data: presenceData } = useWikiDocumentPresence(doc.id)
  const activeEditors = presenceData?.wikiDocumentPresence.activeEditors ?? []

  // Inline title editing.
  const [title, setTitle] = useState(doc.title)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  function handleTitleBlur() {
    const trimmed = title.trim()
    if (trimmed && trimmed !== doc.title && trimmed.length <= 200) {
      updateDocument.mutate({ id: doc.id, input: { title: trimmed } })
    } else {
      setTitle(doc.title)
    }
    setIsEditingTitle(false)
  }

  function handleEmojiSelect(emoji: string) {
    updateDocument.mutate({ id: doc.id, input: { emoji } })
  }

  return (
    <div className="flex items-center gap-2 border-b px-4 py-2">
      {/* Emoji */}
      <EmojiPicker
        emoji={doc.emoji}
        onSelect={handleEmojiSelect}
        disabled={!isEditor}
      />

      {/* Title */}
      {isEditingTitle ? (
        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleTitleBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
            if (e.key === "Escape") {
              setTitle(doc.title)
              setIsEditingTitle(false)
            }
          }}
          autoFocus
          onFocus={(e) => e.target.select()}
          maxLength={200}
          className="flex-1 border-none bg-transparent text-lg font-semibold outline-none"
        />
      ) : (
        <button
          className="flex-1 truncate text-left text-lg font-semibold"
          onClick={() => {
            if (!isEditor) return
            setTitle(doc.title)
            setIsEditingTitle(true)
          }}
          disabled={!isEditor}
        >
          {doc.title}
        </button>
      )}

      {/* Spacer + right side actions */}
      <div className="ml-auto flex items-center gap-2">
        {/* Presence avatars */}
        {activeEditors.length > 0 && (
          <div className="flex -space-x-2">
            {activeEditors.slice(0, 3).map((editor) => (
              <Tooltip key={editor.userId}>
                <TooltipTrigger
                  render={
                    <Avatar className="size-6 border-2 border-background" />
                  }
                >
                  <AvatarFallback className="text-[10px]">
                    {editor.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </TooltipTrigger>
                <TooltipContent>{editor.username}</TooltipContent>
              </Tooltip>
            ))}
            {activeEditors.length > 3 && (
              <div className="flex size-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px]">
                +{activeEditors.length - 3}
              </div>
            )}
          </div>
        )}

        {/* Backup button */}
        {isEditor && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => openBackupPanel(doc.id)}
                />
              }
            >
              <ClockIcon className="size-4" />
            </TooltipTrigger>
            <TooltipContent>Backup History</TooltipContent>
          </Tooltip>
        )}

        {/* Read-only badge */}
        {!isEditor && <Badge variant="secondary">Read-only</Badge>}
      </div>
    </div>
  )
}
