import {
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
  FileTextIcon,
  HashIcon,
  KeyIcon,
  PinIcon,
  type LucideIcon,
} from "lucide-react"

import type { TimelineEventFieldsFragment } from "@/graphql/gql/graphql"

// TaskStatus is the persisted task outcome the timeline row carries in
// metadata.status. Empty string means the metadata was missing, malformed,
// or pre-dated status persistence — treated as "unknown" everywhere.
export type TaskStatus = "SUCCESS" | "FAIL" | ""

// taskStatusIcon maps a task outcome to a Lucide glyph. Used by both the
// per-event row and the group dialog header (which promotes the dominant
// outcome of a bucket up to the title icon).
export function taskStatusIcon(status: TaskStatus): LucideIcon {
  switch (status) {
    case "SUCCESS":
      return CircleCheckIcon
    case "FAIL":
      return CircleXIcon
    default:
      return CircleDashedIcon
  }
}

// taskStatusAccent mirrors taskStatusIcon for colour.
export function taskStatusAccent(status: TaskStatus): string {
  switch (status) {
    case "SUCCESS":
      return "text-emerald-500"
    case "FAIL":
      return "text-red-500"
    default:
      return "text-muted-foreground"
  }
}

// subjectKindIcon picks an icon for an event dot based on the entity it
// concerns. Icons mirror the wiki reference-chip language (KeyIcon for
// credentials, HashIcon for hashes, FileTextIcon for documents) so an event
// dot and the chip for the same entity read as the same thing. Falls back to
// a neutral CircleDashedIcon so a new subject kind from the backend still
// renders something rather than masquerading as a known type.
//
// Used for grouped event dots where a single shared icon represents N
// events of the same topic+kind. Per-event surfaces should prefer
// eventIcon, which can specialise on metadata (e.g. task status).
export function subjectKindIcon(subjectKind: string): LucideIcon {
  switch (subjectKind) {
    case "credential":
      return KeyIcon
    case "hash":
      return HashIcon
    case "wiki_document":
      return FileTextIcon
    case "custom_event":
      return PinIcon
    case "task":
      return CircleCheckIcon
    default:
      return CircleDashedIcon
  }
}

// subjectKindAccent maps a subject kind to a Tailwind colour class. Hues
// mirror the wiki reference-chip accents (violet for credentials/secrets,
// amber for hashes, sky for documents) so an entity carries one identity
// across the timeline dots, the details dialog, and the wiki editor chips.
export function subjectKindAccent(subjectKind: string): string {
  switch (subjectKind) {
    case "credential":
      return "text-violet-500"
    case "hash":
      return "text-amber-500"
    case "wiki_document":
      return "text-sky-500"
    case "custom_event":
    case "task":
      return "text-emerald-500"
    default:
      return "text-muted-foreground"
  }
}

// eventIcon resolves the icon for a single event, specialising on task
// outcome when the row carries one. Non-task kinds defer to
// subjectKindIcon so visual identity stays consistent.
export function eventIcon(event: TimelineEventFieldsFragment): LucideIcon {
  if (event.subjectKind === "task") {
    return taskStatusIcon(taskStatus(event.metadata))
  }
  return subjectKindIcon(event.subjectKind)
}

// eventAccent mirrors eventIcon: defers to taskStatusAccent for tasks and
// the kind-level accent otherwise.
export function eventAccent(event: TimelineEventFieldsFragment): string {
  if (event.subjectKind === "task") {
    return taskStatusAccent(taskStatus(event.metadata))
  }
  return subjectKindAccent(event.subjectKind)
}

// taskStatus extracts the outcome a task closure row was persisted with.
// Returns "" when metadata is missing, malformed, or has no status field —
// callers then treat the outcome as undefined.
export function taskStatus(metadata: string | null | undefined): TaskStatus {
  if (!metadata) return ""
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>
    const s = parsed.status
    if (s === "SUCCESS" || s === "FAIL") return s
    return ""
  } catch {
    return ""
  }
}
