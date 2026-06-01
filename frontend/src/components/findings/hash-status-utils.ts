import type { HashStatus } from "@/graphql/gql/graphql"

export const HASH_STATUSES: readonly HashStatus[] = [
  "NOT_PROCESSED",
  "QUEUED",
  "CRACKING",
  "CRACKED",
  "FAILED",
] as const

// Human label shown in tables, badges, and pickers.
export function hashStatusLabel(status: HashStatus): string {
  switch (status) {
    case "NOT_PROCESSED":
      return "Not processed"
    case "QUEUED":
      return "Queued"
    case "CRACKING":
      return "Cracking"
    case "CRACKED":
      return "Cracked"
    case "FAILED":
      return "Failed"
  }
}

// Tailwind class fragment for the status badge. Picks calm colours so the
// table doesn't look like a disco — only CRACKED gets the loud accent
// because it's the operator-relevant terminal state.
export function hashStatusBadgeClass(status: HashStatus): string {
  switch (status) {
    case "NOT_PROCESSED":
      return "bg-muted text-muted-foreground"
    case "QUEUED":
      return "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
    case "CRACKING":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
    case "CRACKED":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
    case "FAILED":
      return "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
  }
}
