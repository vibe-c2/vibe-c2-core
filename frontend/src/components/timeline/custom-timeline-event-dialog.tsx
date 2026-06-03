import { type FormEvent, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  DocumentIconPicker,
  type DocumentIconValue,
} from "@/components/wiki/document-icon-picker"
import type { TimelineEventFieldsFragment } from "@/graphql/gql/graphql"
import {
  useCreateCustomTimelineEvent,
  useUpdateCustomTimelineEvent,
} from "@/graphql/hooks/timeline"
import { dayjs } from "./dayjs-setup"
import {
  parseCustomEventDescription,
  parseCustomEventIcon,
} from "./event-summary"

// Default glyph for a new annotation: a Lucide pin in the inherited color.
// Pin mirrors the long-standing custom-event identity (subjectKindIcon maps
// custom_event → PinIcon) so the picker's trigger shows a pin rather than the
// generic page fallback DocumentIcon renders for an empty value.
const DEFAULT_CUSTOM_ICON: DocumentIconValue = {
  emoji: "",
  icon: "Pin",
  color: "",
}

// initialIconValue resolves the picker's starting value. A row the operator
// already gave a glyph keeps it; a glyph-less row (legacy, or never
// customised) falls back to the default pin so the picker trigger reads as a
// pin and a re-save lands an explicit icon.
function initialIconValue(
  event: TimelineEventFieldsFragment | null,
): DocumentIconValue {
  if (!event) return DEFAULT_CUSTOM_ICON
  const parsed = parseCustomEventIcon(event.metadata)
  if (parsed.emoji || parsed.icon) return parsed
  return { ...DEFAULT_CUSTOM_ICON, color: parsed.color }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  operationId: string
  timezone: string
  // When provided the dialog runs in edit mode against this event;
  // otherwise it creates a new annotation. Passing the underlying event row
  // (not just an id) lets the dialog prefill its fields without an extra
  // round-trip — the parent already has the fragment in hand.
  event?: TimelineEventFieldsFragment | null
}

// CustomTimelineEventDialog handles both create and edit flows for
// user-authored timeline annotations. The form lives in an inner component
// keyed on the event id (or a sentinel for create), which lets us use
// uncontrolled inputs with defaultValue — same pattern as the rest of the
// app's edit dialogs (see operations/edit-operation-dialog.tsx).
export function CustomTimelineEventDialog({
  open,
  onOpenChange,
  operationId,
  timezone,
  event,
}: Props) {
  const formKey = event?.id ?? "new"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {event ? "Edit timeline event" : "Add timeline event"}
          </DialogTitle>
          <DialogDescription>
            {event
              ? "Update this annotation. The change is visible to everyone on this operation."
              : "Add a custom annotation to the operation timeline."}
          </DialogDescription>
        </DialogHeader>
        <CustomEventForm
          key={formKey}
          operationId={operationId}
          timezone={timezone}
          event={event ?? null}
          onSaved={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

interface FormProps {
  operationId: string
  timezone: string
  event: TimelineEventFieldsFragment | null
  onSaved: () => void
}

function CustomEventForm({ operationId, timezone, event, onSaved }: FormProps) {
  const editing = !!event
  const createMut = useCreateCustomTimelineEvent()
  const updateMut = useUpdateCustomTimelineEvent()
  const [error, setError] = useState<string | null>(null)
  // Icon + color are picker-controlled (the form's other fields stay
  // uncontrolled). Seeded from the event when editing — see initialIconValue.
  const [iconValue, setIconValue] = useState<DocumentIconValue>(() =>
    initialIconValue(event),
  )

  const initialOccurred = event
    ? dayjs(event.occurredAt).tz(timezone)
    : dayjs().tz(timezone)
  const initialDescription = event
    ? parseCustomEventDescription(event.metadata)
    : ""

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const form = new FormData(e.currentTarget)
    const name = ((form.get("name") as string) ?? "").trim()
    const description = (form.get("description") as string) ?? ""
    const occurredAtRaw = (form.get("occurredAt") as string) ?? ""

    if (!name) {
      setError("Name is required")
      return
    }

    const occurredAt = dayjs.tz(occurredAtRaw, timezone)
    if (!occurredAt.isValid()) {
      setError("Invalid date / time")
      return
    }

    try {
      if (editing && event) {
        await updateMut.mutateAsync({
          id: event.id,
          input: {
            name,
            description, // empty string is meaningful: "clear it"
            occurredAt: occurredAt.toISOString(),
            // Always send all three so swaps clear the unused side (e.g.
            // picking an emoji clears a previously-set icon). The picker
            // guarantees emoji/icon are mutually exclusive.
            emoji: iconValue.emoji,
            icon: iconValue.icon,
            color: iconValue.color,
          },
        })
      } else {
        await createMut.mutateAsync({
          operationId,
          input: {
            name,
            description: description.trim() || null,
            occurredAt: occurredAt.toISOString(),
            emoji: iconValue.emoji || null,
            icon: iconValue.icon || null,
            color: iconValue.color || null,
          },
        })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save event")
    }
  }

  const pending = createMut.isPending || updateMut.isPending

  return (
    <form onSubmit={handleSubmit} autoComplete="off">
      <FieldGroup>
        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <Field>
          <FieldLabel htmlFor="custom-event-name">Name</FieldLabel>
          {/* Icon picker sits inline with the title, matching the wiki
              create/edit pattern — the glyph and color it yields are what the
              axis groups this event's chip by. */}
          <div className="flex items-center gap-2">
            <DocumentIconPicker
              value={iconValue}
              onSelect={setIconValue}
              allowAdaptive={false}
              defaultIconName={DEFAULT_CUSTOM_ICON.icon}
            />
            <Input
              id="custom-event-name"
              name="name"
              type="text"
              defaultValue={event?.subjectName ?? ""}
              placeholder="e.g. Phishing campaign launched"
              required
              autoFocus
              maxLength={200}
              className="flex-1"
            />
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="custom-event-description">
            Description
          </FieldLabel>
          <Textarea
            id="custom-event-description"
            name="description"
            defaultValue={initialDescription}
            placeholder="Optional context for this event"
            rows={4}
            className="font-sans"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="custom-event-occurred">
            Date &amp; time
          </FieldLabel>
          <Input
            id="custom-event-occurred"
            name="occurredAt"
            type="datetime-local"
            defaultValue={formatForLocalInput(initialOccurred)}
            required
          />
        </Field>
      </FieldGroup>
      <DialogFooter className="mt-4">
        <Button type="submit" disabled={pending}>
          {pending
            ? editing
              ? "Saving..."
              : "Adding..."
            : editing
              ? "Save changes"
              : "Add event"}
        </Button>
      </DialogFooter>
    </form>
  )
}

// formatForLocalInput renders a dayjs instance in the YYYY-MM-DDTHH:mm
// shape that <input type="datetime-local"> expects. The instant is already
// in the viewer's timezone so we just format without further conversion.
function formatForLocalInput(d: ReturnType<typeof dayjs>): string {
  return d.format("YYYY-MM-DDTHH:mm")
}
