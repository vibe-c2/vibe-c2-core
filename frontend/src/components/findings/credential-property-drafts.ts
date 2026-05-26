import type { CredentialPropertyInput } from "@/graphql/gql/graphql"
import { makeClientId } from "@/components/findings/credential-key-drafts"

// PropertyDraft carries a client-only `_id` so React can identify a row across
// inserts and deletes; the id is stripped before submitting to the API.
// Mirrors KeyDraft — kept separate so the two editors can diverge later
// (e.g. if keys grow a binary toggle while properties stay text-only).
export interface PropertyDraft {
  _id: string
  name: string
  value: string
}

// Seeds editor state from a wire-format property list and assigns stable
// client ids.
export function propertyDraftsFromWire(
  properties: ReadonlyArray<{ name: string; value: string }>,
): PropertyDraft[] {
  return properties.map((p) => ({
    _id: makeClientId(),
    name: p.name,
    value: p.value,
  }))
}

// Strips draft-only ids and mirrors backend normalisation: trim each field,
// drop rows where both name and value end up empty. The backend enforces
// non-empty name + uniqueness + length caps; this just keeps no-op blank
// rows out of the request.
export function propertyDraftsToInputs(
  properties: PropertyDraft[],
): CredentialPropertyInput[] {
  const out: CredentialPropertyInput[] = []
  for (const p of properties) {
    const name = p.name.trim()
    const value = p.value.trim()
    if (!name && !value) continue
    out.push({ name, value })
  }
  return out
}
