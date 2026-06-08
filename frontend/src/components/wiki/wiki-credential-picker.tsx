import { create } from "zustand"
import type { Editor } from "@tiptap/core"
import { CredentialPickerDialog } from "@/components/findings/credential-picker-dialog"

/**
 * Singleton picker driven by a tiny Zustand store. The slash command opens it
 * with the active editor + operation, the dialog renders inside the React tree
 * (so the GraphQL client / React Query providers are in scope), and on pick it
 * inserts a `wikiCredentialReference` node at the captured insertion position.
 *
 * The list/create UI lives in the shared {@link CredentialPickerDialog} — this
 * file only owns the editor-insertion concern: where the reference lands and
 * how it's encoded. The editor is kept off React's render-driven state — the
 * insertion reads it via `getState()` so we don't churn re-renders for a
 * transient reference.
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

export function WikiCredentialPickerDialog() {
  const open = useWikiCredentialPickerStore((s) => s.open)
  const operationId = useWikiCredentialPickerStore((s) => s.operationId)
  const closePicker = useWikiCredentialPickerStore((s) => s.closePicker)

  // Shared insertion path — both the list pick and the create-then-insert flow
  // funnel through here so the editor side stays in one place. Reads the editor
  // imperatively so it never participates in render.
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

  return (
    <CredentialPickerDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closePicker()
      }}
      operationId={operationId}
      title="Insert credential reference"
      description="Pick a credential from this operation to embed in the document."
      createDescription="Add a credential to this operation and insert a reference to it."
      createSubmitLabel="Create & insert"
      createIdPrefix="wiki-cred-create"
      onPick={(c) => insertCredential(c.id)}
    />
  )
}
