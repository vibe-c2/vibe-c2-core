import { apiFetch, ApiError } from "@/services/api-client"

/** The registry only accepts zips. A skill is a directory of files, and a zip
 *  is how every client already expects to receive one. */
export const SKILL_ACCEPT = ".zip,application/zip"

export interface PublishedSkill {
  name: string
  version: number
  claimed: boolean
  sizeBytes: number
  checksum: string
  downloadUrl: string
}

export interface PublishSkillInput {
  name: string
  description: string
  notes: string
  file: File
  /** The server's cap, read from the registry query so the two cannot drift. */
  maxBytes: number
}

/**
 * POST a skill bundle, claiming the name if it is free and adding a version
 * if the caller already owns it.
 *
 * REST rather than a mutation because this moves a file. The size check here
 * only saves a round trip; the server enforces the real one, and also decides
 * whether the bytes are a readable zip.
 */
export async function publishSkill(
  input: PublishSkillInput,
): Promise<PublishedSkill> {
  if (input.file.size > input.maxBytes) {
    throw new ApiError(
      413,
      `That bundle is ${formatBytes(input.file.size)}; the limit is ${formatBytes(input.maxBytes)}.`,
    )
  }

  const form = new FormData()
  form.append("name", input.name)
  form.append("description", input.description)
  form.append("notes", input.notes)
  form.append("file", input.file, input.file.name || "skill.zip")

  const res = await apiFetch("/skills", {
    method: "POST",
    body: form,
    timeoutMs: 120_000,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? "Publishing failed.")
  }
  return res.json()
}

/** Human-readable size, used in both the upload error and the skill cards. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
