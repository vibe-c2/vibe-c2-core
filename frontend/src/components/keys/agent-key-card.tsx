import { useState } from "react"
import { toast } from "sonner"
import { PencilIcon, RefreshCwIcon, Trash2Icon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ConfirmDialog } from "@/components/keys/confirm-dialog"
import { FreshTokenBanner } from "@/components/keys/fresh-token-banner"
import { AgentKeyForm, type AgentKeyFormValues } from "@/components/keys/agent-key-form"
import {
  useDeleteAgentKey,
  useRegenerateAgentKey,
  useSetAgentKeyEnabled,
  useUpdateAgentKey,
} from "@/graphql/hooks/agent-keys"
import { useAgentKeyStore } from "@/stores/agent-keys"
import type { AgentKeyFieldsFragment } from "@/graphql/gql/graphql"

/**
 * One agent key: identity, what it may reach, and its lifecycle actions.
 *
 * The scope summary is the point of this card — an operator should be able to
 * answer "what can this thing do?" without opening the edit form.
 */
export function AgentKeyCard({ agentKey }: { agentKey: AgentKeyFieldsFragment }) {
  const regenerate = useRegenerateAgentKey()
  const update = useUpdateAgentKey()
  const setEnabled = useSetAgentKeyEnabled()
  const remove = useDeleteAgentKey()
  const { freshToken, freshTokenKeyId, setFreshToken } = useAgentKeyStore()

  const [editing, setEditing] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const showsFreshToken = freshToken !== null && freshTokenKeyId === agentKey.id

  async function handleRegenerate() {
    try {
      const res = await regenerate.mutateAsync(agentKey.id)
      setFreshToken(res.regenerateAgentKey.token, agentKey.id)
      setConfirmRegen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to regenerate agent key")
    }
  }

  async function handleUpdate(values: AgentKeyFormValues) {
    try {
      await update.mutateAsync({
        id: agentKey.id,
        input: {
          name: values.name,
          // null means "all my operations"; the server reads an empty list the
          // same way, and omitting the field would leave the old scope in
          // place — so the widening case must send [] explicitly.
          operationScopes: values.operationScopes ?? [],
          maxRole: values.maxRole,
          allowWrites: values.allowWrites,
        },
      })
      setEditing(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update agent key")
    }
  }

  async function handleToggle(enabled: boolean) {
    try {
      await setEnabled.mutateAsync({ id: agentKey.id, enabled })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update agent key")
    }
  }

  async function handleDelete() {
    try {
      await remove.mutateAsync(agentKey.id)
      if (showsFreshToken) setFreshToken(null)
      setConfirmDelete(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete agent key")
    }
  }

  if (editing) {
    return (
      <div className="rounded-md border p-4">
        <AgentKeyForm
          initial={{
            name: agentKey.name,
            operationScopes:
              agentKey.operationScopes.length === 0
                ? null
                : agentKey.operationScopes.map((op) => op.id),
            maxRole: agentKey.maxRole,
            allowWrites: agentKey.allowWrites,
          }}
          submitLabel="Save"
          pending={update.isPending}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {showsFreshToken && (
        <FreshTokenBanner token={freshToken} onDismiss={() => setFreshToken(null)} />
      )}

      <div className="rounded-md border p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <div className="truncate text-sm font-medium">{agentKey.name}</div>
            <div className="font-mono text-xs text-muted-foreground truncate">
              vca_{agentKey.keyId}_…
            </div>
          </div>
          {agentKey.enabled ? (
            <Badge variant="default">Enabled</Badge>
          ) : (
            <Badge variant="outline">Disabled</Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary">
            {agentKey.maxRole === "OPERATOR" ? "Operator" : "Viewer"}
          </Badge>
          <Badge variant={agentKey.allowWrites ? "secondary" : "outline"}>
            {agentKey.allowWrites ? "Can write" : "Read only"}
          </Badge>
          <ScopeBadges scopes={agentKey.operationScopes} />
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-muted-foreground/70">Created</div>
            <div>
              <FormattedDateTimeText date={agentKey.createdAt} />
            </div>
          </div>
          <div>
            <div className="text-muted-foreground/70">Last used</div>
            <div>
              {agentKey.lastUsedAt ? (
                <FormattedDateTimeText date={agentKey.lastUsedAt} />
              ) : (
                <span className="text-muted-foreground">Never</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <div className="flex items-center gap-2">
            <Switch
              id={`agent-key-enabled-${agentKey.id}`}
              checked={agentKey.enabled}
              onCheckedChange={handleToggle}
              disabled={setEnabled.isPending}
            />
            <Label
              htmlFor={`agent-key-enabled-${agentKey.id}`}
              className="text-sm text-muted-foreground"
            >
              {agentKey.enabled ? "Active" : "Paused"}
            </Label>
          </div>
          <div className="flex gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              title="Edit scope"
              onClick={() => setEditing(true)}
            >
              <PencilIcon className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              title="Regenerate token"
              onClick={() => setConfirmRegen(true)}
              disabled={regenerate.isPending}
            >
              <RefreshCwIcon className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              title="Delete"
              onClick={() => setConfirmDelete(true)}
              disabled={remove.isPending}
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRegen}
        title={`Regenerate "${agentKey.name}"?`}
        description="The current token stops working immediately. Any agent using it will need the new one."
        confirmLabel={regenerate.isPending ? "Regenerating…" : "Regenerate"}
        onCancel={() => setConfirmRegen(false)}
        onConfirm={handleRegenerate}
        disabled={regenerate.isPending}
        destructive
      />
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete "${agentKey.name}"?`}
        description="The token stops working immediately and the key cannot be recovered. Everything the agent already did stays on the timeline."
        confirmLabel={remove.isPending ? "Deleting…" : "Delete"}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        disabled={remove.isPending}
        destructive
      />
    </div>
  )
}

// An empty scope list is the widest setting, not the narrowest — it tracks
// membership. Saying so explicitly avoids reading "no operations" as "none".
function ScopeBadges({
  scopes,
}: {
  scopes: AgentKeyFieldsFragment["operationScopes"]
}) {
  if (scopes.length === 0) {
    return <Badge variant="outline">All my operations</Badge>
  }
  const shown = scopes.slice(0, 3)
  return (
    <>
      {shown.map((op) => (
        <Badge key={op.id} variant="outline" className="max-w-40 truncate">
          {op.name}
        </Badge>
      ))}
      {scopes.length > shown.length && (
        <Badge variant="outline">+{scopes.length - shown.length}</Badge>
      )}
    </>
  )
}
