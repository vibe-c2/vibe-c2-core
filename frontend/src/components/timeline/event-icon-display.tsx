import { createElement } from "react"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { cn } from "@/lib/utils"
import type { TimelineEventFieldsFragment } from "@/graphql/gql/graphql"
import {
  eventAccent,
  eventIcon,
  subjectKindAccent,
  subjectKindIcon,
} from "./event-icons"
import { parseCustomEventIcon } from "./event-summary"

// custom_event is the subject kind for user-authored annotations. The default
// (un-customised) glyph + accent for that kind live in event-icons.ts —
// CustomGlyph reads them from there rather than re-stating the pin/emerald so
// the two paths can never drift.
const CUSTOM_EVENT_KIND = "custom_event"

// TimelineGroupIdentity is the tuple the axis groups events into one chip by.
// For system kinds emoji/icon/color are always "", so the identity collapses
// to subjectKind; custom events carry their chosen glyph so each (emoji, icon,
// color) renders as its own chip. Shared by the chip, the canvas, the page,
// and the group dialog so the click target and the rendered glyph stay in
// lockstep.
export interface TimelineGroupIdentity {
  subjectKind: string
  emoji: string
  icon: string
  color: string
}

// CustomGlyph renders the icon a custom event was authored with. An explicit
// emoji or Lucide icon routes through the shared <DocumentIcon> (same renderer
// the wiki uses), so emoji glyphs, curated icons, and the full lazy Lucide set
// all work with one code path. A glyph-less annotation (legacy rows, or one
// the operator never customised) falls back to the kind's default pin, tinted
// with the chosen color when present and the kind's default accent otherwise.
function CustomGlyph({
  emoji,
  icon,
  color,
  className,
}: {
  emoji: string
  icon: string
  color: string
  className?: string
}) {
  if (emoji || icon) {
    return (
      <DocumentIcon
        emoji={emoji}
        icon={icon}
        // Empty string → undefined so DocumentIcon inherits currentColor
        // instead of painting an empty CSS value.
        color={color || undefined}
        size={16}
        className={cn("size-4", className)}
      />
    )
  }
  // No authored glyph: fall back to the kind-level pin. An explicit color wins
  // via inline style (and suppresses the default accent class); otherwise the
  // kind's accent applies. createElement (not <Icon/>) keeps the React
  // Compiler from treating the lookup as a render-created component.
  return createElement(subjectKindIcon(CUSTOM_EVENT_KIND), {
    className: cn(
      "size-4",
      color ? undefined : subjectKindAccent(CUSTOM_EVENT_KIND),
      className,
    ),
    style: color ? { color } : undefined,
  })
}

// EventGlyph renders the icon for a single timeline event. Custom events use
// their authored glyph; every other kind defers to eventIcon/eventAccent so
// task closures keep their outcome-coloured glyph and all other kinds keep
// their kind-level identity. Used by the per-event row and the details dialog.
export function EventGlyph({
  event,
  className,
}: {
  event: TimelineEventFieldsFragment
  className?: string
}) {
  if (event.subjectKind === CUSTOM_EVENT_KIND) {
    const { emoji, icon, color } = parseCustomEventIcon(event.metadata)
    return (
      <CustomGlyph
        emoji={emoji}
        icon={icon}
        color={color}
        className={className}
      />
    )
  }
  const Icon = eventIcon(event)
  return createElement(Icon, {
    className: cn("size-4", eventAccent(event), className),
  })
}

// GroupGlyph renders the icon for a grouped chip, keyed off the group identity
// rather than a single event (the axis builds chips from aggregated counts, so
// no event row is available). Custom groups render their shared glyph; other
// kinds render the kind-level icon + accent, matching the dot stack's prior
// look.
export function GroupGlyph({
  subjectKind,
  emoji,
  icon,
  color,
  className,
}: TimelineGroupIdentity & { className?: string }) {
  if (subjectKind === CUSTOM_EVENT_KIND) {
    return (
      <CustomGlyph
        emoji={emoji}
        icon={icon}
        color={color}
        className={className}
      />
    )
  }
  return createElement(subjectKindIcon(subjectKind), {
    className: cn("size-4", subjectKindAccent(subjectKind), className),
  })
}
