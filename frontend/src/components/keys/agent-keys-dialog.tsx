import { toast } from "sonner"
import { BotIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { AgentKeyCard } from "@/components/keys/agent-key-card"
import { AgentKeyForm, type AgentKeyFormValues } from "@/components/keys/agent-key-form"
import { useCreateAgentKey, useMyAgentKeys } from "@/graphql/hooks/agent-keys"
import { useAgentKeyStore } from "@/stores/agent-keys"

/**
 * Agent keys: delegated credentials for an AI agent working alongside the
 * operator over MCP.
 *
 * Distinct from the API key dialog because the principals differ. An API key
 * IS the user; an agent key acts on their behalf under a ceiling, is
 * separately revocable, and is attributed separately everywhere it acts.
 */
export function AgentKeysDialog() {
  const { agentKeysDialogOpen, closeAgentKeysDialog } = useAgentKeyStore()

  return (
    <Dialog
      open={agentKeysDialogOpen}
      onOpenChange={(open) => {
        if (!open) closeAgentKeysDialog()
      }}
    >
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Agent keys</DialogTitle>
          <DialogDescription>
            Give an AI agent access to work alongside you. Each key acts on your
            behalf under a ceiling you set, is revocable on its own, and is
            attributed separately everywhere it acts.
          </DialogDescription>
        </DialogHeader>
        {agentKeysDialogOpen && <AgentKeysDialogBody />}
      </DialogContent>
    </Dialog>
  )
}

function AgentKeysDialogBody() {
  const { data, isLoading } = useMyAgentKeys()
  const create = useCreateAgentKey()
  const { createFormOpen, setCreateFormOpen, setFreshToken } = useAgentKeyStore()

  async function handleCreate(values: AgentKeyFormValues) {
    try {
      const res = await create.mutateAsync({
        name: values.name,
        // null ⇒ omit, which the server reads as "every operation the owner
        // belongs to".
        operationScopes: values.operationScopes ?? undefined,
        maxRole: values.maxRole,
        allowWrites: values.allowWrites,
      })
      setFreshToken(res.createAgentKey.token, res.createAgentKey.agentKey.id)
      setCreateFormOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create agent key")
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-10 w-40" />
      </div>
    )
  }

  const keys = data?.myAgentKeys ?? []

  if (createFormOpen) {
    return (
      <div className="rounded-md border p-4">
        <AgentKeyForm
          submitLabel="Create key"
          pending={create.isPending}
          onSubmit={handleCreate}
          onCancel={() => setCreateFormOpen(false)}
        />
      </div>
    )
  }

  return (
    <>
      {keys.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          <BotIcon className="mx-auto mb-2 size-5" />
          No agent keys yet.
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => (
            <AgentKeyCard key={key.id} agentKey={key} />
          ))}
        </div>
      )}

      <Button variant="outline" onClick={() => setCreateFormOpen(true)}>
        <PlusIcon className="size-4" />
        New agent key
      </Button>

      <ConnectionHint />
    </>
  )
}

function ConnectionHint() {
  return (
    <details className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
      <summary className="cursor-pointer select-none text-muted-foreground">
        How to connect an agent
      </summary>
      <div className="mt-2 space-y-2">
        <p>
          Point any MCP client at the endpoint below and pass the token as a
          bearer credential:
        </p>
        <pre className="overflow-x-auto rounded bg-background/80 p-2 font-mono text-[11px]">
{`{
  "mcpServers": {
    "vibe-c2": {
      "url": "$HOST/api/v1/mcp",
      "headers": { "Authorization": "Bearer vca_..." }
    }
  }
}`}
        </pre>
        <p className="text-muted-foreground">
          An agent key works only against this endpoint. Sent anywhere else —
          the GraphQL API, the wiki routes — it is refused, so the agent cannot
          reach past the tools it was given.
        </p>
        <p className="text-muted-foreground">
          Credentials and hashes are returned to the agent in full, including
          secret material. That material leaves this platform and reaches your
          model provider. Use a read-only key, or narrow the operations, if that
          is not what you want.
        </p>
      </div>
    </details>
  )
}
