import type { ReactElement, ReactNode } from "react"
import { toast } from "sonner"
import {
  CheckCircle2Icon,
  CopyIcon,
  KeyIcon,
  LinkIcon,
  PencilIcon,
  TrashIcon,
  XCircleIcon,
} from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { useCredentialStore } from "@/stores/credentials"
import { useUpdateCredential } from "@/graphql/hooks/credentials"
import { buildCredentialShareUrl } from "@/components/findings/credential-share-link"
import type { CredentialFieldsFragment } from "@/graphql/gql/graphql"

interface CredentialRowContextMenuProps {
  credential: CredentialFieldsFragment
  children: ReactNode
  // Optional override for the trigger's host element. Base UI's
  // ContextMenu.Trigger defaults to a <div>, which is fine for full-width row
  // buttons but breaks inline placement (e.g. the wiki credential chip sitting
  // between prose tokens). Pass `<span />` from inline call sites.
  triggerRender?: ReactElement
}

// Right-click context menu wrapper for a single credentials row. Holds all
// per-row actions: toggle validity, copy username/password/key contents,
// edit, delete. The trigger is rendered as the row passed via children.
export function CredentialRowContextMenu({
  credential,
  children,
  triggerRender,
}: CredentialRowContextMenuProps) {
  const openEdit = useCredentialStore((s) => s.openEditDialog)
  const openDelete = useCredentialStore((s) => s.openDeleteDialog)
  const updateCredential = useUpdateCredential()

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
      await navigator.clipboard.writeText(buildCredentialShareUrl(credential.id))
      toast.success("Link copied")
    } catch {
      toast.error("Failed to copy link")
    }
  }

  async function toggleValidity() {
    try {
      await updateCredential.mutateAsync({
        id: credential.id,
        input: { isValid: !credential.isValid },
      })
      toast.success(
        credential.isValid ? "Marked as invalid" : "Marked as valid",
      )
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update credential",
      )
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={triggerRender}>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={toggleValidity}>
          {credential.isValid ? (
            <>
              <XCircleIcon className="size-4" />
              Mark as invalid
            </>
          ) : (
            <>
              <CheckCircle2Icon className="size-4" />
              Mark as valid
            </>
          )}
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          disabled={!credential.username}
          onClick={() => copy(credential.username, "username")}
        >
          <CopyIcon className="size-4" />
          Copy username
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!credential.password}
          onClick={() => copy(credential.password, "password")}
        >
          <CopyIcon className="size-4" />
          Copy password
        </ContextMenuItem>

        {credential.keys.length > 0 && (
          <>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuLabel>Keys</ContextMenuLabel>
              {credential.keys.map((k, i) => {
                const label = k.name?.trim() || `Key ${i + 1}`
                return (
                  <ContextMenuItem
                    key={`${i}-${k.name}`}
                    disabled={!k.content}
                    onClick={() => copy(k.content, label)}
                  >
                    <KeyIcon className="size-4" />
                    <span className="truncate">Copy {label}</span>
                  </ContextMenuItem>
                )
              })}
            </ContextMenuGroup>
          </>
        )}

        <ContextMenuSeparator />

        <ContextMenuItem onClick={copyShareLink}>
          <LinkIcon className="size-4" />
          Copy link
        </ContextMenuItem>

        <ContextMenuSeparator />

        <ContextMenuItem
          onClick={() => openEdit({ id: credential.id, name: credential.name })}
        >
          <PencilIcon className="size-4" />
          Edit
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          onClick={() =>
            openDelete({ id: credential.id, name: credential.name })
          }
        >
          <TrashIcon className="size-4" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
