import type { TimelineEventFieldsFragment } from "@/graphql/gql/graphql"

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
    case "wiki.document.created":
      return `${actor} created wiki document "${name}"`
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
    case "wiki.document.created":
      return `${count} wiki documents created`
    case "timeline.custom.created":
      return `${count} custom events`
    default: {
      const verb = humaniseTopic(topic)
      return `${count} × ${verb}`
    }
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
