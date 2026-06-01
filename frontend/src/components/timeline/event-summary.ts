import type { TimelineEventFieldsFragment } from "@/graphql/gql/graphql"
import { taskStatus } from "./event-icons"

// renderEventSummary turns a persisted timeline event into a one-line human
// description. Kept as a pure function so iteration on phrasing /
// localisation does not require any backfill.
//
// The fallback path uses subject_kind + subject_name + actor — works for
// future topics added to the persistence subscriber without code changes
// here.
export function renderEventSummary(event: TimelineEventFieldsFragment): string {
  const actor = event.actor?.username ?? "System"
  const name = event.subjectName || "(unnamed)"

  switch (event.topic) {
    case "credential.created":
      return `${actor} added credential "${name}"`
    case "hash.created":
      return `${actor} added hash "${name}"`
    case "hash.bulk_imported":
      return `${actor} imported ${name}`
    case "hash.cracked":
      return `${actor} cracked hash "${name}"`
    case "wiki.document.created":
      return `${actor} created wiki document "${name}"`
    case "task.stage_changed":
      return `${actor} completed task "${name}" with status ${taskOutcomeLabel(
        event.metadata,
      )}`
    case "timeline.custom.created":
      // Custom annotations carry the name as the primary content; the actor
      // is surfaced via the dialog's "Actor" row, so we keep the headline
      // focused on what was annotated rather than who did it.
      return name
    default:
      return `${actor} ${humaniseTopic(event.topic)} ${humaniseKind(
        event.subjectKind,
      )} "${name}"`
  }
}

// renderGroupSummary describes a same-topic stack of N events as a single
// human phrase — used for the tooltip on grouped event dots when the
// active-day segment collapses identical events into one badge'd icon.
export function renderGroupSummary(topic: string, count: number): string {
  switch (topic) {
    case "credential.created":
      return `${count} credentials added`
    case "hash.created":
      return `${count} hashes added`
    case "hash.bulk_imported":
      return `${count} bulk imports`
    case "hash.cracked":
      return `${count} hashes cracked`
    case "wiki.document.created":
      return `${count} wiki documents created`
    case "timeline.custom.created":
      return `${count} custom events`
    case "task.stage_changed":
      return `${count} tasks completed`
    default: {
      const verb = humaniseTopic(topic)
      return `${count} × ${verb}`
    }
  }
}

// taskOutcomeLabel renders the persisted task status as a lowercase word
// for inline summary use. Falls back to "unknown" when older rows lack a
// status field in metadata.
function taskOutcomeLabel(metadata: string | null | undefined): string {
  const s = taskStatus(metadata)
  switch (s) {
    case "SUCCESS":
      return "success"
    case "FAIL":
      return "fail"
    default:
      return "unknown"
  }
}

function humaniseTopic(topic: string): string {
  const last = topic.split(".").pop() ?? topic
  return last.replace(/_/g, " ")
}

function humaniseKind(kind: string): string {
  return kind.replace(/_/g, " ")
}

// parseCustomEventDescription pulls the description string out of a custom
// event row's JSON metadata bag, tolerating missing or malformed payloads.
export function parseCustomEventDescription(
  metadata: string | null | undefined,
): string {
  if (!metadata) return ""
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>
    const desc = parsed.description
    return typeof desc === "string" ? desc : ""
  } catch {
    return ""
  }
}
