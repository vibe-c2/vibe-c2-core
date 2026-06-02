import type { TaskStage, TaskStatus } from "@/graphql/gql/graphql"

// Non-component design tokens and label helpers for task badges. Kept in a
// component-free module so the badge components themselves can live in a file
// that only exports components (react-refresh/only-export-components).

// Stage labels render the human-readable column name in card headers,
// timeline rows, and the details dialog. Kept in one place so a future
// rename ("In Process" → "In Progress", etc.) is a single edit.
export const STAGE_LABEL: Record<TaskStage, string> = {
  BACKLOG: "Backlog",
  TODO: "To do",
  IN_PROCESS: "In process",
  DONE: "Done",
}

// Stage color schemes deliberately use the same neutral surface for every
// column except DONE, which gets a muted green so completed work reads as
// distinctly resolved on a dense board.
export const STAGE_CLASSNAME: Record<TaskStage, string> = {
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

export const STATUS_LABEL: Record<TaskStatus, string> = {
  UNDEFINED: "Pending",
  SUCCESS: "Success",
  FAIL: "Fail",
}

export const STATUS_CLASSNAME: Record<TaskStatus, string> = {
  UNDEFINED: "bg-muted text-muted-foreground border-transparent",
  SUCCESS:
    "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  FAIL:
    "bg-rose-500/15 text-rose-700 border-rose-500/30 dark:text-rose-300",
}

export function statusLabel(status: TaskStatus): string {
  return STATUS_LABEL[status]
}

// Risk and profit scores share a 1–10 scale but read inversely:
//   risk:   higher → worse (red)
//   profit: higher → better (green)
// scoreTone() centralises the per-step colour ramp so badges, matrix
// bubbles, and the form's button row all render the same colour for the
// same score. Tailwind's JIT needs full class strings, so the ramps are
// listed explicitly. Score 0 means "not assessed" and uses a neutral
// surface so unrated tasks don't shout.
export type ScoreKind = "risk" | "profit"

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

export const UNRATED_TONE = "bg-muted text-muted-foreground border-transparent"

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
