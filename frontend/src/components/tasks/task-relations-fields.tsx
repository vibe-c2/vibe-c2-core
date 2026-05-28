import { useEffect, useMemo, useState, type ReactNode } from "react"
import { FileTextIcon, KeyRoundIcon, UserIcon } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { type SuggestionOption } from "@/components/ui/suggestion-input"
import { SuggestionPopover } from "@/components/ui/suggestion-popover"
import { useOperation } from "@/graphql/hooks/operations"
import { useInfiniteCredentials } from "@/graphql/hooks/credentials"
import { WikiDocumentChipById } from "@/components/wiki/wiki-document-chip-view"
import { WikiCredentialChipById } from "@/components/wiki/wiki-credential-chip-view"
import { WikiUserChipView } from "@/components/wiki/wiki-user-chip-view"
import { DocumentIcon } from "@/components/wiki/document-icon"
import { WikiAncestorBreadcrumb } from "@/components/wiki/wiki-ancestor-breadcrumb"
import { useWikiDocumentTreeAncestors } from "@/components/wiki/use-wiki-document-tree-ancestors"

import type {
  RelationItem,
  TaskRelationsValues,
} from "@/components/tasks/task-relations"

interface TaskRelationsFieldsProps {
  operationId: string
  values: TaskRelationsValues
  onChange: (values: TaskRelationsValues) => void
}

export function TaskRelationsFields({
  operationId,
  values,
  onChange,
}: TaskRelationsFieldsProps) {
  function patch(partial: Partial<TaskRelationsValues>) {
    onChange({ ...values, ...partial })
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
  )
}

// --- Assignee picker ---------------------------------------------------------
//
// Source of truth: the operation's member list, fetched once via
// useOperation. We filter client-side because the member set is typically
// small (a dozen at most) and the operation detail query is already cached
// from the parent operation page. Avoids a second autocomplete round-trip.

function initials(name: string): string {
  const t = name.trim()
  if (!t) return "?"
  const parts = t.split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

function AssigneePicker({
  operationId,
  selected,
  onChange,
}: {
  operationId: string
  selected: RelationItem[]
  onChange: (items: RelationItem[]) => void
}) {
  const { data } = useOperation(operationId)
  const [search, setSearch] = useState("")

  const members = useMemo(
    () => data?.operation.members ?? [],
    [data?.operation.members],
  )
  const selectedIds = useMemo(
    () => new Set(selected.map((s) => s.id)),
    [selected],
  )

  const options: SuggestionOption[] = useMemo(() => {
    const q = search.trim().toLowerCase()
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
            <AvatarFallback>{initials(m.user.username)}</AvatarFallback>
          </Avatar>
        ),
      }))
  }, [members, selectedIds, search])

  function addOption(opt: SuggestionOption) {
    onChange([...selected, { id: opt.value, label: opt.label }])
    setSearch("")
  }

  function removeId(id: string) {
    onChange(selected.filter((s) => s.id !== id))
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
  )
}

// --- Wiki reference picker ---------------------------------------------------
//
// Source of truth is the operation's wiki document tree (same query the
// sidebar tree and the editor's /doc slash-command picker use, so the cache
// is usually warm). We reuse `useWikiDocumentTreeAncestors` to precompute
// each doc's parent chain and surface it under the row title — the same
// disambiguation affordance the slash-command picker and search palette
// already use for same-titled docs in different folders.
//
// Selected items render via WikiDocumentChipById — the same chip used inside
// the wiki editor — so a doc linked from a task looks identical to a doc
// linked from prose. The chip is wrapped non-interactive (no nested Link
// inside the remove-button container) and accompanied by an X remove button.

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

const WIKI_PICKER_MAX_VISIBLE = 20

function WikiReferencePicker({
  operationId,
  selected,
  onChange,
}: {
  operationId: string
  selected: RelationItem[]
  onChange: (items: RelationItem[]) => void
}) {
  const [search, setSearch] = useState("")
  const debounced = useDebounced(search.trim().toLowerCase(), 120)

  const { docs, ancestorsByDocId, isLoading } =
    useWikiDocumentTreeAncestors(operationId)

  const selectedIds = useMemo(
    () => new Set(selected.map((s) => s.id)),
    [selected],
  )

  const options: SuggestionOption[] = useMemo(() => {
    // Filter by case-insensitive title substring, mirroring the slash
    // command picker. Recency-first sort (lastUpdatedAt then updatedAt)
    // so the top of the list matches what the operator just touched.
    const matches = docs.filter((d) => {
      if (selectedIds.has(d.id)) return false
      if (!debounced) return true
      return (d.title ?? "").toLowerCase().includes(debounced)
    })
    matches.sort((a, b) => {
      const ta = a.lastUpdatedAt ?? a.updatedAt ?? ""
      const tb = b.lastUpdatedAt ?? b.updatedAt ?? ""
      if (ta !== tb) return ta < tb ? 1 : -1
      return (a.title ?? "").localeCompare(b.title ?? "", undefined, {
        sensitivity: "base",
      })
    })
    return matches.slice(0, WIKI_PICKER_MAX_VISIBLE).map((d) => {
      const ancestors = ancestorsByDocId.get(d.id) ?? []
      return {
        value: d.id,
        label: (d.title ?? "") || "Untitled",
        icon: (
          <DocumentIcon
            emoji={d.emoji}
            icon={d.icon}
            color={d.color}
            className="shrink-0"
          />
        ),
        subtitle:
          ancestors.length > 0 ? (
            <WikiAncestorBreadcrumb
              ancestors={ancestors}
              className="truncate"
            />
          ) : undefined,
      }
    })
  }, [docs, ancestorsByDocId, selectedIds, debounced])

  function addOption(opt: SuggestionOption) {
    onChange([...selected, { id: opt.value, label: opt.label }])
    setSearch("")
  }

  function removeId(id: string) {
    onChange(selected.filter((s) => s.id !== id))
  }

  return (
    <PickerShell
      label="Wiki references"
      icon={<FileTextIcon className="size-3.5" />}
      count={selected.length}
      picker={
        <SuggestionPopover
          search={search}
          onSearchChange={setSearch}
          onSelect={addOption}
          options={options}
          loading={isLoading}
          placeholder="Link a wiki document…"
          emptyMessage="No matching documents"
          triggerAriaLabel="Link a wiki document"
          // Wiki doc titles often stack a breadcrumb subtitle underneath, so
          // bump width for legibility — the assignee / credential pickers
          // keep the compact default.
          contentClassName="w-96"
        />
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
  )
}

// --- Credential reference picker --------------------------------------------

function CredentialReferencePicker({
  operationId,
  selected,
  onChange,
}: {
  operationId: string
  selected: RelationItem[]
  onChange: (items: RelationItem[]) => void
}) {
  const [search, setSearch] = useState("")
  const debounced = useDebounced(search.trim(), 180)

  const { data, isLoading } = useInfiniteCredentials({
    operationId,
    search: debounced || null,
    validOnly: null,
    first: 20,
  })

  const selectedIds = useMemo(
    () => new Set(selected.map((s) => s.id)),
    [selected],
  )

  const options: SuggestionOption[] = useMemo(() => {
    const creds =
      data?.pages.flatMap((p) => p.credentials.edges.map((e) => e.node)) ?? []
    return creds
      .filter((c) => !selectedIds.has(c.id))
      .slice(0, 10)
      .map((c) => ({
        value: c.id,
        label: c.name,
        hint: c.type.toLowerCase(),
        icon: <KeyRoundIcon className="size-4 text-muted-foreground" />,
      }))
  }, [data, selectedIds])

  function addOption(opt: SuggestionOption) {
    onChange([
      ...selected,
      { id: opt.value, label: opt.label, hint: opt.hint },
    ])
    setSearch("")
  }

  function removeId(id: string) {
    onChange(selected.filter((s) => s.id !== id))
  }

  return (
    <PickerShell
      label="Credential references"
      icon={<KeyRoundIcon className="size-3.5" />}
      count={selected.length}
      picker={
        <SuggestionPopover
          search={search}
          onSearchChange={setSearch}
          onSelect={addOption}
          options={options}
          loading={isLoading}
          placeholder="Link a credential…"
          emptyMessage="No matching credentials"
          triggerAriaLabel="Link a credential"
        />
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
  )
}

// --- Shared chip + label shell ----------------------------------------------

interface PickerShellProps {
  label: string
  icon: ReactNode
  count: number
  /** Compact picker trigger (e.g. SuggestionPopover) rendered inline with chips. */
  picker: ReactNode
  children: ReactNode
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
  )
}

