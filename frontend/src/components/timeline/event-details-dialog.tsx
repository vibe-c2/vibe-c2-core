import { useState } from "react"
import { Link } from "react-router"
import { Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { TimelineEventFieldsFragment } from "@/graphql/gql/graphql"
import { useMe } from "@/graphql/hooks/users"
import { useDeleteCustomTimelineEvent } from "@/graphql/hooks/timeline"
import { useTaskStore } from "@/stores/tasks"
import { dayjs } from "./dayjs-setup"
import { eventIcon, eventAccent } from "./event-icons"
import {
  parseCustomEventDescription,
  renderEventSummary,
} from "./event-summary"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  event: TimelineEventFieldsFragment | null
  // True iff the viewer has operator+ on the operation. The dialog still
  // checks authorship before showing edit/delete; this gate is the cheap
  // first cut so viewers don't see disabled actions.
  canEditCustomEvent?: boolean
  // Called when the user clicks "Edit" on a custom event. The parent
  // owns the create/edit dialog, so we lift the request rather than
  // mounting another Dialog inside this one.
  onEditCustomEvent?: (event: TimelineEventFieldsFragment) => void
}

// EventDetailsDialog renders the full detail card for a clicked event dot.
// Falls back to closed state when no event is selected so the dialog can be
// mounted at the page root.
export function EventDetailsDialog({
  open,
  onOpenChange,
  event,
  canEditCustomEvent = false,
  onEditCustomEvent,
}: Props) {
  const { data: meData } = useMe()
  const deleteMut = useDeleteCustomTimelineEvent()
  const openEditTask = useTaskStore((s) => s.openEditDialog)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  if (!event) return null

  const Icon = eventIcon(event)
  const accent = eventAccent(event)
  const occurred = dayjs(event.occurredAt)
  const description = parseCustomEventDescription(event.metadata)

  const isCustomEvent = event.subjectKind === "custom_event"
  const isAuthor =
    !!event.actor?.id &&
    !!meData?.me.id &&
    event.actor.id === meData.me.id
  const isAppAdmin = meData?.me.roles?.includes("admin") ?? false
  const showEditControls =
    isCustomEvent && canEditCustomEvent && (isAuthor || isAppAdmin)

  async function handleDelete() {
    if (!event) return
    setDeleteError(null)
    try {
      await deleteMut.mutateAsync(event.id)
      setConfirmDelete(false)
      onOpenChange(false)
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setConfirmDelete(false)
          setDeleteError(null)
        }
        onOpenChange(next)
      }}
    >
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

        {isCustomEvent && description && (
          <p className="whitespace-pre-wrap rounded-md bg-muted/40 px-3 py-2 text-sm text-foreground/90">
            {description}
          </p>
        )}

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Actor</dt>
          <dd>{event.actor?.username ?? "System"}</dd>

          <dt className="text-muted-foreground">Topic</dt>
          <dd className="font-mono">{event.topic}</dd>

          {!isCustomEvent && (
            <>
              <dt className="text-muted-foreground">Subject</dt>
              <dd>
                {event.subjectKind === "task" ? (
                  // Tasks open via the globally-mounted EditTaskDialog so
                  // the operator stays on the timeline page instead of
                  // navigating to /tasks. Mirrors the wiki / credential
                  // backlink pattern.
                  <button
                    type="button"
                    onClick={() => {
                      openEditTask({
                        id: event.subjectId,
                        name: event.subjectName || "(unnamed)",
                      })
                      onOpenChange(false)
                    }}
                    className="cursor-pointer text-left underline underline-offset-2 hover:text-foreground"
                  >
                    {event.subjectName || "(unnamed)"}
                  </button>
                ) : subjectLink(event) ? (
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
            </>
          )}
        </dl>

        {!isCustomEvent && event.metadata && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Metadata
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs">
              {prettyJson(event.metadata)}
            </pre>
          </details>
        )}

        {showEditControls && (
          <DialogFooter className="mt-2 flex-row !justify-start gap-2 sm:!justify-end">
            {deleteError && (
              <div className="mr-auto rounded-md bg-destructive/15 px-2 py-1 text-xs text-destructive">
                {deleteError}
              </div>
            )}
            {confirmDelete ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleteMut.isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteMut.isPending}
                >
                  {deleteMut.isPending ? "Deleting..." : "Confirm delete"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onEditCustomEvent?.(event)}
                >
                  <Pencil className="size-3.5" />
                  Edit
                </Button>
              </>
            )}
          </DialogFooter>
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
