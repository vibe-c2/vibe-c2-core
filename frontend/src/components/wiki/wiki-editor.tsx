import { useEffect, useRef } from "react"
import type { Text as YText } from "yjs"
import { useHocuspocus } from "@/hooks/use-hocuspocus"
import { ConnectionBanner } from "@/components/wiki/connection-banner"

interface WikiEditorProps {
  documentId: string
  isEditor: boolean
}

// Temporary plain-textarea editor bound to a Y.Text named "content".
// The previous Tiptap-based rich editor will be rebuilt later; for now we
// keep the collaborative plumbing (Hocuspocus + Y.js) but swap the UI for
// a simple textarea so it's predictable and easy to reason about.
//
// Note: we intentionally use the Y.Text key "content" (not "default"),
// because the Tiptap Collaboration extension previously used "default" as
// an XmlFragment. Mixing types on the same name would throw inside Y.js.
// Existing documents authored with the old editor will therefore appear
// empty here until the rich editor returns and reads from "default".
export function WikiEditor({ documentId, isEditor }: WikiEditorProps) {
  const { ydoc, connectionStatus, isSynced, isReady } = useHocuspocus(documentId)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const applyingRemoteRef = useRef(false)

  useEffect(() => {
    const ytext: YText = ydoc.getText("content")
    const el = textareaRef.current
    if (!el) return

    // Seed the textarea with the current Y.Text contents.
    el.value = ytext.toString()

    // Remote updates → reflect into the textarea while preserving the
    // user's caret position as best we can (naive adjustment: clamp to
    // the new length).
    const observer = () => {
      if (!textareaRef.current) return
      const next = ytext.toString()
      if (textareaRef.current.value === next) return
      const { selectionStart, selectionEnd } = textareaRef.current
      applyingRemoteRef.current = true
      textareaRef.current.value = next
      applyingRemoteRef.current = false
      const clamp = (n: number) => Math.min(n, next.length)
      textareaRef.current.setSelectionRange(clamp(selectionStart), clamp(selectionEnd))
    }
    ytext.observe(observer)

    return () => {
      ytext.unobserve(observer)
    }
  }, [ydoc])

  // Local edits → push into Y.Text. Naive whole-replace is fine for the
  // placeholder editor; the forthcoming rich editor will do proper delta
  // diffing so concurrent character-level merges work.
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (applyingRemoteRef.current) return
    const ytext = ydoc.getText("content")
    const next = e.target.value
    ydoc.transact(() => {
      ytext.delete(0, ytext.length)
      ytext.insert(0, next)
    })
  }

  return (
    <>
      <ConnectionBanner connectionStatus={connectionStatus} isSynced={isSynced} isReady={isReady} />
      <textarea
        ref={textareaRef}
        readOnly={!isEditor}
        onChange={handleChange}
        placeholder={isEditor ? "Start writing..." : ""}
        className="flex-1 w-full resize-none bg-transparent px-4 py-2 font-mono text-sm outline-none"
      />
    </>
  )
}
