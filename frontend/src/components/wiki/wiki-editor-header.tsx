import { useMemo, useRef, useState } from "react"
import { Link } from "react-router"
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  EllipsisIcon,
  Maximize2Icon,
  Minimize2Icon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  useUpdateWikiDocument,
  useWikiDocumentBacklinks,
  useWikiDocumentChildren,
  useWikiDocumentPresence,
} from "@/graphql/hooks/wiki"
import { getCursorColor } from "@/lib/cursor-colors"
import { useWikiStore } from "@/stores/wiki"
import {
  DocumentIconPicker,
  type DocumentIconValue,
} from "@/components/wiki/document-icon-picker"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { sortByOrder } from "@/components/wiki/wiki-tree-helpers"
import type { WikiDocumentFieldsFragment } from "@/graphql/gql/graphql"

interface WikiEditorHeaderProps {
  document: WikiDocumentFieldsFragment
  operationId: string
  isEditor: boolean
}

interface AncestorNode {
  id: string
  title: string
  emoji: string
  icon: string
  color: string
}

export function WikiEditorHeader({
  document: doc,
  operationId,
  isEditor,
}: WikiEditorHeaderProps) {
  const updateDocument = useUpdateWikiDocument()
  const openBackupPanel = useWikiStore((s) => s.openBackupPanel)
  const editorZoomed = useWikiStore((s) => s.editorZoomed)
  const toggleEditorZoom = useWikiStore((s) => s.toggleEditorZoom)
  const zoomLabel = editorZoomed ? "Exit fullscreen" : "Zoom in"

  const { data: presenceData } = useWikiDocumentPresence(doc.id)
  const activeEditors = presenceData?.wikiDocumentPresence.activeEditors ?? []

  // Inline title editing.
  const [title, setTitle] = useState(doc.title)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  // Breadcrumb path: comes baked into the document payload via the server's
  // ancestors resolver. No need to consult a flat tree client-side — that
  // would force the whole operation tree to be loaded just for this breadcrumb.
  // Trashed ancestors are filtered out (they render as missing in the chain
  // and break navigation if rendered as breadcrumb links).
  const ancestors = useMemo<AncestorNode[]>(
    () =>
      (doc.ancestors ?? [])
        .filter((a) => !a.isDeleted)
        .map((a) => ({
          id: a.id,
          title: a.title,
          emoji: a.emoji,
          icon: a.icon,
          color: a.color,
        })),
    [doc.ancestors],
  )

  // Drives the ▾ N-children dropdown next to the title — quick navigation
  // without scrolling to the footer block. Shares the per-parent cache key
  // with the sidebar's lazy expand for this doc, so the call is a cache hit
  // whenever the user already expanded this branch in the tree.
  const { data: childrenData } = useWikiDocumentChildren(operationId, doc.id)
  const directChildren = useMemo(
    () => sortByOrder(childrenData?.wikiDocumentChildren ?? []),
    [childrenData?.wikiDocumentChildren],
  )

  // Same idea for backlinks. Reuses the cached query already populated by
  // the footer's WikiBacklinkList — TanStack Query dedupes by key so this
  // never doubles the network roundtrip.
  const { data: backlinksData } = useWikiDocumentBacklinks(doc.id)
  const backlinks = backlinksData?.wikiDocumentBacklinks ?? []

  function handleTitleBlur() {
    const trimmed = title.trim()
    if (trimmed && trimmed !== doc.title && trimmed.length <= 200) {
      updateDocument.mutate({ id: doc.id, input: { title: trimmed } })
    } else {
      setTitle(doc.title)
    }
    setIsEditingTitle(false)
  }

  function handleIconSelect(next: DocumentIconValue) {
    updateDocument.mutate({
      id: doc.id,
      input: { emoji: next.emoji, icon: next.icon, color: next.color },
    })
  }

  // Split ancestors: first, middle (collapsible), last is the current doc.
  const firstAncestor = ancestors.length > 0 ? ancestors[0] : null
  const middleAncestors = ancestors.length > 2 ? ancestors.slice(1) : []
  const directParent = ancestors.length === 2 ? ancestors[1] : null

  return (
    <div className="flex h-10 items-center gap-1 border-b px-3">
      {/* Document icon — emoji or lucide. hasChildren keeps the adaptive
          default in sync with the tree row (page glyph for leaves, folder
          glyph once children exist). isExpanded stays true here: the user
          is viewing the doc, so its content is "open" by definition. */}
      <DocumentIconPicker
        value={{ emoji: doc.emoji, icon: doc.icon, color: doc.color }}
        onSelect={handleIconSelect}
        disabled={!isEditor}
        hasChildren={directChildren.length > 0}
        isExpanded
      />

      {/* Breadcrumb: first ancestor */}
      {firstAncestor && (
        <>
          <BreadcrumbSep />
          <BreadcrumbLink node={firstAncestor} />
        </>
      )}

      {/* Breadcrumb: direct parent (when exactly 2 ancestors) */}
      {directParent && (
        <>
          <BreadcrumbSep />
          <BreadcrumbLink node={directParent} />
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
                <Link
                  key={node.id}
                  to={`/wiki/${node.id}`}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                >
                  {/* Ancestors are parents of the current doc — they all have
                      children by definition, so adaptive resolves to folder. */}
                  <DocumentIcon
                    emoji={node.emoji}
                    icon={node.icon}
                    color={node.color}
                    hasChildren
                  />
                  <span className="truncate">{node.title}</span>
                </Link>
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
              <Link
                key={child.id}
                to={`/wiki/${child.id}`}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <DocumentIcon
                  emoji={child.emoji}
                  icon={child.icon}
                  color={child.color}
                  hasChildren={child.childCount > 0}
                />
                <span className="min-w-0 flex-1 truncate">{child.title || "Untitled"}</span>
                {child.childCount > 0 && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {child.childCount}
                  </span>
                )}
              </Link>
            ))}
          </PopoverContent>
        </Popover>
      )}

      {/* Backlinks dropdown — mirror of the children dropdown for incoming
          /doc references. Shown only when at least one other document cites
          this page inline, so unreferenced pages don't get a noisy "0" pill. */}
      {backlinks.length > 0 && (
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
            {backlinks.length}{" "}
            {backlinks.length === 1 ? "backlink" : "backlinks"}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto min-w-56 max-w-72 p-1">
            {backlinks.map((ref) => {
              const parent =
                ref.ancestors.length > 0
                  ? ref.ancestors[ref.ancestors.length - 1]
                  : null
              return (
                <Link
                  key={ref.id}
                  to={`/wiki/${ref.id}`}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                >
                  <DocumentIcon
                    emoji={ref.emoji}
                    icon={ref.icon}
                    color={ref.color}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {ref.title || "Untitled"}
                    {parent && (
                      <span className="ml-1.5 text-xs text-muted-foreground/70">
                        in {parent.title || "Untitled"}
                      </span>
                    )}
                  </span>
                </Link>
              )
            })}
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

        {/* Zoom toggle — not gated on isEditor (focus reading is useful
            without edit rights). */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggleEditorZoom}
                aria-label={zoomLabel}
                aria-pressed={editorZoomed}
              />
            }
          >
            {editorZoomed ? (
              <Minimize2Icon className="size-4" />
            ) : (
              <Maximize2Icon className="size-4" />
            )}
          </TooltipTrigger>
          <TooltipContent>{zoomLabel}</TooltipContent>
        </Tooltip>

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

function BreadcrumbLink({ node }: { node: AncestorNode }) {
  return (
    <Link
      to={`/wiki/${node.id}`}
      className="shrink-0 truncate text-sm text-muted-foreground hover:text-foreground"
    >
      {node.title}
    </Link>
  )
}
