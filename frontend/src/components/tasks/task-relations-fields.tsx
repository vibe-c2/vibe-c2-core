import { useMemo, useState, type ReactNode } from "react";
import { FileTextIcon, KeyRoundIcon, PlusIcon, UserIcon } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { avatarLabel } from "@/lib/avatar-label";
import { type SuggestionOption } from "@/components/ui/suggestion-input";
import { SuggestionPopover } from "@/components/ui/suggestion-popover";
import { useOperation } from "@/graphql/hooks/operations";
import { CredentialPickerDialog } from "@/components/findings/credential-picker-dialog";
import { credentialTypeLabel } from "@/components/findings/credential-type-utils";
import type { CredentialFieldsFragment } from "@/graphql/gql/graphql";
import { WikiDocumentChipById } from "@/components/wiki/wiki-document-chip-view";
import { WikiCredentialChipById } from "@/components/wiki/wiki-credential-chip-view";
import { WikiUserChipView } from "@/components/wiki/wiki-user-chip-view";
import { openWikiDocumentPicker } from "@/components/wiki/wiki-command-palette";

import type {
  RelationItem,
  TaskRelationsValues,
} from "@/components/tasks/task-relations";

// Compact dashed "+" trigger shared by the pickers that open their own surface
// (wiki document dialog, credential dialog) rather than an inline SuggestionPopover.
const PICKER_TRIGGER_CLASS =
  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface TaskRelationsFieldsProps {
  operationId: string;
  values: TaskRelationsValues;
  onChange: (values: TaskRelationsValues) => void;
}

export function TaskRelationsFields({
  operationId,
  values,
  onChange,
}: TaskRelationsFieldsProps) {
  function patch(partial: Partial<TaskRelationsValues>) {
    onChange({ ...values, ...partial });
  }

  return (
    <div className="grid gap-4">
      <AssigneePicker
        operationId={operationId}
        selected={values.assignees}
        onChange={(assignees) => patch({ assignees })}
      />
      <WikiReferencePicker
        operationId={operationId}
        selected={values.wikiReferences}
        onChange={(wikiReferences) => patch({ wikiReferences })}
      />
      <CredentialReferencePicker
        operationId={operationId}
        selected={values.credentialReferences}
        onChange={(credentialReferences) => patch({ credentialReferences })}
      />
    </div>
  );
}

// --- Assignee picker ---------------------------------------------------------
//
// Source of truth: the operation's member list, fetched once via
// useOperation. We filter client-side because the member set is typically
// small (a dozen at most) and the operation detail query is already cached
// from the parent operation page. Avoids a second autocomplete round-trip.

function AssigneePicker({
  operationId,
  selected,
  onChange,
}: {
  operationId: string;
  selected: RelationItem[];
  onChange: (items: RelationItem[]) => void;
}) {
  const { data } = useOperation(operationId);
  const [search, setSearch] = useState("");

  const members = useMemo(
    () => data?.operation.members ?? [],
    [data?.operation.members],
  );
  const selectedIds = useMemo(
    () => new Set(selected.map((s) => s.id)),
    [selected],
  );

  const options: SuggestionOption[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members
      .filter((m) => !selectedIds.has(m.user.id))
      .filter(
        (m) => q.length === 0 || m.user.username.toLowerCase().includes(q),
      )
      .slice(0, 10)
      .map((m) => ({
        value: m.user.id,
        label: m.user.username,
        hint: m.role.toLowerCase(),
        icon: (
          <Avatar size="sm">
            <AvatarFallback>{avatarLabel(m.user.username)}</AvatarFallback>
          </Avatar>
        ),
      }));
  }, [members, selectedIds, search]);

  function addOption(opt: SuggestionOption) {
    onChange([...selected, { id: opt.value, label: opt.label }]);
    setSearch("");
  }

  function removeId(id: string) {
    onChange(selected.filter((s) => s.id !== id));
  }

  return (
    <PickerShell
      label="Assignees"
      icon={<UserIcon className="size-3.5" />}
      count={selected.length}
      picker={
        <SuggestionPopover
          search={search}
          onSearchChange={setSearch}
          onSelect={addOption}
          options={options}
          placeholder="Add a responsible operator…"
          emptyMessage="No matching operation members"
          triggerAriaLabel="Add assignee"
        />
      }
    >
      {selected.map((item) => (
        <WikiUserChipView
          key={item.id}
          user={{ id: item.id, username: item.label }}
          onRemove={() => removeId(item.id)}
          removeAriaLabel={`Remove assignee ${item.label}`}
        />
      ))}
    </PickerShell>
  );
}

// --- Wiki reference picker ---------------------------------------------------
//
// Delegates to the global wiki-document-picker dialog (same one the editor's
// /doc slash command opens). That dialog runs server-paginated, virtualized,
// and renders an ancestor breadcrumb under each row — so this picker scales
// with operation size and shows the same UX wiki authors already know.
//
// Selected items render via WikiDocumentChipById — same chip the wiki editor
// uses — so a doc linked from a task looks identical to a doc linked from
// prose.

function WikiReferencePicker({
  operationId,
  selected,
  onChange,
}: {
  operationId: string;
  selected: RelationItem[];
  onChange: (items: RelationItem[]) => void;
}) {
  function removeId(id: string) {
    onChange(selected.filter((s) => s.id !== id));
  }

  function openPicker() {
    openWikiDocumentPicker({
      operationId,
      excludeIds: selected.map((s) => s.id),
      title: "Link a wiki document",
      description: "Pick a document in this operation to attach to this task.",
      onPick: (doc) => {
        onChange([...selected, { id: doc.id, label: doc.title || "Untitled" }]);
      },
    });
  }

  return (
    <PickerShell
      label="Wiki references"
      icon={<FileTextIcon className="size-3.5" />}
      count={selected.length}
      picker={
        <button
          type="button"
          onClick={openPicker}
          aria-label="Link a wiki document"
          className={PICKER_TRIGGER_CLASS}
        >
          <PlusIcon className="size-3.5" />
        </button>
      }
    >
      {selected.map((item) => (
        // `interactive` left at its default true so the chip click navigates
        // to /wiki/:id (in a clickable-span, since the X remove button must
        // live inside the chip and can't be nested in a Link). The task edit
        // dialog stays mounted in AppLayout, so the operator returns to it
        // by navigating back — same pattern as wiki refs on credential card.
        <WikiDocumentChipById
          key={item.id}
          id={item.id}
          onRemove={() => removeId(item.id)}
          removeAriaLabel={`Remove wiki reference ${item.label}`}
        />
      ))}
    </PickerShell>
  );
}

// --- Credential reference picker --------------------------------------------

// Picks from the operation's credential pool via the shared CredentialPickerDialog
// — the same modal the wiki "Insert credential reference" and findings "Mark hash
// as cracked" pickers use, so a credential row looks, searches, and "create new"
// works identically everywhere. Multi-select: each pick adds a chip, the picked
// id is excluded from the list, and the dialog stays open so several can be
// linked in a row (and a freshly created credential is linked too).
function CredentialReferencePicker({
  operationId,
  selected,
  onChange,
}: {
  operationId: string;
  selected: RelationItem[];
  onChange: (items: RelationItem[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const selectedIds = useMemo(
    () => new Set(selected.map((s) => s.id)),
    [selected],
  );

  function addCredential(c: CredentialFieldsFragment) {
    if (selectedIds.has(c.id)) return;
    onChange([
      ...selected,
      { id: c.id, label: c.name, hint: credentialTypeLabel(c.type) },
    ]);
  }

  function removeId(id: string) {
    onChange(selected.filter((s) => s.id !== id));
  }

  return (
    <PickerShell
      label="Credential references"
      icon={<KeyRoundIcon className="size-3.5" />}
      count={selected.length}
      picker={
        <>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Link a credential"
            className={PICKER_TRIGGER_CLASS}
          >
            <PlusIcon className="size-3.5" />
          </button>
          <CredentialPickerDialog
            open={open}
            onOpenChange={setOpen}
            operationId={operationId}
            title="Link a credential"
            description="Pick a credential from this operation to attach to this task."
            createDescription="Add a credential to this operation and attach it to this task."
            createSubmitLabel="Create & link"
            createIdPrefix="task-cred-create"
            onPick={addCredential}
            excludeIds={selectedIds}
          />
        </>
      }
    >
      {selected.map((item) => (
        <WikiCredentialChipById
          key={item.id}
          id={item.id}
          withContextMenu
          onRemove={() => removeId(item.id)}
          removeAriaLabel={`Remove credential reference ${item.label}`}
        />
      ))}
    </PickerShell>
  );
}

// --- Shared chip + label shell ----------------------------------------------

interface PickerShellProps {
  label: string;
  icon: ReactNode;
  count: number;
  /** Compact picker trigger (e.g. SuggestionPopover) rendered inline with chips. */
  picker: ReactNode;
  children: ReactNode;
}

function PickerShell({
  label,
  icon,
  count,
  picker,
  children,
}: PickerShellProps) {
  return (
    <div className="grid gap-1.5">
      <Label className="flex items-center gap-1.5">
        {icon}
        {label}
        {count > 0 && (
          <span className="text-xs font-normal text-muted-foreground">
            {count}
          </span>
        )}
      </Label>
      {/* Chips + trailing "+" trigger share a single wrap row. The trigger
          stays anchored to the end of the visible chip flow so the operator
          always reaches it from the last item — no separate input row,
          which lightens the dialog when many references stack up. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {children}
        {picker}
      </div>
    </div>
  );
}
