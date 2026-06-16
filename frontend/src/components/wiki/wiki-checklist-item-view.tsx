import { useEffect, useRef, useState } from "react"
import {
  type Editor,
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
} from "@tiptap/react"
import {
  CheckIcon,
  CopyIcon,
  FlagIcon,
  MinusCircleIcon,
  TerminalIcon,
  Trash2Icon,
} from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  consumeChecklistPromptFocus,
  type ChecklistItemState,
} from "@/components/wiki/wiki-checklist-item-node"

// Coverage state of the item for the status dot — mirrors the sidecar's
// deriveItemState so the editor and the projection agree at a glance.
function deriveStatus(
  state: ChecklistItemState,
  hasAnswer: boolean,
): "unanswered" | "answered" | "not_applicable" | "flagged" {
  if (state === "not_applicable") return "not_applicable"
  if (state === "flagged") return "flagged"
  return hasAnswer ? "answered" : "unanswered"
}

export function WikiChecklistItemView({
  node,
  editor,
  updateAttributes,
  deleteNode,
}: ReactNodeViewProps) {
  const isEditable = editor.isEditable
  const [confirmDelete, setConfirmDelete] = useState(false)
  const promptRef = useRef<HTMLTextAreaElement | null>(null)

  // A freshly-inserted item steers the caret into the prompt; see the hook.
  useFocusPromptOnInsert(node.attrs.key as string | null, editor, promptRef)

  const state = (node.attrs.state as ChecklistItemState) || ""
  const required = node.attrs.required !== false
  const prompt = (node.attrs.prompt as string) || ""
  const commandHint = (node.attrs.commandHint as string) || ""
  // Visibility is driven solely by the toggle flag, so showing/hiding a hint is
  // a purely visual change: a hidden hint keeps its text in the node attrs and
  // reappears unchanged when re-enabled.
  const hintEnabled = node.attrs.commandHintEnabled === true

  // node.textContent covers the answer region. childCount > 1 (or any text)
  // also catches non-text answers like a reference chip or code block. Enough
  // to drive the status dot; the authoritative count is the sidecar's.
  const hasAnswer =
    node.textContent.trim().length > 0 ||
    node.content.childCount > 1 ||
    (node.firstChild?.content.childCount ?? 0) > 0
  const status = deriveStatus(state, hasAnswer)

  const cycleState = (target: ChecklistItemState) => {
    updateAttributes({ state: state === target ? "" : target })
  }

  const toggleHint = () => {
    // Flip visibility only; never touch commandHint, so a typed command
    // survives a hide/show round-trip instead of being discarded.
    updateAttributes({ commandHintEnabled: !hintEnabled })
  }

  // The item is an isolating block, so backspace can't merge it away — the
  // trash control is the only way out. Delete an empty item outright; confirm
  // first if it carries a prompt or any answer so a misclick can't silently
  // drop captured recon.
  const hasContent = prompt.trim().length > 0 || hasAnswer
  const requestDelete = () => {
    if (hasContent) setConfirmDelete(true)
    else deleteNode()
  }

  return (
    <NodeViewWrapper
      className="wiki-checklist-item"
      data-status={status}
      data-required={required ? "true" : "false"}
    >
      <div className="wiki-checklist-item__head" contentEditable={false}>
        <div className="wiki-checklist-item__meta">
          {isEditable ? (
            // Auto-growing textarea (not an input) so a long prompt wraps onto
            // multiple lines instead of scrolling behind the controls.
            <AutoGrowTextarea
              className="wiki-checklist-item__prompt-input"
              value={prompt}
              placeholder="Question prompt…"
              textareaRef={promptRef}
              onChange={(prompt) => updateAttributes({ prompt })}
            />
          ) : (
            <p className="wiki-checklist-item__prompt">
              {prompt || <span className="wiki-checklist-item__muted">Untitled item</span>}
            </p>
          )}
        </div>

        <div className="wiki-checklist-item__controls">
          {isEditable && (
            <label className="wiki-checklist-item__required">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => updateAttributes({ required: e.target.checked })}
              />
              Required
            </label>
          )}
          {isEditable && (
            <ControlButton
              active={hintEnabled}
              title={hintEnabled ? "Remove command hint" : "Add a command hint"}
              onClick={toggleHint}
            >
              <TerminalIcon size={14} />
            </ControlButton>
          )}
          <ControlButton
            active={state === "not_applicable"}
            title="Mark not applicable"
            onClick={() => cycleState("not_applicable")}
          >
            <MinusCircleIcon size={14} />
          </ControlButton>
          <ControlButton
            active={state === "flagged"}
            title="Flag for attention"
            onClick={() => cycleState("flagged")}
          >
            <FlagIcon size={14} />
          </ControlButton>
          {isEditable && (
            <ControlButton danger title="Delete item" onClick={requestDelete}>
              <Trash2Icon size={14} />
            </ControlButton>
          )}
        </div>
      </div>

      {hintEnabled &&
        (isEditable ? (
          <div className="wiki-checklist-item__hint" contentEditable={false}>
            <HintCopyButton value={commandHint} />
            <span className="wiki-checklist-item__hint-prompt" aria-hidden="true">
              $
            </span>
            <AutoGrowTextarea
              className="wiki-checklist-item__hint-input"
              value={commandHint}
              placeholder="command to run, e.g. ip route"
              autoComplete="off"
              onChange={(commandHint) => updateAttributes({ commandHint })}
            />
          </div>
        ) : (
          commandHint && (
            <pre className="wiki-checklist-item__hint" contentEditable={false}>
              <HintCopyButton value={commandHint} />
              <span
                className="wiki-checklist-item__hint-prompt"
                aria-hidden="true"
              >
                $
              </span>
              <code>{commandHint}</code>
            </pre>
          )
        ))}

      {/* Answer region — freeform markdown. Use the slash menu (/code,
          /credential, /hash, …) to insert whatever the answer needs. */}
      <NodeViewContent className="wiki-checklist-item__answer" />

      {isEditable && (
        <ConfirmDeleteDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          prompt={prompt}
          // deleteNode() unmounts this NodeView (and the dialog with it), so
          // there's no separate close step — closing state on an unmounting
          // component would be a no-op.
          onConfirm={deleteNode}
        />
      )}
    </NodeViewWrapper>
  )
}

// On a fresh insert, steer the caret into the prompt textarea (a plain field
// outside ProseMirror) instead of the answer region where the editor selection
// lands by default. The insert command flagged this item's key; we claim it
// once on mount.
//
// The work is deferred to a macrotask because the slash-command chain calls
// TipTap's focus() inside a requestAnimationFrame that fires after this effect
// and would otherwise steal focus back; the timeout(0) runs after that rAF
// batch. We blur the editor first so ProseMirror releases its selection, then
// re-measure the textarea — the mount-time ref callback ran while the NodeView
// was still detached (scrollHeight 0) and left the field collapsed.
//
// The timer is deliberately NOT cleared on cleanup: React StrictMode does a
// mount→unmount→remount in dev, and clearing would cancel it before it fires.
// On a real unmount the ref is null, so the deferred focus is a harmless no-op.
function useFocusPromptOnInsert(
  itemKey: string | null,
  editor: Editor,
  promptRef: React.RefObject<HTMLTextAreaElement | null>,
) {
  useEffect(() => {
    if (!itemKey || !consumeChecklistPromptFocus(itemKey)) return
    window.setTimeout(() => {
      editor.commands.blur()
      promptRef.current?.focus()
      autoGrow(promptRef.current)
    }, 0)
  }, [itemKey, editor, promptRef])
}

// Confirms deleting a checklist item that holds work (a prompt or an answer).
// The delete removes the whole block — prompt, command hint, and the answer
// region — so we surface that rather than dropping it on a single click. Undo
// still recovers it, but the warning prevents the silent loss in the first
// place.
function ConfirmDeleteDialog({
  open,
  onOpenChange,
  prompt,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  prompt: string
  onConfirm: () => void
}) {
  // Clamp an over-long prompt so the dialog stays readable; overflow-wrap on
  // the label still breaks an unbroken string within the clamped length.
  const trimmed = prompt.trim()
  const label = trimmed.length > 120 ? `${trimmed.slice(0, 120)}…` : trimmed
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete checklist item?</DialogTitle>
          <DialogDescription>
            {label ? (
              <>
                This removes{" "}
                <strong className="[overflow-wrap:anywhere]">{label}</strong>{" "}
                and its answer from the document.
              </>
            ) : (
              <>This removes the item and its answer from the document.</>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Size a textarea to its content so multiline text grows the field instead of
// scrolling. Used as a callback ref (sizes on mount + each render, including
// remote edits) and from onChange. Null when React detaches the node.
function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = "auto"
  // scrollHeight reads 0 while the NodeView is still detached from the document
  // (ReactNodeViewRenderer mounts the React tree before ProseMirror attaches
  // it). Don't write a 0px height in that case — leaving "auto" keeps the
  // natural single-row height until a later, attached measure resizes it.
  if (el.scrollHeight > 0) el.style.height = `${el.scrollHeight}px`
}

// A textarea that grows to fit its content — used for both the prompt and the
// command hint so a long value wraps onto multiple lines rather than scrolling.
// The callback ref resizes on mount and every render (so remote edits resize
// too); onChange resizes while typing and reports the new value.
function AutoGrowTextarea({
  value,
  onChange,
  textareaRef,
  ...rest
}: {
  value: string
  onChange: (value: string) => void
  // Optional handle to the underlying element so a caller can focus it (e.g.
  // steering the caret to the prompt on a fresh checklist insert).
  textareaRef?: React.MutableRefObject<HTMLTextAreaElement | null>
} & Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "ref" | "rows"
>) {
  return (
    <textarea
      ref={(el) => {
        autoGrow(el)
        if (textareaRef) textareaRef.current = el
      }}
      rows={1}
      value={value}
      spellCheck={false}
      onChange={(e) => {
        onChange(e.target.value)
        autoGrow(e.currentTarget)
      }}
      {...rest}
    />
  )
}

// A control-bar button (command-hint / not-applicable / flag / delete).
// Mouse-down preventDefault keeps the editor selection so the click doesn't blur
// the doc; the icon glyph has pointer-events:none (in CSS) so the button stays
// the event target and ProseMirror doesn't eat the click. `danger` tints the
// hover red for the destructive delete action; `active` is omitted for it since
// delete has no toggled state.
function ControlButton({
  active = false,
  danger = false,
  title,
  onClick,
  children,
}: {
  active?: boolean
  danger?: boolean
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={cn(
        "wiki-checklist-item__state-btn",
        danger && "wiki-checklist-item__state-btn--danger",
      )}
      data-active={active}
      aria-pressed={active}
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

// Copy-to-clipboard control at the start of the command-hint line. Renders
// nothing when there's no command to copy. Briefly swaps to a check on success.
function HintCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null

  const copy = () => {
    if (!navigator.clipboard) return
    navigator.clipboard
      .writeText(value)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1200)
      })
      .catch(() => {
        // Clipboard blocked (insecure context / permissions) — no-op.
      })
  }

  return (
    <button
      type="button"
      className="wiki-checklist-item__hint-copy"
      title={copied ? "Copied" : "Copy command"}
      aria-label="Copy command"
      onMouseDown={(e) => e.preventDefault()}
      onClick={copy}
    >
      {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
    </button>
  )
}
