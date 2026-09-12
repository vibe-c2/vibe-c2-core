import { CheckIcon, ShieldOffIcon, TriangleAlertIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// Refusals render distinctly from failures: one means the agent hit the edge
// of what its key allows, the other means something broke. Conflating them
// would send an operator debugging a permission decision.
//
// The outcome is normalised here because it arrives in two casings: the
// GraphQL enum (`REFUSED`) on the activity page and the bus payload
// (`refused`) on the live rail. Doing it in one place keeps a third caller
// from having to know which one it is holding.
export function OutcomeIcon({
  outcome,
  write,
  size = "md",
}: {
  outcome: string
  write: boolean
  size?: "sm" | "md"
}) {
  const sizeClass = size === "sm" ? "mt-0.5 size-3 shrink-0" : "size-4 shrink-0"
  const idle = size === "sm" ? "text-muted-foreground/50" : "text-muted-foreground/40"

  switch (outcome.toLowerCase()) {
    case "refused":
      return (
        <ShieldOffIcon className={cn(sizeClass, "text-amber-600 dark:text-amber-500")} />
      )
    case "error":
      return <TriangleAlertIcon className={cn(sizeClass, "text-destructive")} />
    default:
      return <CheckIcon className={cn(sizeClass, write ? "text-primary" : idle)} />
  }
}
