import { PlusIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  type KeyDraft,
  makeClientId,
} from "@/components/findings/credential-key-drafts"

interface CredentialKeysEditorProps {
  keys: KeyDraft[]
  onChange: (next: KeyDraft[]) => void
}

// CredentialKeysEditor renders an extendable list of named keys. Each row is
// a card with a name input, a content textarea, and a remove button; rows are
// keyed by a stable client-side id (`_id`) so React preserves focus across
// deletes and inserts.
export function CredentialKeysEditor({
  keys,
  onChange,
}: CredentialKeysEditorProps) {
  function update(id: string, patch: Partial<Omit<KeyDraft, "_id">>) {
    onChange(keys.map((k) => (k._id === id ? { ...k, ...patch } : k)))
  }

  function add() {
    onChange([...keys, { _id: makeClientId(), name: "", content: "" }])
  }

  function remove(id: string) {
    onChange(keys.filter((k) => k._id !== id))
  }

  return (
    <div className="flex flex-col gap-2">
      {keys.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No keys yet. Add a named key (e.g. SSH private key, TLS cert) using
          the button below.
        </p>
      )}
      {keys.map((k) => (
        <div
          key={k._id}
          className="rounded-md border bg-muted/30 p-3 space-y-2"
        >
          <div className="flex items-center gap-2">
            <Input
              value={k.name}
              onChange={(e) => update(k._id, { name: e.target.value })}
              placeholder="Key name (e.g. id_ed25519)"
              aria-label="Key name"
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => remove(k._id)}
              aria-label="Remove key"
            >
              <XIcon className="size-4" />
            </Button>
          </div>
          <Textarea
            rows={3}
            value={k.content}
            onChange={(e) => update(k._id, { content: e.target.value })}
            placeholder="ssh-ed25519 AAAA..."
            spellCheck={false}
            className="font-mono text-xs"
            aria-label="Key content"
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={add}
        className="self-start"
      >
        <PlusIcon className="size-3.5" />
        Add key
      </Button>
    </div>
  )
}
