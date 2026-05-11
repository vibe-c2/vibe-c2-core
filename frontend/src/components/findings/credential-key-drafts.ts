import type { CredentialKeyInput } from "@/graphql/gql/graphql"

// KeyDraft carries a client-only `_id` so React can identify a row across
// inserts and deletes; the id is stripped before submitting to the API.
export interface KeyDraft {
  _id: string
  name: string
  content: string
}

// Seeds editor state from a wire-format key list and assigns stable client ids.
export function keyDraftsFromWire(
  keys: ReadonlyArray<{ name: string; content: string }>,
): KeyDraft[] {
  return keys.map((k) => ({
    _id: makeClientId(),
    name: k.name,
    content: k.content,
  }))
}

// Strips draft-only ids and mirrors backend normalisation: trim each field,
// drop rows where both name and content end up empty.
export function keyDraftsToInputs(keys: KeyDraft[]): CredentialKeyInput[] {
  const out: CredentialKeyInput[] = []
  for (const k of keys) {
    const name = k.name.trim()
    const content = k.content.trim()
    if (!name && !content) continue
    out.push({ name, content })
  }
  return out
}

export function makeClientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}
