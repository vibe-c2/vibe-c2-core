import { Badge } from "@/components/ui/badge"
import type { TaskStage, TaskStatus } from "@/graphql/gql/graphql"
import { cn } from "@/lib/utils"

// Stage labels render the human-readable column name in card headers,
// timeline rows, and the details dialog. Kept in one place so a future
// rename ("In Process" → "In Progress", etc.) is a single edit.
const STAGE_LABEL: Record<TaskStage, string> = {
  BACKLOG: "Backlog",
  TODO: "To do",
  IN_PROCESS: "In process",
  DONE: "Done",
}

// Stage color schemes deliberately use the same neutral surface for every
// column except DONE, which gets a muted green so completed work reads as
// distinctly resolved on a dense board.
const STAGE_CLASSNAME: Record<TaskStage, string> = {
  BACKLOG: "bg-muted text-muted-foreground border-transparent",
  TODO: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300",
  IN_PROCESS:
    "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300",
  DONE:
    "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300",
}

export function stageLabel(stage: TaskStage): string {
  return STAGE_LABEL[stage]
}

export function TaskStageBadge({ stage }: { stage: TaskStage }) {
  return (
    <Badge variant="outline" className={cn("font-medium", STAGE_CLASSNAME[stage])}>
      {STAGE_LABEL[stage]}
    </Badge>
  )
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  UNDEFINED: "Pending",
  SUCCESS: "Success",
  FAIL: "Fail",
}

const STATUS_CLASSNAME: Record<TaskStatus, string> = {
  UNDEFINED: "bg-muted text-muted-foreground border-transparent",
  SUCCESS:
    "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  FAIL:
    "bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300",
}

export function statusLabel(status: TaskStatus): string {
  return STATUS_LABEL[status]
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

// Risk and profit scores share a 1–10 scale but read inversely:
//   risk:   higher → worse (red)
//   profit: higher → better (green)
// scoreTone() centralises the per-step colour ramp so badges, matrix
// bubbles, and the form's button row all render the same colour for the
// same score. Tailwind's JIT needs full class strings, so the ramps are
// listed explicitly. Score 0 means "not assessed" and uses a neutral
// surface so unrated tasks don't shout.
type ScoreKind = "risk" | "profit"

const RISK_TONES = [
  "bg-red-600/15 text-red-900 border-red-600/25 dark:text-red-200",
  "bg-red-600/25 text-red-900 border-red-600/35 dark:text-red-200",
  "bg-red-600/35 text-red-950 border-red-600/45 dark:text-red-100",
  "bg-red-600/45 text-red-950 border-red-600/55 dark:text-red-50",
  "bg-red-600/55 text-white border-red-600/65",
  "bg-red-600/65 text-white border-red-600/75",
  "bg-red-600/75 text-white border-red-600/85",
  "bg-red-600/85 text-white border-red-600/95",
  "bg-red-600/95 text-white border-red-600",
  "bg-red-600 text-white border-red-600",
] as const

const PROFIT_TONES = [
  "bg-green-600/15 text-green-900 border-green-600/25 dark:text-green-200",
  "bg-green-600/25 text-green-900 border-green-600/35 dark:text-green-200",
  "bg-green-600/35 text-green-950 border-green-600/45 dark:text-green-100",
  "bg-green-600/45 text-green-950 border-green-600/55 dark:text-green-50",
  "bg-green-600/55 text-white border-green-600/65",
  "bg-green-600/65 text-white border-green-600/75",
  "bg-green-600/75 text-white border-green-600/85",
  "bg-green-600/85 text-white border-green-600/95",
  "bg-green-600/95 text-white border-green-600",
  "bg-green-600 text-white border-green-600",
] as const

const UNRATED_TONE = "bg-muted text-muted-foreground border-transparent"

export function scoreTone(kind: ScoreKind, score: number): string {
  if (score <= 0) return UNRATED_TONE
  const idx = Math.min(10, Math.round(score)) - 1
  return kind === "risk" ? RISK_TONES[idx] : PROFIT_TONES[idx]
}

// Per-step swatch colour ramps used by both the create/edit form's score
// selector (interactive buttons) and the card/details tile (static span).
// Colours are precomputed as solid hex values — equivalent to mixing the
// terminal red-600/green-600 with white at 15..100% in 10 steps — so the
// chip renders identically regardless of the parent surface (a card on a
// light background and a tile inside a dark tooltip look the same). Using
// alpha here would have made the dark-popover variant much darker.
export const RISK_SWATCH_COLORS = [
  "bg-[#fadede] text-red-900 hover:bg-[#f6c9c9]",
  "bg-[#f6c9c9] text-red-900 hover:bg-[#f2b3b3]",
  "bg-[#f2b3b3] text-red-950 hover:bg-[#ef9d9d]",
  "bg-[#ef9d9d] text-red-950 hover:bg-[#ec8787]",
  "bg-[#ec8787] text-white hover:bg-[#e87171]",
  "bg-[#e87171] text-white hover:bg-[#e55c5c]",
  "bg-[#e55c5c] text-white hover:bg-[#e14646]",
  "bg-[#e14646] text-white hover:bg-[#de3131]",
  "bg-[#de3131] text-white hover:bg-[#dc2626]",
  "bg-[#dc2626] text-white hover:bg-[#dc2626]",
] as const

export const PROFIT_SWATCH_COLORS = [
  "bg-[#dcf1e3] text-green-900 hover:bg-[#c5e8d2]",
  "bg-[#c5e8d2] text-green-900 hover:bg-[#addfc0]",
  "bg-[#addfc0] text-green-950 hover:bg-[#96d6ae]",
  "bg-[#96d6ae] text-green-950 hover:bg-[#7fcc9b]",
  "bg-[#7fcc9b] text-white hover:bg-[#68c389]",
  "bg-[#68c389] text-white hover:bg-[#50ba77]",
  "bg-[#50ba77] text-white hover:bg-[#39b165]",
  "bg-[#39b165] text-white hover:bg-[#22a852]",
  "bg-[#22a852] text-white hover:bg-[#16a34a]",
  "bg-[#16a34a] text-white hover:bg-[#16a34a]",
] as const

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
