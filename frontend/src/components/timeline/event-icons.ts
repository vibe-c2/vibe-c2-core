import {
  BookOpenIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleXIcon,
  KeyRoundIcon,
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
// concerns. Falls back to KeyRoundIcon so a new subject kind from the
// backend still renders something rather than an empty slot.
//
// Used for grouped event dots where a single shared icon represents N
// events of the same topic+kind. Per-event surfaces should prefer
// eventIcon, which can specialise on metadata (e.g. task status).
export function subjectKindIcon(subjectKind: string): LucideIcon {
  switch (subjectKind) {
    case "credential":
      return KeyRoundIcon
    case "wiki_document":
      return BookOpenIcon
    case "custom_event":
      return PinIcon
    case "task":
      return CircleCheckIcon
    default:
      return KeyRoundIcon
  }
}

// subjectKindAccent maps a subject kind to a Tailwind colour class. The
// timeline reads more clearly when each entity type carries a consistent
// hue across dots and the details dialog.
export function subjectKindAccent(subjectKind: string): string {
  switch (subjectKind) {
    case "credential":
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
