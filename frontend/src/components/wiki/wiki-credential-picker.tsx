import { type FormEvent, useEffect, useMemo, useState } from "react"
import { create } from "zustand"
import type { Editor } from "@tiptap/core"
import { ArrowLeftIcon, KeyIcon, PlusIcon, SearchIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  useCreateCredential,
  useCredentialTags,
  useInfiniteCredentials,
} from "@/graphql/hooks/credentials"
import {
  CredentialFormFields,
  type CredentialFormValues,
} from "@/components/findings/credential-form-fields"
import { keyDraftsToInputs } from "@/components/findings/credential-key-drafts"
import { credentialTypeLabel } from "@/components/findings/credential-type-utils"
import { cn } from "@/lib/utils"

/**
 * Singleton picker driven by a tiny Zustand store. The slash command opens it
 * with the active editor + operation, the dialog renders inside the React tree
 * (so the GraphQL client / React Query providers are in scope), and on pick it
 * inserts a `wikiCredentialReference` node at the captured insertion position.
 *
 * Two modes:
 *   - "list":   search + scroll an existing credential and pick one
 *   - "create": fill out a credential form, on success the new credential's
 *               id is inserted at the same captured position
 *
 * The editor is kept off React's render-driven state — actions read it via
 * `getState()` so we don't churn re-renders for a transient reference.
 */
interface PickerArgs {
  editor: Editor
  operationId: string
  insertPos: number
}

interface PickerState {
  open: boolean
  editor: Editor | null
  operationId: string
  insertPos: number | null
  openPicker: (args: PickerArgs) => void
  closePicker: () => void
}

const useWikiCredentialPickerStore = create<PickerState>((set) => ({
  open: false,
  editor: null,
  operationId: "",
  insertPos: null,
  openPicker: ({ editor, operationId, insertPos }) =>
    set({ open: true, editor, operationId, insertPos }),
  closePicker: () =>
    set({ open: false, editor: null, operationId: "", insertPos: null }),
}))

/** Imperative entry point — called from the slash-command item. Co-located
 *  with the dialog because both share the singleton store; splitting would
 *  require a third file just to host that. */
// eslint-disable-next-line react-refresh/only-export-components
export function openCredentialPicker(args: PickerArgs) {
  useWikiCredentialPickerStore.getState().openPicker(args)
}

type Mode = "list" | "create"

export function WikiCredentialPickerDialog() {
  const open = useWikiCredentialPickerStore((s) => s.open)
  const closePicker = useWikiCredentialPickerStore((s) => s.closePicker)
  const [mode, setMode] = useState<Mode>("list")
  // Hoisted so the create view can pre-fill its `name` from whatever the
  // operator was searching for when they hit "Create new credential".
  const [search, setSearch] = useState("")

  // Reset both pieces of transient UI when the picker reopens — without this
  // the previous mode/search would leak between invocations of the slash
  // command, which is surprising (operator types `/findings:cred`, expects a
  // fresh picker, sees a half-filled create form from last time).
  // Prev-value pattern (react.dev/.../useState#storing-information-from-
  // previous-renders) instead of useEffect+setState, which the React Hooks
  // lint flags as cascading.
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setMode("list")
      setSearch("")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closePicker()
      }}
    >
      <DialogContent
        className={cn(
          // List mode is dense — the search input + a 10-row scroll list fits
          // comfortably at xl. Create mode swaps in the same form used by the
          // findings page; that form's two-column rows assume ~3xl to avoid
          // collapsing to a single column on a desktop.
          mode === "create" ? "sm:max-w-3xl" : "sm:max-w-xl",
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "create" ? (
              <PlusIcon className="size-4" />
            ) : (
              <KeyIcon className="size-4" />
            )}
            {mode === "create"
              ? "Create new credential"
              : "Insert credential reference"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Add a credential to this operation and insert a reference to it."
              : "Pick a credential from this operation to embed in the document."}
          </DialogDescription>
        </DialogHeader>
        {/* Mounting the body only while open keeps the credentials query from
            running in the background and resets transient state (search,
            active row, draft form values) cleanly between opens. */}
        {open ? (
          <PickerBody
            mode={mode}
            setMode={setMode}
            search={search}
            setSearch={setSearch}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

interface PickerBodyProps {
  mode: Mode
  setMode: (m: Mode) => void
  search: string
  setSearch: (s: string) => void
}

function PickerBody({ mode, setMode, search, setSearch }: PickerBodyProps) {
  const operationId = useWikiCredentialPickerStore((s) => s.operationId)
  const closePicker = useWikiCredentialPickerStore((s) => s.closePicker)

  // Shared insertion path — both the list pick and the create-then-insert
  // flow funnel through here so the editor side stays in one place.
  function insertCredential(credentialId: string) {
    const { editor, insertPos } = useWikiCredentialPickerStore.getState()
    if (!editor) {
      closePicker()
      return
    }
    const pos = insertPos ?? editor.state.selection.from
    editor
      .chain()
      .focus()
      .insertContentAt(pos, {
        type: "wikiCredentialReference",
        attrs: { credentialId },
      })
      .run()
    closePicker()
  }

  if (mode === "create") {
    return (
      <CreateView
        operationId={operationId}
        initialName={search.trim()}
        onCreated={insertCredential}
        onBack={() => setMode("list")}
      />
    )
  }

  return (
    <ListView
      operationId={operationId}
      search={search}
      setSearch={setSearch}
      onPick={insertCredential}
      onStartCreate={() => setMode("create")}
    />
  )
}

interface ListViewProps {
  operationId: string
  search: string
  setSearch: (s: string) => void
  onPick: (credentialId: string) => void
  onStartCreate: () => void
}

function ListView({
  operationId,
  search,
  setSearch,
  onPick,
  onStartCreate,
}: ListViewProps) {
  const [debounced, setDebounced] = useState(search.trim())
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 180)
    return () => clearTimeout(t)
  }, [search])

  // Reset cursor when results change. Prev-value pattern (react.dev/.../useState
  // #storing-information-from-previous-renders) so the React Hooks lint doesn't
  // flag a setState-in-effect.
  const [lastDebounced, setLastDebounced] = useState(debounced)
  if (lastDebounced !== debounced) {
    setLastDebounced(debounced)
    setActiveIndex(0)
  }

  const {
    data,
    isLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteCredentials({
    operationId,
    search: debounced || null,
    validOnly: null,
    first: 20,
  })

  const credentials = useMemo(
    () =>
      data?.pages.flatMap((p) => p.credentials.edges.map((e) => e.node)) ?? [],
    [data],
  )

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) =>
        Math.min(i + 1, Math.max(credentials.length - 1, 0)),
      )
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const cred = credentials[activeIndex]
      if (cred) onPick(cred.id)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search credentials by name…"
          className="pl-8"
        />
      </div>
      <div
        className="max-h-72 overflow-y-auto rounded-md border bg-card"
        onScroll={(e) => {
          const el = e.currentTarget
          if (
            hasNextPage &&
            !isFetchingNextPage &&
            el.scrollTop + el.clientHeight >= el.scrollHeight - 32
          ) {
            void fetchNextPage()
          }
        }}
      >
        {isLoading && credentials.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">Loading…</div>
        ) : credentials.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">
            {debounced
              ? "No credentials match this search."
              : "No credentials in this operation yet."}
          </div>
        ) : (
          credentials.map((c, i) => {
            const isActive = i === activeIndex
            return (
              <button
                key={c.id}
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(c.id)}
                aria-selected={isActive}
                className={cn(
                  "flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm outline-hidden last:border-b-0",
                  isActive
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/60",
                )}
              >
                <KeyIcon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {c.name}
                </span>
                <Badge variant="outline" className="shrink-0">
                  {credentialTypeLabel(c.type)}
                </Badge>
                {c.username ? (
                  <span className="hidden max-w-[12ch] shrink-0 truncate text-xs text-muted-foreground sm:inline">
                    {c.username}
                  </span>
                ) : null}
              </button>
            )
          })
        )}
        {isFetchingNextPage && (
          <div className="p-2 text-center text-xs text-muted-foreground">
            Loading more…
          </div>
        )}
      </div>
      {/* Footer affordance — clearer than overloading the list with a magic
          last row. Keyboard users can Tab from the search input here. The
          search query (if any) seeds the new credential's name. */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-muted-foreground">
          Can&apos;t find it? Add it to this operation.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onStartCreate}
        >
          <PlusIcon className="size-3.5" />
          Create new credential
        </Button>
      </div>
    </div>
  )
}

const emptyFormValues: CredentialFormValues = {
  name: "",
  type: "PASSWORD",
  username: "",
  password: "",
  keys: [],
  isValid: false,
  tags: [],
}

interface CreateViewProps {
  operationId: string
  initialName: string
  onCreated: (credentialId: string) => void
  onBack: () => void
}

function CreateView({
  operationId,
  initialName,
  onCreated,
  onBack,
}: CreateViewProps) {
  const createCredential = useCreateCredential()
  const { data: tagsData, isLoading: tagsLoading } =
    useCredentialTags(operationId)
  const [values, setValues] = useState<CredentialFormValues>(() => ({
    ...emptyFormValues,
    name: initialName,
  }))
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    try {
      const res = await createCredential.mutateAsync({
        operationId,
        input: {
          name: values.name,
          type: values.type,
          username: values.username || null,
          password: values.password || null,
          keys: keyDraftsToInputs(values.keys),
          isValid: values.isValid,
          tags: values.tags,
        },
      })
      onCreated(res.createCredential.id)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create credential",
      )
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      autoComplete="off"
      className="flex flex-col gap-4"
    >
      {error && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <CredentialFormFields
        idPrefix="wiki-cred-create"
        values={values}
        onChange={setValues}
        tagSuggestions={tagsData?.credentialTags ?? []}
        tagSuggestionsLoading={tagsLoading}
      />
      <div className="flex flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            disabled={createCredential.isPending}
          >
            <ArrowLeftIcon className="size-3.5" />
            Back
          </Button>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Switch
              checked={values.isValid}
              onCheckedChange={(checked) =>
                setValues((v) => ({ ...v, isValid: checked }))
              }
            />
            <span>Mark as valid</span>
          </label>
        </div>
        <Button
          type="submit"
          disabled={createCredential.isPending || !values.name.trim()}
        >
          {createCredential.isPending ? "Saving…" : "Create & insert"}
        </Button>
      </div>
    </form>
  )
}
