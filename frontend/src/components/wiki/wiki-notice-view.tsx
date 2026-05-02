import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type ReactNodeViewProps,
} from "@tiptap/react"
import {
  CircleAlertIcon,
  CircleCheckIcon,
  InfoIcon,
  StarIcon,
  type LucideIcon,
} from "lucide-react"
import {
  DEFAULT_NOTICE_VARIANT,
  NOTICE_VARIANTS,
  type NoticeVariant,
} from "@/components/wiki/wiki-notice-node"

interface VariantSpec {
  value: NoticeVariant
  label: string
  icon: LucideIcon
}

const VARIANT_SPECS: Record<NoticeVariant, VariantSpec> = {
  info: { value: "info", label: "Info", icon: InfoIcon },
  success: { value: "success", label: "Success", icon: CircleCheckIcon },
  warning: { value: "warning", label: "Warning", icon: CircleAlertIcon },
  tip: { value: "tip", label: "Tip", icon: StarIcon },
}

function resolveVariant(raw: unknown): NoticeVariant {
  return typeof raw === "string" && (NOTICE_VARIANTS as string[]).includes(raw)
    ? (raw as NoticeVariant)
    : DEFAULT_NOTICE_VARIANT
}

export function WikiNoticeView({
  node,
  editor,
  getPos,
  updateAttributes,
}: ReactNodeViewProps) {
  const variant = resolveVariant(node.attrs.variant)
  const isEditable = editor.isEditable
  const Icon = VARIANT_SPECS[variant].icon

  // Show the variant picker only while the cursor is inside this notice.
  // Mirrors the wiki-code-block pattern so the toolbar doesn't permanently
  // crowd reading mode.
  const cursorInside =
    useEditorState({
      editor,
      selector: ({ editor: e }) => {
        if (!e.isEditable) return false
        const pos = typeof getPos === "function" ? getPos() : undefined
        if (pos == null) return false
        const { from, to } = e.state.selection
        return from >= pos && to <= pos + node.nodeSize
      },
    }) ?? false

  return (
    <NodeViewWrapper
      className="wiki-notice wiki-node--toolbar-top"
      data-variant={variant}
      data-cursor-inside={cursorInside ? "true" : "false"}
    >
      <span className="wiki-notice__icon" contentEditable={false} aria-hidden="true">
        <Icon size={18} fill="currentColor" strokeWidth={2.4} />
      </span>
      <NodeViewContent className="wiki-notice__body" />
      {isEditable && (
        <div
          className="wiki-notice__toolbar"
          contentEditable={false}
          // Without this the click would shift selection out of the node and
          // the toolbar's pointer-events would flip off mid-click.
          onMouseDown={(e) => e.preventDefault()}
        >
          {NOTICE_VARIANTS.map((value) => {
            const spec = VARIANT_SPECS[value]
            const VariantIcon = spec.icon
            return (
              <button
                key={value}
                type="button"
                className="wiki-notice__variant"
                data-variant={value}
                aria-label={spec.label}
                aria-pressed={variant === value}
                onClick={() => updateAttributes({ variant: value })}
              >
                <VariantIcon size={14} />
              </button>
            )
          })}
        </div>
      )}
    </NodeViewWrapper>
  )
}
