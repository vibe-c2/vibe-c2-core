import type { CredentialSearchField } from "@/graphql/gql/graphql"

// The selectable credential search fields, in the order they're shown in the
// picker. Mirrors the GraphQL `CredentialSearchField` enum on the backend.
// An empty selection means "search all of these" — the historical default.
export const CREDENTIAL_SEARCH_FIELDS: CredentialSearchField[] = [
  "NAME",
  "USERNAME",
  "PASSWORD",
  "PROPERTIES",
]

const FIELD_LABELS: Record<CredentialSearchField, string> = {
  NAME: "Name",
  USERNAME: "Username",
  PASSWORD: "Password",
  PROPERTIES: "Properties",
}

export function credentialSearchFieldLabel(f: CredentialSearchField): string {
  return FIELD_LABELS[f]
}

// Human-readable summary of the active field selection, used for the search
// placeholder so users see which fields their query hits. Empty = all fields.
export function describeSearchFields(
  fields: readonly CredentialSearchField[],
): string {
  const selected =
    fields.length === 0 ? CREDENTIAL_SEARCH_FIELDS : fields
  return selected.map((f) => FIELD_LABELS[f].toLowerCase()).join(", ")
}
