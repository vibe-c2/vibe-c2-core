import { Link } from "react-router"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { TimelineEventFieldsFragment } from "@/graphql/gql/graphql"
import { dayjs } from "./dayjs-setup"
import { subjectKindIcon, subjectKindAccent } from "./event-icons"
import { renderEventSummary } from "./event-summary"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: TimelineEventFieldsFragment | null
}

// EventDetailsDialog renders the full detail card for a clicked event dot.
// Falls back to closed state when no event is selected so the dialog can be
// mounted at the page root.
export function EventDetailsDialog({ open, onOpenChange, event }: Props) {
  if (!event) return null

  const Icon = subjectKindIcon(event.subjectKind)
  const accent = subjectKindAccent(event.subjectKind)
  const occurred = dayjs(event.occurredAt)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`size-4 ${accent}`} />
            {renderEventSummary(event)}
          </DialogTitle>
          <DialogDescription>
            {occurred.format("MMM D, YYYY · HH:mm")} ·{" "}
            <span className="text-foreground/70">{occurred.fromNow()}</span>
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Actor</dt>
          <dd>{event.actor?.username ?? "System"}</dd>

          <dt className="text-muted-foreground">Topic</dt>
          <dd className="font-mono">{event.topic}</dd>

          <dt className="text-muted-foreground">Subject</dt>
          <dd>
            {subjectLink(event) ? (
              <Link
                to={subjectLink(event)!}
                className="underline underline-offset-2 hover:text-foreground"
                onClick={() => onOpenChange(false)}
              >
                {event.subjectName || "(unnamed)"}
              </Link>
            ) : (
              <span>{event.subjectName || "(unnamed)"}</span>
            )}
          </dd>
        </dl>

        {event.metadata && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Metadata
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs">
              {prettyJson(event.metadata)}
            </pre>
          </details>
        )}
      </DialogContent>
    </Dialog>
  )
}

// subjectLink returns the in-app route for the event's subject, or null when
// no link is known. Linking is best-effort — deleted subjects produce a 404
// inside the destination page, not here.
function subjectLink(event: TimelineEventFieldsFragment): string | null {
  switch (event.subjectKind) {
    case "wiki_document":
      return `/wiki/${event.subjectId}`
    case "credential":
      // Findings filters credentials by id via query param; the page falls
      // back to listing if the id is gone.
      return `/findings?credential=${event.subjectId}`
    default:
      return null
  }
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}
