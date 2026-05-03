import { useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  EllipsisIcon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useUpdateWikiDocument, useWikiDocumentPresence } from "@/graphql/hooks/wiki"
import { getCursorColor } from "@/lib/cursor-colors"
import { useWikiStore } from "@/stores/wiki"
import { EmojiPicker } from "@/components/wiki/emoji-picker"
import { getDirectChildren } from "@/components/wiki/wiki-tree-helpers"
import type { WikiDocumentFieldsFragment, WikiDocumentTreeFieldsFragment } from "@/graphql/gql/graphql"

interface WikiEditorHeaderProps {
  document: WikiDocumentFieldsFragment
  isEditor: boolean
  treeDocuments: WikiDocumentTreeFieldsFragment[]
}

interface AncestorNode {
  id: string
  title: string
  emoji: string
}

export function WikiEditorHeader({
  document: doc,
  isEditor,
  treeDocuments,
}: WikiEditorHeaderProps) {
  const navigate = useNavigate()
  const updateDocument = useUpdateWikiDocument()
  const openBackupPanel = useWikiStore((s) => s.openBackupPanel)

  const { data: presenceData } = useWikiDocumentPresence(doc.id)
  const activeEditors = presenceData?.wikiDocumentPresence.activeEditors ?? []

  // Inline title editing.
  const [title, setTitle] = useState(doc.title)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  // Build ancestor path from treeDocuments.
  const ancestors = useMemo(() => {
    const map = new Map<string, { title: string; emoji: string; parentId: string | null }>()
    for (const d of treeDocuments) {
      map.set(d.id, {
        title: d.title,
        emoji: d.emoji,
        parentId: d.parentDocument?.id ?? null,
      })
    }
    const path: AncestorNode[] = []
    let currentId: string | null = doc.parentDocument?.id ?? null
    while (currentId) {
      const node = map.get(currentId)
      if (!node) break
      path.unshift({ id: currentId, title: node.title, emoji: node.emoji })
      currentId = node.parentId
    }
    return path
  }, [treeDocuments, doc.parentDocument?.id])

  // Drives the ▾ N-children dropdown next to the title — quick navigation
  // without scrolling to the footer block.
  const directChildren = useMemo(
    () => getDirectChildren(treeDocuments, doc.id),
    [treeDocuments, doc.id],
  )

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

  // Split ancestors: first, middle (collapsible), last is the current doc.
  const firstAncestor = ancestors.length > 0 ? ancestors[0] : null
  const middleAncestors = ancestors.length > 2 ? ancestors.slice(1) : []
  const directParent = ancestors.length === 2 ? ancestors[1] : null

  return (
    <div className="flex h-10 items-center gap-1 border-b px-3">
      {/* Emoji */}
      <EmojiPicker
        emoji={doc.emoji}
        onSelect={handleEmojiSelect}
        disabled={!isEditor}
      />

      {/* Breadcrumb: first ancestor */}
      {firstAncestor && (
        <>
          <BreadcrumbSep />
          <BreadcrumbLink node={firstAncestor} onClick={() => navigate(`/wiki/${firstAncestor.id}`)} />
        </>
      )}

      {/* Breadcrumb: direct parent (when exactly 2 ancestors) */}
      {directParent && (
        <>
          <BreadcrumbSep />
          <BreadcrumbLink node={directParent} onClick={() => navigate(`/wiki/${directParent.id}`)} />
        </>
      )}

      {/* Breadcrumb: ellipsis popover (when 3+ ancestors) */}
      {middleAncestors.length > 0 && (
        <>
          <BreadcrumbSep />
          <Popover>
            <PopoverTrigger
              render={
                <Button variant="ghost" size="icon-xs" className="text-muted-foreground" />
              }
            >
              <EllipsisIcon className="size-3.5" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto min-w-40 max-w-64 p-1">
              {middleAncestors.map((node) => (
                <button
                  key={node.id}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                  onClick={() => navigate(`/wiki/${node.id}`)}
                >
                  <span className="shrink-0">{node.emoji || "📄"}</span>
                  <span className="truncate">{node.title}</span>
                </button>
              ))}
            </PopoverContent>
          </Popover>
        </>
      )}

      {/* Breadcrumb separator before title (when has ancestors) */}
      {ancestors.length > 0 && <BreadcrumbSep />}

      {/* Title (editable) */}
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
          className="min-w-0 flex-1 border-none bg-transparent text-sm font-medium outline-none"
        />
      ) : (
        <button
          className="min-w-0 flex-1 truncate text-left text-sm font-medium"
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

      {/* Children dropdown — shown only when this doc has direct children. */}
      {directChildren.length > 0 && (
        <Popover>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="xs"
                className="shrink-0 text-muted-foreground"
              />
            }
          >
            <ChevronDownIcon className="size-3.5" />
            {directChildren.length}{" "}
            {directChildren.length === 1 ? "child" : "children"}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto min-w-56 max-w-72 p-1">
            {directChildren.map((child) => (
              <button
                key={child.id}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                onClick={() => navigate(`/wiki/${child.id}`)}
              >
                <span className="shrink-0">{child.emoji || "\u{1F4C4}"}</span>
                <span className="min-w-0 flex-1 truncate">{child.title}</span>
                {child.childCount > 0 && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {child.childCount}
                  </span>
                )}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      )}

      {/* Spacer + right side actions */}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/* Presence avatars */}
        {activeEditors.length > 0 && (
          <div className="flex -space-x-2">
            {activeEditors.slice(0, 3).map((editor) => (
              <Tooltip key={editor.userId}>
                <TooltipTrigger
                  render={
                    <Avatar
                      className="size-6 border-2"
                      style={{ borderColor: getCursorColor(editor.userId) }}
                    />
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

function BreadcrumbSep() {
  return <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
}

function BreadcrumbLink({ node, onClick }: { node: AncestorNode; onClick: () => void }) {
  return (
    <button
      className="shrink-0 truncate text-sm text-muted-foreground hover:text-foreground"
      onClick={onClick}
    >
      {node.title}
    </button>
  )
}
