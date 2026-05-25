import { useState } from "react"
import { toast } from "sonner"
import {
  AlertTriangleIcon,
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  KeyIcon,
  RefreshCwIcon,
  Trash2Icon,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useAPIKeyStore } from "@/stores/api-keys"
import {
  useCreateMyAPIKey,
  useDeleteMyAPIKey,
  useMyAPIKey,
  useRegenerateMyAPIKey,
  useSetMyAPIKeyEnabled,
} from "@/graphql/hooks/api-keys"

export function MyAPIKeyDialog() {
  const { apiKeysDialogOpen, closeAPIKeysDialog } = useAPIKeyStore()

  return (
    <Dialog
      open={apiKeysDialogOpen}
      onOpenChange={(open) => {
        if (!open) closeAPIKeysDialog()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>API Key</DialogTitle>
          <DialogDescription>
            Use an API key to call the GraphQL API from scripts. The key
            inherits your roles, so it can do anything you can do — keep it
            secret.
          </DialogDescription>
        </DialogHeader>
        {apiKeysDialogOpen && <APIKeyDialogBody />}
      </DialogContent>
    </Dialog>
  )
}

function APIKeyDialogBody() {
  const { data, isLoading } = useMyAPIKey()
  const create = useCreateMyAPIKey()
  const regenerate = useRegenerateMyAPIKey()
  const setEnabled = useSetMyAPIKeyEnabled()
  const deleteKey = useDeleteMyAPIKey()
  const { freshToken, setFreshToken } = useAPIKeyStore()

  const [confirmRegen, setConfirmRegen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function handleCreate() {
    try {
      const res = await create.mutateAsync()
      setFreshToken(res.createMyAPIKey.token)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create API key")
    }
  }

  async function handleRegenerate() {
    try {
      const res = await regenerate.mutateAsync()
      setFreshToken(res.regenerateMyAPIKey.token)
      setConfirmRegen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to regenerate API key")
    }
  }

  async function handleToggle(enabled: boolean) {
    try {
      await setEnabled.mutateAsync(enabled)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update API key")
    }
  }

  async function handleDelete() {
    try {
      await deleteKey.mutateAsync()
      setFreshToken(null)
      setConfirmDelete(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete API key")
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-10 w-32" />
      </div>
    )
  }

  const apiKey = data?.myAPIKey ?? null

  // Empty state: never minted a key. Returns a fragment — children sit
  // directly under DialogContent's grid gap-4 spacing, so no wrapper div.
  if (!apiKey) {
    return (
      <>
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          <KeyIcon className="mx-auto mb-2 size-5" />
          You don&apos;t have an API key yet.
        </div>
        {freshToken ? (
          <FreshTokenBanner token={freshToken} onDismiss={() => setFreshToken(null)} />
        ) : (
          <Button onClick={handleCreate} disabled={create.isPending} className="w-full">
            {create.isPending ? "Generating..." : "Generate API key"}
          </Button>
        )}
        <UsageHint />
      </>
    )
  }

  // Existing-key view. Returns a fragment so DialogFooter's -mx-4 -mb-4
  // escape lands on DialogContent's padding (which is what produces the
  // flush-to-edge gray footer strip). Wrapping these in a non-padded div
  // would leak the negative margins past the dialog bounds.
  return (
    <>
      {freshToken && (
        <FreshTokenBanner token={freshToken} onDismiss={() => setFreshToken(null)} />
      )}

      <div className="rounded-md border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5 min-w-0">
            <div className="text-xs text-muted-foreground">Key ID</div>
            <div className="font-mono text-sm truncate">vc2_{apiKey.keyId}_…</div>
          </div>
          {apiKey.enabled ? (
            <Badge variant="default">Enabled</Badge>
          ) : (
            <Badge variant="outline">Disabled</Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
          <div>
            <div className="text-muted-foreground/70">Created</div>
            <div className="text-foreground">
              <FormattedDateTimeText date={apiKey.createdAt} />
            </div>
          </div>
          <div>
            <div className="text-muted-foreground/70">Last used</div>
            <div className="text-foreground">
              {apiKey.lastUsedAt ? (
                <FormattedDateTimeText date={apiKey.lastUsedAt} />
              ) : (
                <span className="text-muted-foreground">Never</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-3">
          <div className="flex items-center gap-2">
            <Switch
              id="key-enabled"
              checked={apiKey.enabled}
              onCheckedChange={handleToggle}
              disabled={setEnabled.isPending}
            />
            <Label htmlFor="key-enabled" className="text-sm">
              {apiKey.enabled ? "Enabled" : "Disabled"}
            </Label>
          </div>
        </div>
      </div>

      <UsageHint />

      <DialogFooter className="gap-2 sm:gap-2">
        <Button
          variant="outline"
          onClick={() => setConfirmRegen(true)}
          disabled={regenerate.isPending}
        >
          <RefreshCwIcon className="size-4" />
          Regenerate
        </Button>
        <Button
          variant="destructive"
          onClick={() => setConfirmDelete(true)}
          disabled={deleteKey.isPending}
        >
          <Trash2Icon className="size-4" />
          Delete
        </Button>
      </DialogFooter>

      <ConfirmDialog
        open={confirmRegen}
        title="Regenerate API key?"
        description="Your existing token will stop working immediately. Any scripts using it will need to be updated with the new token."
        confirmLabel={regenerate.isPending ? "Regenerating..." : "Regenerate"}
        onCancel={() => setConfirmRegen(false)}
        onConfirm={handleRegenerate}
        disabled={regenerate.isPending}
        destructive
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete API key?"
        description="Your token will stop working immediately. You can generate a new one anytime."
        confirmLabel={deleteKey.isPending ? "Deleting..." : "Delete"}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        disabled={deleteKey.isPending}
        destructive
      />
    </>
  )
}

// FreshTokenBanner shows the full token exactly once. Defaults to masked
// to discourage shoulder-surfing; user clicks the eye to reveal, then must
// confirm "I've saved it" to dismiss — preventing accidental loss.
function FreshTokenBanner({ token, onDismiss }: { token: string; onDismiss: () => void }) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Failed to copy to clipboard")
    }
  }

  return (
    <div className="min-w-0 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 space-y-2">
      <div className="flex items-start gap-2 text-sm text-yellow-700 dark:text-yellow-400">
        <AlertTriangleIcon className="size-4 mt-0.5 shrink-0" />
        <span>
          Copy this token now — it won&apos;t be shown again. If you lose it,
          you&apos;ll need to regenerate the key.
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <code className="flex-1 min-w-0 truncate rounded bg-background/80 px-2 py-1.5 font-mono text-xs">
          {revealed ? token : maskToken(token)}
        </code>
        <Button
          size="icon-sm"
          variant="outline"
          onClick={() => setRevealed((v) => !v)}
          title={revealed ? "Hide" : "Reveal"}
        >
          {revealed ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </Button>
        <Button size="icon-sm" variant="outline" onClick={handleCopy} title="Copy">
          {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
        </Button>
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          I&apos;ve saved it
        </Button>
      </div>
    </div>
  )
}

// maskToken keeps the public prefix visible (so the user can confirm which
// key was minted) while hiding the secret tail.
function maskToken(token: string): string {
  const lastSep = token.lastIndexOf("_")
  if (lastSep === -1) return "•".repeat(token.length)
  return token.slice(0, lastSep + 1) + "•".repeat(Math.max(8, token.length - lastSep - 1))
}

function UsageHint() {
  return (
    <details className="rounded-md border bg-muted/30 px-3 py-2 text-xs">
      <summary className="cursor-pointer select-none text-muted-foreground">
        How to use this key
      </summary>
      <div className="mt-2 space-y-2">
        <p>Send the token as a Bearer credential against the GraphQL endpoint:</p>
        <pre className="overflow-x-auto rounded bg-background/80 p-2 font-mono text-[11px]">
{`curl -X POST $HOST/api/v1/graphql \\
  -H "Authorization: Bearer vc2_..." \\
  -H "Content-Type: application/json" \\
  -d '{"query":"{ me { id username } }"}'`}
        </pre>
        <p className="text-muted-foreground">
          The key inherits your roles and works across every operation you&apos;re
          a member of. CSRF is not required for API key requests.
        </p>
        <p className="text-muted-foreground">
          To discover every available query and mutation, run a GraphQL
          introspection query — e.g.{" "}
          <code className="font-mono text-[11px]">
            {"{ __schema { queryType { fields { name description } } mutationType { fields { name description } } } }"}
          </code>
          . Most code generators and AI agents can do this automatically given
          the endpoint and this token.
        </p>
      </div>
    </details>
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
  disabled?: boolean
  destructive?: boolean
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
  disabled,
  destructive,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={disabled}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
