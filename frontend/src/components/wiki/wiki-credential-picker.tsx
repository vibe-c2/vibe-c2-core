import { useState } from "react"
import { create } from "zustand"
import type { Editor } from "@tiptap/core"
import { KeyIcon, PlusIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { CredentialCreateForm } from "@/components/findings/credential-create-form"
import { CredentialPickerList } from "@/components/findings/credential-picker-list"
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

  // Reset both pieces of transient UI when the picker reopens.
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
      <CredentialCreateForm
        operationId={operationId}
        initialName={search.trim()}
        idPrefix="wiki-cred-create"
        submitLabel="Create & insert"
        onCreated={insertCredential}
        onBack={() => setMode("list")}
      />
    )
  }

  return (
    <CredentialPickerList
      operationId={operationId}
      search={search}
      onSearchChange={setSearch}
      onPick={(c) => insertCredential(c.id)}
      onStartCreate={() => setMode("create")}
    />
  )
}
