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

// renderSubjectKindSummary describes a stack of N events that share a subject
// kind as a single human phrase — used for the tooltip on grouped event dots
// and the group dialog title. The dot stack groups by subject kind (not
// topic), so a "hash" group can mix added/cracked/imported events under one
// circle; the per-event rows inside the dialog still carry the specific verb
// via renderEventSummary, so the group-level phrase stays kind-level.
export function renderSubjectKindSummary(
  subjectKind: string,
  count: number,
): string {
  const noun = subjectKindNoun(subjectKind, count)
  return `${count} ${noun}`
}

// subjectKindNoun returns the pluralised human noun for a subject kind.
function subjectKindNoun(subjectKind: string, count: number): string {
  const plural = count === 1 ? "" : "s"
  switch (subjectKind) {
    case "credential":
      return `credential${plural}`
    case "hash":
      return `hash${count === 1 ? "" : "es"}`
    case "wiki_document":
      return `wiki document${plural}`
    case "custom_event":
      return `custom event${plural}`
    case "task":
      return `task${plural}`
    default:
      return `event${plural}`
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

// CustomEventIcon is the visual identity an operator picked for a custom
// timeline annotation: an emoji glyph or a Lucide icon name, plus an optional
// OKLCH color. Mirrors the wiki DocumentIconValue shape. All three default to
// "" so a legacy annotation (authored before icons existed) and an explicitly
// glyph-less one are indistinguishable — both render the default pin and
// group together on the axis.
export interface CustomEventIcon {
  emoji: string
  icon: string
  color: string
}

const EMPTY_CUSTOM_EVENT_ICON: CustomEventIcon = {
  emoji: "",
  icon: "",
  color: "",
}

// parseCustomEventIcon extracts the emoji/icon/color identity from a custom
// event's JSON metadata bag. Mirrors the empty-string normalisation the
// server's bucket aggregation applies when it builds the chip-grouping key,
// so a value parsed here compares equal to a TimelineTopicCount identity.
export function parseCustomEventIcon(
  metadata: string | null | undefined,
): CustomEventIcon {
  if (!metadata) return EMPTY_CUSTOM_EVENT_ICON
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>
    return {
      emoji: typeof parsed.emoji === "string" ? parsed.emoji : "",
      icon: typeof parsed.icon === "string" ? parsed.icon : "",
      color: typeof parsed.color === "string" ? parsed.color : "",
    }
  } catch {
    return EMPTY_CUSTOM_EVENT_ICON
  }
}
