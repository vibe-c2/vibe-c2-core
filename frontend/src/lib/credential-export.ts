// Serialization + download helpers for the Credentials → Export action.
// Kept framework-free so the page-loop hook can stay thin and these helpers
// are easy to reason about in isolation.

import type {
  CredentialFieldsFragment,
  CredentialFieldsWithOperationFragment,
} from "@/graphql/gql/graphql"

export type ExportableCredential =
  | CredentialFieldsFragment
  | CredentialFieldsWithOperationFragment

export function toJson(credentials: readonly ExportableCredential[]): string {
  return JSON.stringify(credentials, null, 2)
}

// RFC 4180-ish CSV. Header is the three fields the user asked for:
// name, username, password. Fields are quoted when they contain a comma,
// quote, CR, or LF; embedded quotes are doubled. Nulls render as empty.
export function toCsv(credentials: readonly ExportableCredential[]): string {
  const header = ["name", "username", "password"]
  const rows = credentials.map((c) => [c.name, c.username, c.password])
  return [header, ...rows].map(encodeRow).join("\r\n")
}

function encodeRow(row: readonly (string | null | undefined)[]): string {
  return row.map(encodeCell).join(",")
}

function encodeCell(value: string | null | undefined): string {
  if (value == null) return ""
  const needsQuoting = /[",\r\n]/.test(value)
  if (!needsQuoting) return value
  return `"${value.replace(/"/g, '""')}"`
}

export function downloadBlob(
  content: string,
  filename: string,
  mime: string,
): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportFilename(
  label: string,
  ext: "json" | "csv",
): string {
  const date = new Date().toISOString().slice(0, 10)
  const safe = label.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "")
  const slug = safe || "export"
  return `credentials-${slug}-${date}.${ext}`
}
