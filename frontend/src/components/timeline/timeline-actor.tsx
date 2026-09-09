import { BotIcon } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface TimelineActorProps {
  actorKind: string
  actorLabel: string
  username?: string | null
}

/**
 * Renders who caused a timeline event.
 *
 * An AI agent's action resolves to its OWNER through `actor`, so that
 * filtering the timeline by an operator still finds what their agent did for
 * them. That makes a delegated action indistinguishable from a hand-made one
 * unless it is marked — which would quietly undo the point of attributing
 * agent work at all. The bot glyph is that mark.
 */
export function TimelineActor({
  actorKind,
  actorLabel,
  username,
}: TimelineActorProps) {
  const label = actorLabel || username || "System"

  if (actorKind !== "agent") {
    return <span>{label}</span>
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className="inline-flex items-center gap-1 align-middle" />}
      >
        <BotIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span>{label}</span>
      </TooltipTrigger>
      <TooltipContent>
        Done by an AI agent acting for {username ?? "this operator"}.
      </TooltipContent>
    </Tooltip>
  )
}
