// Serialization helpers for the Credentials → Export action. Kept
// framework-free so the page-loop hook can stay thin. The CSV escaping,
// filename builder, and download mechanics are shared via lib/file-export.ts;
// this module only owns the credential-specific column selection.

import type {
  CredentialFieldsFragment,
  CredentialFieldsWithOperationFragment,
} from "@/graphql/gql/graphql"
import {
  buildExportFilename,
  downloadBlob,
  encodeCsv,
  type ExportFormat,
} from "@/lib/file-export"

export type ExportableCredential =
  | CredentialFieldsFragment
  | CredentialFieldsWithOperationFragment

export function toJson(credentials: readonly ExportableCredential[]): string {
  return JSON.stringify(credentials, null, 2)
}

// Columns are the three fields the user asked for: name, username, password.
export function toCsv(credentials: readonly ExportableCredential[]): string {
  return encodeCsv(
    ["name", "username", "password"],
    credentials.map((c) => [c.name, c.username, c.password]),
  )
}

export function exportFilename(label: string, ext: ExportFormat): string {
  return buildExportFilename("credentials", label, ext)
}

export { downloadBlob }
