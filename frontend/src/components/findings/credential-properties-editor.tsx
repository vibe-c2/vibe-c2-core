import { PlusIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { PropertyDraft } from "@/components/findings/credential-property-drafts"
import { makeClientId } from "@/components/findings/credential-key-drafts"

interface CredentialPropertiesEditorProps {
  properties: PropertyDraft[]
  onChange: (next: PropertyDraft[]) => void
}

// CredentialPropertiesEditor renders an extendable list of name/value pairs
// for operator-defined metadata. Visually lighter than CredentialKeysEditor
// (single-line value, no card border) because values are short labels like
// "port=2222" rather than multi-line key material.
//
// Duplicate-name detection runs inline so the operator sees the error before
// submitting; the backend still rejects on save as the source of truth.
export function CredentialPropertiesEditor({
  properties,
  onChange,
}: CredentialPropertiesEditorProps) {
  function update(id: string, patch: Partial<Omit<PropertyDraft, "_id">>) {
    onChange(properties.map((p) => (p._id === id ? { ...p, ...patch } : p)))
  }

  function add() {
    onChange([
      ...properties,
      { _id: makeClientId(), name: "", value: "" },
    ])
  }

  function remove(id: string) {
    onChange(properties.filter((p) => p._id !== id))
  }

  // Index of names trimmed -> first row id. Subsequent rows with the same
  // name show a duplicate-name hint without blocking the form (the submit
  // path will surface the backend error if the user pushes through).
  const duplicateIds = findDuplicateRowIds(properties)

  return (
    <div className="flex flex-col gap-2">
      {properties.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No properties yet. Add a name/value pair (e.g. port=2222, mfa=on) to
          record context that doesn't fit username, password, or keys.
        </p>
      )}
      {properties.map((p) => {
        const isDuplicate = duplicateIds.has(p._id)
        return (
          <div key={p._id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Input
                value={p.name}
                onChange={(e) => update(p._id, { name: e.target.value })}
                placeholder="Name"
                aria-label="Property name"
                className="w-1/3"
                spellCheck={false}
              />
              <Input
                value={p.value}
                onChange={(e) => update(p._id, { value: e.target.value })}
                placeholder="Value"
                aria-label="Property value"
                className="flex-1"
                spellCheck={false}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(p._id)}
                aria-label="Remove property"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
            {isDuplicate && (
              <p className="text-xs text-destructive">
                Duplicate name — property names must be unique per credential.
              </p>
            )}
          </div>
        )
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={add}
        className="self-start"
      >
        <PlusIcon className="size-3.5" />
        Add property
      </Button>
    </div>
  )
}

// Returns the row ids of every draft whose trimmed name collides with an
// earlier non-empty trimmed name. The first occurrence is left out so the
// hint highlights only the offending later rows.
function findDuplicateRowIds(drafts: PropertyDraft[]): Set<string> {
  const seen = new Map<string, string>()
  const dupes = new Set<string>()
  for (const d of drafts) {
    const name = d.name.trim()
    if (!name) continue
    if (seen.has(name)) {
      dupes.add(d._id)
    } else {
      seen.set(name, d._id)
    }
  }
  return dupes
}
