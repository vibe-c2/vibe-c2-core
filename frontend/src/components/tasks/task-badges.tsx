import { Badge } from "@/components/ui/badge"
import type { TaskStage, TaskStatus } from "@/graphql/gql/graphql"
import { cn } from "@/lib/utils"
import {
  PROFIT_SWATCH_COLORS,
  RISK_SWATCH_COLORS,
  STAGE_CLASSNAME,
  STAGE_LABEL,
  STATUS_CLASSNAME,
  STATUS_LABEL,
  UNRATED_TONE,
  type ScoreKind,
} from "@/components/tasks/task-badge-tokens"

// Label helpers, colour ramps, and the score-tone calculator live in
// task-badge-tokens.ts so this module can export components only.

export function TaskStageBadge({ stage }: { stage: TaskStage }) {
  return (
    <Badge variant="outline" className={cn("font-medium", STAGE_CLASSNAME[stage])}>
      {STAGE_LABEL[stage]}
    </Badge>
  )
}

// TaskStatusBadge is only meaningful for tasks that have actually had a
// terminal outcome recorded — surfacing "Pending" on every backlog card
// would be noise. The `showWhenUndefined` escape hatch keeps the badge
// hidden by default and lets the details dialog opt in.
export function TaskStatusBadge({
  status,
  showWhenUndefined = false,
}: {
  status: TaskStatus
  showWhenUndefined?: boolean
}) {
  if (status === "UNDEFINED" && !showWhenUndefined) return null
  return (
    <Badge variant="outline" className={cn("font-medium", STATUS_CLASSNAME[status])}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}

// ScoreSwatch is the single source of truth for what a score tile looks
// like — used by the form's 1..10 selector and by every card/details
// surface that displays a saved score. Pass `interactive` to render as a
// <button> with hover/selection states; otherwise it renders as a static
// <span>. Score 0 is the "not assessed" state and renders muted.
interface ScoreSwatchProps {
  kind: ScoreKind
  score: number
  interactive?: boolean
  selected?: boolean
  dimmed?: boolean
  onClick?: () => void
  id?: string
  ariaLabel?: string
  // className lets a caller stretch the swatch to fill a grid cell (the
  // form selector wants w-full) while the card keeps the intrinsic 32px
  // tile. Merged last so callers always win on layout.
  className?: string
}

export function ScoreSwatch({
  kind,
  score,
  interactive = false,
  selected = false,
  dimmed = false,
  onClick,
  id,
  ariaLabel,
  className: classNameOverride,
}: ScoreSwatchProps) {
  const colors = kind === "risk" ? RISK_SWATCH_COLORS : PROFIT_SWATCH_COLORS
  const tone =
    score <= 0
      ? UNRATED_TONE
      : colors[Math.min(10, Math.max(1, Math.round(score))) - 1]
  const className = cn(
    "inline-flex h-8 w-8 select-none items-center justify-center rounded font-mono text-xs tabular-nums leading-none transition",
    tone,
    interactive &&
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
    interactive && selected &&
      "ring-2 ring-foreground ring-offset-1 ring-offset-background",
    dimmed && "opacity-55 hover:opacity-100",
    classNameOverride,
  )
  const label =
    ariaLabel ??
    `${kind === "risk" ? "Risk" : "Profit"} ${score > 0 ? score : "not assessed"}${score > 0 ? " of 10" : ""}`

  if (interactive) {
    return (
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={label}
        id={id}
        onClick={onClick}
        className={className}
      >
        {score > 0 ? score : ""}
      </button>
    )
  }
  return (
    <span
      id={id}
      title={label}
      aria-label={label}
      className={className}
    >
      {score > 0 ? score : "–"}
    </span>
  )
}

// TaskScoreBadge is a backwards-compat alias for ScoreSwatch so existing
// call sites keep working. New code should prefer ScoreSwatch directly.
export function TaskScoreBadge({
  kind,
  score,
}: {
  kind: ScoreKind
  score: number
}) {
  return <ScoreSwatch kind={kind} score={score} />
}
