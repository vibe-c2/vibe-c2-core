import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
// Generic despite its location — its null-means-"all my operations" contract
// is exactly the agent key's empty-scopes semantics, so it is reused rather
// than reimplemented.
import { OperationMultiSelect } from "@/components/findings/operation-multi-select"
import type { OperationRole } from "@/graphql/gql/graphql"

export interface AgentKeyFormValues {
  name: string
  // null ⇒ every operation the owner belongs to. Mirrors the server, where an
  // empty operation_scopes list means the same thing.
  operationScopes: string[] | null
  maxRole: OperationRole
  allowWrites: boolean
}

// ADMIN is absent by design: agent keys work inside an operation, they do not
// administer one. The server rejects it too — this just keeps the UI from
// offering something that would fail.
const MAX_ROLE_OPTIONS: { value: OperationRole; label: string; hint: string }[] = [
  { value: "VIEWER", label: "Viewer", hint: "Read only, whatever you can read" },
  { value: "OPERATOR", label: "Operator", hint: "Can change things you can change" },
]

interface AgentKeyFormProps {
  initial?: Partial<AgentKeyFormValues>
  submitLabel: string
  pending?: boolean
  onSubmit: (values: AgentKeyFormValues) => void
  onCancel: () => void
}

export function AgentKeyForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: AgentKeyFormProps) {
  const [name, setName] = useState(initial?.name ?? "")
  const [operationScopes, setOperationScopes] = useState<string[] | null>(
    initial?.operationScopes ?? null,
  )
  const [maxRole, setMaxRole] = useState<OperationRole>(initial?.maxRole ?? "VIEWER")
  const [allowWrites, setAllowWrites] = useState(initial?.allowWrites ?? false)

  const trimmedName = name.trim()
  const canSubmit = trimmedName.length > 0 && !pending

  // Writes are meaningless at viewer level — the operation role would refuse
  // them anyway. Surfacing that here stops an operator building a key that
  // silently cannot do what they configured.
  const writesInert = maxRole === "VIEWER" && allowWrites

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSubmit) return
        onSubmit({ name: trimmedName, operationScopes, maxRole, allowWrites })
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="agent-key-name">Name</Label>
        <Input
          id="agent-key-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Claude — Operation Nightfall"
          maxLength={80}
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          Shown wherever this agent is attributed — the timeline, the activity
          rail.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Operations</Label>
        <OperationMultiSelect value={operationScopes} onChange={setOperationScopes} />
        <p className="text-xs text-muted-foreground">
          Leave as all operations to track your membership automatically. Naming
          operations narrows the key — it never grants access you don&apos;t
          already have.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="agent-key-role">Maximum role</Label>
        <Select
          value={maxRole}
          onValueChange={(val) => setMaxRole(val as OperationRole)}
        >
          <SelectTrigger id="agent-key-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MAX_ROLE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {MAX_ROLE_OPTIONS.find((o) => o.value === maxRole)?.hint}. This is a
          ceiling: the agent gets the lower of this and your own role in each
          operation, even if you are an admin.
        </p>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-md border p-3">
        <div className="space-y-0.5">
          <Label htmlFor="agent-key-writes" className="text-sm">
            Allow writes
          </Label>
          <p className="text-xs text-muted-foreground">
            Lets the agent create and edit wiki pages, tasks, hosts and
            findings. Off means it can only look.
          </p>
          {writesInert && (
            <p className="text-xs text-yellow-700 dark:text-yellow-400">
              A viewer-capped key cannot write. Raise the maximum role to
              operator for this to take effect.
            </p>
          )}
        </div>
        <Switch
          id="agent-key-writes"
          checked={allowWrites}
          onCheckedChange={setAllowWrites}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {pending ? "Working…" : submitLabel}
        </Button>
      </div>
    </form>
  )
}
