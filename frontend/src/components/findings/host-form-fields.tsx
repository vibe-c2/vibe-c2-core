import { GripVerticalIcon, PlusIcon, WandSparklesIcon, XIcon } from "lucide-react"
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { makeClientId } from "@/components/findings/credential-key-drafts"
import {
  looksLikeCidr,
  looksLikeIp,
  splitAddresses,
  type HostFormValues,
  type InterfaceDraft,
  type LoginDraft,
  type RouteDraft,
} from "@/components/findings/host-drafts"

interface HostFormFieldsProps {
  values: HostFormValues
  onChange: (next: HostFormValues) => void
  idPrefix: string
  // Opens the "Magic" command-output importer. Surfaced next to both the
  // "Add interface" and "Add route" buttons — same action from either list.
  onImport: () => void
}

// Compact "paste ip a / ip ro output" trigger, placed beside each list's Add
// button. Both copies fire the same importer.
function MagicImportButton({ onImport }: { onImport: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onImport}
      className="text-muted-foreground"
    >
      <WandSparklesIcon className="size-3.5" />
      Magic paste
    </Button>
  )
}

// Shared form body for the host create/edit dialog. The two list editors are
// local to this file — they have exactly one consumer (this form), unlike the
// credential editors which are imported by multiple surfaces.
export function HostFormFields({
  values,
  onChange,
  idPrefix,
  onImport,
}: HostFormFieldsProps) {
  function patch(p: Partial<HostFormValues>) {
    onChange({ ...values, ...p })
  }

  return (
    <FieldGroup>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-hostname`}>Hostname</FieldLabel>
          <Input
            id={`${idPrefix}-hostname`}
            name="hostname"
            type="text"
            required
            value={values.hostname}
            onChange={(e) => patch({ hostname: e.target.value })}
            placeholder="dc01.corp.local"
            spellCheck={false}
            autoFocus
          />
        </Field>

        <Field>
          <FieldLabel htmlFor={`${idPrefix}-os`}>OS</FieldLabel>
          <Input
            id={`${idPrefix}-os`}
            name="os"
            type="text"
            value={values.os}
            onChange={(e) => patch({ os: e.target.value })}
            placeholder="Windows Server 2019"
          />
        </Field>
      </div>

      <Field>
        <FieldLabel>Network interfaces</FieldLabel>
        <HostInterfacesEditor
          interfaces={values.interfaces}
          onChange={(interfaces) => onChange({ ...values, interfaces })}
          onImport={onImport}
        />
      </Field>

      <Field>
        <FieldLabel>Routes</FieldLabel>
        <HostRoutesEditor
          routes={values.routes}
          onChange={(routes) => onChange({ ...values, routes })}
          onImport={onImport}
        />
      </Field>

      <Field>
        <FieldLabel>User footprints</FieldLabel>
        <HostLoginsEditor
          logins={values.logins}
          onChange={(logins) => onChange({ ...values, logins })}
          onImport={onImport}
        />
      </Field>
    </FieldGroup>
  )
}

// --- Interfaces editor ---
//
// Card rows like CredentialKeysEditor: name + MAC on the header line, then a
// textarea for the interface's CIDR addresses. Rows are drag-sortable by the
// grip handle — interface order is meaningful because the table renders a
// host's IP addresses in interface order, so operators can surface the
// primary interface first. Rows are keyed by their stable client `_id`, which
// doubles as the sortable id.

function HostInterfacesEditor({
  interfaces,
  onChange,
  onImport,
}: {
  interfaces: InterfaceDraft[]
  onChange: (next: InterfaceDraft[]) => void
  onImport: () => void
}) {
  // 8px activation distance so a plain click into an input field isn't
  // swallowed as the start of a drag (same guard the kanban board uses).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  function update(id: string, patch: Partial<Omit<InterfaceDraft, "_id">>) {
    onChange(interfaces.map((i) => (i._id === id ? { ...i, ...patch } : i)))
  }

  function add() {
    onChange([
      ...interfaces,
      { _id: makeClientId(), name: "", mac: "", addresses: "" },
    ])
  }

  function remove(id: string) {
    onChange(interfaces.filter((i) => i._id !== id))
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = interfaces.findIndex((i) => i._id === active.id)
    const to = interfaces.findIndex((i) => i._id === over.id)
    if (from === -1 || to === -1) return
    onChange(arrayMove(interfaces, from, to))
  }

  return (
    <div className="flex flex-col gap-2">
      {interfaces.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No interfaces yet. Add one to record where this host sits on the
          network — its addresses drive subnet grouping.
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={interfaces.map((i) => i._id)}
          strategy={verticalListSortingStrategy}
        >
          {interfaces.map((i) => (
            <SortableInterfaceRow
              key={i._id}
              iface={i}
              sortable={interfaces.length > 1}
              onUpdate={(patch) => update(i._id, patch)}
              onRemove={() => remove(i._id)}
            />
          ))}
        </SortableContext>
      </DndContext>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <PlusIcon className="size-3.5" />
          Add interface
        </Button>
        <MagicImportButton onImport={onImport} />
      </div>
    </div>
  )
}

function SortableInterfaceRow({
  iface,
  sortable,
  onUpdate,
  onRemove,
}: {
  iface: InterfaceDraft
  // A single interface can't be reordered, so the grip handle is hidden to
  // avoid implying an interaction that does nothing.
  sortable: boolean
  onUpdate: (patch: Partial<Omit<InterfaceDraft, "_id">>) => void
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: iface._id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const badAddresses = splitAddresses(iface.addresses).filter(
    (a) => !looksLikeCidr(a),
  )

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-md border bg-muted/30 p-3 space-y-2 ${
        isDragging ? "z-10 opacity-80 shadow-lg" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        {sortable && (
          <button
            type="button"
            className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
            aria-label="Reorder interface"
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon className="size-4" />
          </button>
        )}
        <Input
          value={iface.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="eth0"
          aria-label="Interface name"
          className="w-1/3"
          spellCheck={false}
        />
        <Input
          value={iface.mac}
          onChange={(e) => onUpdate({ mac: e.target.value })}
          placeholder="00:11:22:33:44:55"
          aria-label="MAC address"
          className="flex-1 font-mono"
          spellCheck={false}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label="Remove interface"
        >
          <XIcon className="size-4" />
        </Button>
      </div>
      <Textarea
        rows={2}
        value={iface.addresses}
        onChange={(e) => onUpdate({ addresses: e.target.value })}
        placeholder={"10.0.5.12/24\n192.168.1.5/24"}
        spellCheck={false}
        className="font-mono text-xs"
        aria-label="Interface addresses"
      />
      <p className="text-xs text-muted-foreground">
        One CIDR per line, e.g. 10.0.5.12/24
      </p>
      {badAddresses.length > 0 && (
        <p className="text-xs text-destructive">
          Not CIDR notation: {badAddresses.join(", ")} — expected
          address/prefix like 10.0.5.12/24.
        </p>
      )}
    </div>
  )
}

// --- Routes editor ---
//
// Compact single-line rows like CredentialPropertiesEditor: routes are three
// short strings, no card border needed.

function HostRoutesEditor({
  routes,
  onChange,
  onImport,
}: {
  routes: RouteDraft[]
  onChange: (next: RouteDraft[]) => void
  onImport: () => void
}) {
  function update(id: string, patch: Partial<Omit<RouteDraft, "_id">>) {
    onChange(routes.map((r) => (r._id === id ? { ...r, ...patch } : r)))
  }

  function add() {
    onChange([
      ...routes,
      {
        _id: makeClientId(),
        // Convenience: the first route a host gets is almost always the
        // default route, so prefill its destination. Later rows start blank.
        destination: routes.length === 0 ? "0.0.0.0/0" : "",
        gateway: "",
        interface: "",
      },
    ])
  }

  function remove(id: string) {
    onChange(routes.filter((r) => r._id !== id))
  }

  return (
    <div className="flex flex-col gap-2">
      {routes.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No routes yet. Add routing-table entries — a gateway owned by another
          host reveals a pivot. Destination 0.0.0.0/0 is the default route.
        </p>
      )}
      {routes.map((r) => {
        const destination = r.destination.trim()
        const gateway = r.gateway.trim()
        const badDestination =
          destination.length > 0 && !looksLikeCidr(destination)
        const badGateway = gateway.length > 0 && !looksLikeIp(gateway)
        return (
          <div key={r._id} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Input
                value={r.destination}
                onChange={(e) => update(r._id, { destination: e.target.value })}
                placeholder="0.0.0.0/0"
                aria-label="Route destination"
                className="flex-1 font-mono"
                spellCheck={false}
              />
              <Input
                value={r.gateway}
                onChange={(e) => update(r._id, { gateway: e.target.value })}
                placeholder="10.0.5.1"
                aria-label="Route gateway"
                className="flex-1 font-mono"
                spellCheck={false}
              />
              <Input
                value={r.interface}
                onChange={(e) => update(r._id, { interface: e.target.value })}
                placeholder="eth0"
                aria-label="Route interface"
                className="w-1/4"
                spellCheck={false}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(r._id)}
                aria-label="Remove route"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
            {(badDestination || badGateway) && (
              <p className="text-xs text-destructive">
                {badDestination &&
                  "Destination should be CIDR, e.g. 10.0.8.0/24. "}
                {badGateway && "Gateway should be a bare IP, e.g. 10.0.5.1."}
              </p>
            )}
          </div>
        )
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <PlusIcon className="size-3.5" />
          Add route
        </Button>
        <MagicImportButton onImport={onImport} />
      </div>
    </div>
  )
}

// --- Logins editor ---
//
// User footprints (parsed from `last`, or added by hand). Compact single-line
// rows like routes: user + source host + tty. `count` (sessions collapsed by
// the importer) and lastSeen ride along read-only — they're context, not
// inputs. `user` is the only required field: it's the identity the topology's
// users lens hangs everything off, and `from` is what turns a footprint into an
// observed access path (source host → user → this host).

function HostLoginsEditor({
  logins,
  onChange,
  onImport,
}: {
  logins: LoginDraft[]
  onChange: (next: LoginDraft[]) => void
  onImport: () => void
}) {
  function update(id: string, patch: Partial<Omit<LoginDraft, "_id">>) {
    onChange(logins.map((l) => (l._id === id ? { ...l, ...patch } : l)))
  }

  function add() {
    onChange([
      ...logins,
      { _id: makeClientId(), user: "", from: "", tty: "", lastSeen: "", count: 1 },
    ])
  }

  function remove(id: string) {
    onChange(logins.filter((l) => l._id !== id))
  }

  return (
    <div className="flex flex-col gap-2">
      {logins.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No user footprints yet. Add the accounts seen on this host — the same
          user across hosts is a credential-reuse lead, and a source host is an
          observed access path. Paste <code>last</code> output to fill these.
        </p>
      )}
      {logins.map((l) => (
        <div key={l._id} className="flex items-center gap-2">
          <Input
            value={l.user}
            onChange={(e) => update(l._id, { user: e.target.value })}
            placeholder="root"
            aria-label="Login user"
            className="flex-1 font-mono"
            spellCheck={false}
          />
          <Input
            value={l.from}
            onChange={(e) => update(l._id, { from: e.target.value })}
            placeholder="10.0.5.12 (source, optional)"
            aria-label="Login source host"
            className="flex-1 font-mono"
            spellCheck={false}
          />
          {/* tty is the narrowest column — least operator interest of the
              three, mirrors the routes editor's interface column. */}
          <Input
            value={l.tty}
            onChange={(e) => update(l._id, { tty: e.target.value })}
            placeholder="pts/0"
            aria-label="Login tty"
            className="w-1/5 font-mono"
            spellCheck={false}
          />
          {l.count > 1 && (
            <span
              className="shrink-0 text-xs text-muted-foreground"
              title={`${l.count} sessions${l.lastSeen ? ` · last ${l.lastSeen}` : ""}`}
            >
              ×{l.count}
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => remove(l._id)}
            aria-label="Remove login"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <PlusIcon className="size-3.5" />
          Add footprint
        </Button>
        <MagicImportButton onImport={onImport} />
      </div>
    </div>
  )
}
