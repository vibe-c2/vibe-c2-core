import { useState } from "react"
import { create } from "zustand"
import type { Editor } from "@tiptap/core"
import { HashIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { HashPickerList } from "@/components/findings/hash-picker-list"

/**
 * Singleton picker driven by a tiny Zustand store. The slash command opens it
 * with the active editor + operation; on pick it inserts a `wikiHashReference`
 * node at the captured insertion position. Sibling of the credential picker —
 * list-only because hashes are bulk-imported on the Findings tab rather than
 * hand-created one at a time from the editor.
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

const useWikiHashPickerStore = create<PickerState>((set) => ({
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
 *  with the dialog because both share the singleton store. */
// eslint-disable-next-line react-refresh/only-export-components
export function openHashPicker(args: PickerArgs) {
  useWikiHashPickerStore.getState().openPicker(args)
}

export function WikiHashPickerDialog() {
  const open = useWikiHashPickerStore((s) => s.open)
  const closePicker = useWikiHashPickerStore((s) => s.closePicker)
  const [search, setSearch] = useState("")

  // Reset the search field when the picker reopens.
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) setSearch("")
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closePicker()
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HashIcon className="size-4" />
            Insert hash reference
          </DialogTitle>
          <DialogDescription>
            Pick a hash from this operation to embed in the document.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <PickerBody search={search} setSearch={setSearch} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

interface PickerBodyProps {
  search: string
  setSearch: (s: string) => void
}

function PickerBody({ search, setSearch }: PickerBodyProps) {
  const operationId = useWikiHashPickerStore((s) => s.operationId)
  const closePicker = useWikiHashPickerStore((s) => s.closePicker)

  function insertHash(hashId: string) {
    const { editor, insertPos } = useWikiHashPickerStore.getState()
    if (!editor) {
      closePicker()
      return
    }
    const pos = insertPos ?? editor.state.selection.from
    editor
      .chain()
      .focus()
      .insertContentAt(pos, {
        type: "wikiHashReference",
        attrs: { hashId },
      })
      .run()
    closePicker()
  }

  return (
    <HashPickerList
      operationId={operationId}
      search={search}
      onSearchChange={setSearch}
      onPick={insertHash}
    />
  )
}
