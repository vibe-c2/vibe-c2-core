import {
  ArrowDownAZIcon,
  CopyIcon,
  ExternalLinkIcon,
  FilePlusIcon,
  FolderInputIcon,
  LayoutTemplateIcon,
  PencilIcon,
  SearchIcon,
  SmileIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { useWikiStore } from "@/stores/wiki"
import { openWikiSearch } from "@/components/wiki/wiki-command-palette"
import {
  useDuplicateWikiDocument,
  useReorderWikiDocumentSiblings,
  useSetWikiDocumentTemplate,
  useWikiDocumentChildren,
} from "@/graphql/hooks/wiki"
import type { TreeNode } from "@/components/wiki/wiki-tree-sidebar"

interface WikiTreeRowMenuItemsProps {
  // DropdownMenuItem and ContextMenuItem are structurally identical
  // (both extend MenuPrimitive.Item.Props with the same `inset`/`variant`
  // extras), so typing against one accepts the other.
  Item: typeof DropdownMenuItem
  Separator: typeof DropdownMenuSeparator
  node: TreeNode
  operationId: string
  isEditor: boolean
  onStartRename: () => void
  onStartIconPicker: () => void
}

// Menu items shared between the row's 3-dots dropdown and its right-click
// context menu. The caller passes the appropriate `Item`/`Separator`
// components so each menu uses its own Base UI primitive (different popup
// roots) while the item set, labels, and handlers stay in one place.
//
// Hooks here only run when one of the menus is actually open — Base UI's
// Popup is portal-mounted on open, so this component (and its store/mutation
// subscriptions) is cheap when the menu is closed.
export function WikiTreeRowMenuItems({
  Item,
  Separator,
  node,
  operationId,
  isEditor,
  onStartRename,
  onStartIconPicker,
}: WikiTreeRowMenuItemsProps) {
  const openCreateDialog = useWikiStore((s) => s.openCreateDialog)
  const openMoveDialog = useWikiStore((s) => s.openMoveDialog)
  const openDeleteDialog = useWikiStore((s) => s.openDeleteDialog)
  const openDuplicateDialog = useWikiStore((s) => s.openDuplicateDialog)
  const openExportDialog = useWikiStore((s) => s.openExportDialog)
  const reorderSiblings = useReorderWikiDocumentSiblings()
  const duplicateDocument = useDuplicateWikiDocument()
  const setTemplate = useSetWikiDocumentTemplate()

  const hasChildren = node.childCount > 0
  // Cached children for this node, if its branch was ever expanded. Used by
  // the "Sort" action; we don't trigger a fetch from here, so unloaded
  // branches show no Sort row (acceptable — the user only sorts what they
  // can see).
  const { data: cachedChildren } = useWikiDocumentChildren(
    operationId,
    node.id,
    { enabled: false },
  )
  const loadedChildren = cachedChildren?.wikiDocumentChildren ?? []

  return (
    <>
      {isEditor && (
        <Item onClick={() => openCreateDialog(node.id)}>
          <FilePlusIcon className="mr-2 size-4" />
          New child document
        </Item>
      )}
      {isEditor && (
        <Item onClick={onStartRename}>
          <PencilIcon className="mr-2 size-4" />
          Rename
        </Item>
      )}
      {/* Template documents render a fixed glyph, so the icon is locked. */}
      {isEditor && !node.isTemplate && (
        <Item onClick={onStartIconPicker}>
          <SmileIcon className="mr-2 size-4" />
          Change icon
        </Item>
      )}
      {isEditor && (
        <Item
          onClick={() => {
            // Documents with children prompt for shallow vs deep copy via
            // the dialog. Leaves bypass it — there's nothing to ask, so we
            // fire the mutation directly.
            if (hasChildren) {
              openDuplicateDialog({
                id: node.id,
                title: node.title,
                childCount: node.childCount,
              })
            } else {
              duplicateDocument.mutate({ id: node.id, withChildren: false })
            }
          }}
          disabled={duplicateDocument.isPending}
        >
          <CopyIcon className="mr-2 size-4" />
          Duplicate
        </Item>
      )}
      {isEditor && (
        <Item onClick={() => openMoveDialog({ id: node.id, title: node.title })}>
          <FolderInputIcon className="mr-2 size-4" />
          Move to
        </Item>
      )}
      {isEditor && (
        <Item
          onClick={() =>
            setTemplate.mutate({ id: node.id, isTemplate: !node.isTemplate })
          }
          disabled={setTemplate.isPending}
        >
          <LayoutTemplateIcon className="mr-2 size-4" />
          {node.isTemplate ? "Remove as template" : "Mark as template"}
        </Item>
      )}
      {isEditor && hasChildren && loadedChildren.length > 0 && (
        <Item
          onClick={() => {
            // Sort children alphabetically by title. One bulk mutation
            // replaces the N-update loop this used to fire, so the
            // sidebar refetches the affected parent bucket exactly once.
            const sorted = [...loadedChildren].sort((a, b) =>
              a.title.localeCompare(b.title, undefined, { sensitivity: "base" }),
            )
            reorderSiblings.mutate({
              input: {
                operationId,
                parentDocumentId: node.id,
                orderedIds: sorted.map((d) => d.id),
              },
            })
          }}
        >
          <ArrowDownAZIcon className="mr-2 size-4" />
          Sort
        </Item>
      )}
      <Separator />
      <Item
        onClick={() =>
          window.open(`/wiki/${node.id}`, "_blank", "noopener,noreferrer")
        }
      >
        <ExternalLinkIcon className="mr-2 size-4" />
        Open in new tab
      </Item>
      <Item
        onClick={() =>
          openWikiSearch({
            operationId,
            parentDocumentId: node.id,
            parentTitle: node.title,
          })
        }
      >
        <SearchIcon className="mr-2 size-4" />
        Search in {node.title}...
      </Item>
      <Item
        onClick={() =>
          openExportDialog({
            id: node.id,
            title: node.title,
            childCount: node.childCount,
          })
        }
      >
        <UploadIcon className="mr-2 size-4" />
        Export…
      </Item>
      {isEditor && (
        <>
          <Separator />
          <Item
            variant="destructive"
            onClick={() => openDeleteDialog({ id: node.id, title: node.title })}
          >
            <Trash2Icon className="mr-2 size-4" />
            Delete
          </Item>
        </>
      )}
    </>
  )
}
