import {
  NodeViewWrapper,
  useEditorState,
  type ReactNodeViewProps,
} from "@tiptap/react"
import { NodeSelection } from "@tiptap/pm/state"
import { MinusIcon, MoreHorizontalIcon } from "lucide-react"

const VARIANTS: Array<{
  value: HrVariant
  label: string
  icon: React.ComponentType<{ size?: number }>
}> = [
  { value: "line", label: "Line", icon: MinusIcon },
  { value: "dashed", label: "Dashed", icon: MoreHorizontalIcon },
]

export type HrVariant = "line" | "dashed"

export function WikiHorizontalRuleNode({
  node,
  editor,
  getPos,
  updateAttributes,
}: ReactNodeViewProps) {
  const variant: HrVariant = node.attrs.variant ?? "line"
  const isEditable = editor.isEditable

  // Visible selection requires a NodeSelection that lands on this exact
  // position. ProseMirror auto-attaches `ProseMirror-selectednode` to the
  // outer wrapper for us, but the toolbar needs an explicit signal to
  // toggle pointer-events without flickering during cursor moves.
  const isSelected =
    useEditorState({
      editor,
      selector: ({ editor: e }) => {
        if (!e.isEditable) return false
        const pos = typeof getPos === "function" ? getPos() : undefined
        if (pos == null) return false
        const sel = e.state.selection
        return sel instanceof NodeSelection && sel.from === pos
      },
    }) ?? false

  return (
    <NodeViewWrapper
      className="wiki-hr"
      data-variant={variant}
      data-selected={isSelected ? "true" : "false"}
    >
      <hr className="wiki-hr__line" />
      {isEditable && (
        <div
          className="wiki-hr__toolbar"
          contentEditable={false}
          // Prevent ProseMirror from collapsing the NodeSelection when the
          // user clicks toolbar chrome — same trick the code block uses.
          onMouseDown={(e) => e.preventDefault()}
        >
          {VARIANTS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              className="wiki-hr__variant"
              aria-label={label}
              aria-pressed={variant === value}
              onClick={() => updateAttributes({ variant: value })}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
      )}
    </NodeViewWrapper>
  )
}
