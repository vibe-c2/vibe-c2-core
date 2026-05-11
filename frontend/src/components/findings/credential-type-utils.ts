import type { CredentialType } from "@/graphql/gql/graphql"

// The full list of credential types — kept in the same order they're exposed
// in the UI dropdowns. Mirrors the GraphQL enum on the backend.
export const CREDENTIAL_TYPES: CredentialType[] = [
  "PASSWORD",
  "SSH_KEY",
  "API_KEY",
  "TOKEN",
  "HASH",
  "OTHER",
]

const TYPE_LABELS: Record<CredentialType, string> = {
  PASSWORD: "Password",
  SSH_KEY: "SSH Key",
  API_KEY: "API Key",
  TOKEN: "Token",
  HASH: "Hash",
  OTHER: "Other",
}

export function credentialTypeLabel(t: CredentialType): string {
  return TYPE_LABELS[t]
}

/**
 * Splits a "one per line" textarea into a trimmed, non-empty string list.
 * Used for the credential keys input.
 */
export function parseKeysText(text: string): string[] {
  return text
    .split("\n")
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
}

/**
 * Parses a comma-separated tag string into a deduplicated lowercase array.
 * Mirrors the backend normalization so the UI displays cleanly after submit.
 */
export function parseTagsText(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split(",")) {
    const t = raw.trim().toLowerCase()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}
