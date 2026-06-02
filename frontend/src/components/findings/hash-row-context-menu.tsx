import type { ReactElement, ReactNode } from "react"
import { toast } from "sonner"
import {
  CircleDotIcon,
  CopyIcon,
  KeyIcon,
  LinkIcon,
  PencilIcon,
  TrashIcon,
} from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useHashStore } from "@/stores/hashes"
import { useUpdateHash } from "@/graphql/hooks/hashes"
import { buildHashShareUrl } from "@/components/findings/hash-share-link"
import {
  HASH_STATUSES,
  hashStatusLabel,
  truncateHashValue,
} from "@/components/findings/hash-status-utils"
import type { HashFieldsFragment, HashStatus } from "@/graphql/gql/graphql"

interface HashRowContextMenuProps {
  hash: HashFieldsFragment
  children: ReactNode
  triggerRender?: ReactElement
}

// CRACKED has its own dedicated flow (markHashCracked) because it requires a
// linked credential — the quick-status submenu therefore lists every status
// except CRACKED. Mirrors the details card's editable-status allowlist.
const QUICK_STATUSES = HASH_STATUSES.filter((s) => s !== "CRACKED")

// Right-click context menu wrapper for a single hashes row.
export function HashRowContextMenu({
  hash,
  children,
  triggerRender,
}: HashRowContextMenuProps) {
  const openDetails = useHashStore((s) => s.openDetailsPanel)
  const openDelete = useHashStore((s) => s.openDeleteDialog)
  const openMarkCracked = useHashStore((s) => s.openMarkCrackedDialog)
  const updateHash = useUpdateHash()

  const selected = { id: hash.id, label: truncateHashValue(hash.value) }

  async function copy(text: string, label: string) {
    if (!text) {
      toast.info(`No ${label} to copy`)
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`Copied ${label}`)
    } catch {
      toast.error(`Failed to copy ${label}`)
    }
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(buildHashShareUrl(hash.id))
      toast.success("Link copied")
    } catch {
      toast.error("Failed to copy link")
    }
  }

  async function setStatus(next: HashStatus) {
    if (next === hash.status) return
    try {
      await updateHash.mutateAsync({
        id: hash.id,
        input: { status: next },
      })
      toast.success(`Status set to ${hashStatusLabel(next)}`)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update status",
      )
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={triggerRender}>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => copy(hash.value, "hash value")}>
          <CopyIcon className="size-4" />
          Copy hash value
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <CircleDotIcon className="size-4" />
            Set status
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {QUICK_STATUSES.map((s) => (
              <ContextMenuItem
                key={s}
                disabled={s === hash.status || updateHash.isPending}
                onClick={() => setStatus(s)}
              >
                {hashStatusLabel(s)}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        {hash.status !== "CRACKED" && (
          <ContextMenuItem onClick={() => openMarkCracked(selected)}>
            <KeyIcon className="size-4" />
            Mark as cracked
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        <ContextMenuItem onClick={copyShareLink}>
          <LinkIcon className="size-4" />
          Copy link
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem onClick={() => openDetails(selected)}>
          <PencilIcon className="size-4" />
          View / edit
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          onClick={() => openDelete(selected)}
        >
          <TrashIcon className="size-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
