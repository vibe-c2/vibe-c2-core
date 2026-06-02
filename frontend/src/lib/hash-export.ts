// Serialization helpers for the Findings → Hashes → Export action. Mirrors
// lib/credential-export.ts: framework-free, and the CSV escaping, filename
// builder, and download mechanics are shared via lib/file-export.ts. This
// module only owns the hash-specific column selection.

import type {
  HashFieldsFragment,
  HashFieldsWithOperationFragment,
} from "@/graphql/gql/graphql"
import { hashStatusLabel } from "@/components/findings/hash-status-utils"
import {
  buildExportFilename,
  downloadBlob,
  encodeCsv,
  type ExportFormat,
} from "@/lib/file-export"

export type ExportableHash =
  | HashFieldsFragment
  | HashFieldsWithOperationFragment

export function toJson(hashes: readonly ExportableHash[]): string {
  return JSON.stringify(hashes, null, 2)
}

// Columns are the operator-relevant fields: the raw hash value, its cracking
// status, the free-text comment, and tags. Tags are joined with a space (the
// same separator the tag inputs use).
export function toCsv(hashes: readonly ExportableHash[]): string {
  return encodeCsv(
    ["value", "status", "comment", "tags"],
    hashes.map((h) => [
      h.value,
      hashStatusLabel(h.status),
      h.comment,
      h.tags.join(" "),
    ]),
  )
}

export function exportFilename(label: string, ext: ExportFormat): string {
  return buildExportFilename("hashes", label, ext)
}

export { downloadBlob }
