import { BotIcon, CheckIcon, ShieldOffIcon, TriangleAlertIcon } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useAgentActivity, type AgentActivityEvent } from "@/graphql/hooks/agent-activity"
import { useScopedOperationId } from "@/hooks/use-scoped-operation"

/**
 * Shows what an AI agent is doing in the current operation, as it happens.
 *
 * The other half of the symbiosis: the agent can see the operator through the
 * focus beacon, and this is how the operator sees the agent. Without it, an
 * agent's work only surfaces after the fact on the timeline, which is the
 * difference between working alongside something and finding out what it did.
 *
 * Renders nothing when no agent is active, so it costs nothing visually for
 * operators who do not use one.
 */
export function AgentActivityRail() {
  const operationId = useScopedOperationId()
  const { events, current } = useAgentActivity(operationId)

  if (!current) return null

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1.5 text-xs shadow-sm backdrop-blur transition-colors hover:bg-accent"
            aria-label="Agent activity"
          />
        }
      >
        <span className="relative flex size-2 shrink-0">
          {/* The pulse is the "still working" signal — a static dot reads as
              a status badge rather than live activity. */}
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        <BotIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="max-w-64 truncate text-muted-foreground">
          <span className="font-medium text-foreground">{current.agentName}</span>
          {" — "}
          {current.summary || current.tool}
        </span>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] p-2">
        <div className="px-1 pb-2 text-xs text-muted-foreground">
          {current.agentLabel}
        </div>
        <ul className="space-y-0.5">
          {events.map((event, index) => (
            <ActivityRow
              // Events carry no id and repeat by nature (the same tool, twice
              // in a row, is ordinary). Index is the honest key here: the list
              // is prepend-only and never reordered.
              key={index}
              event={event}
              latest={index === 0}
            />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function ActivityRow({
  event,
  latest,
}: {
  event: AgentActivityEvent
  latest: boolean
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-2 rounded px-1.5 py-1 text-xs",
        latest ? "bg-accent/40" : "text-muted-foreground",
      )}
    >
      <OutcomeIcon outcome={event.outcome} write={event.write} />
      <span className="min-w-0 flex-1">
        <span className="break-words">{event.summary || event.tool}</span>
        <span className="ml-1.5 font-mono text-[10px] text-muted-foreground/70">
          {event.tool}
        </span>
      </span>
    </li>
  )
}

// Refusals are shown distinctly from failures. An agent hitting the edge of
// what its key allows is worth an operator noticing — it usually means the key
// is scoped more narrowly than the work they asked for.
function OutcomeIcon({ outcome, write }: { outcome: string; write: boolean }) {
  if (outcome === "refused") {
    return <ShieldOffIcon className="mt-0.5 size-3 shrink-0 text-amber-600 dark:text-amber-500" />
  }
  if (outcome === "error") {
    return <TriangleAlertIcon className="mt-0.5 size-3 shrink-0 text-destructive" />
  }
  return (
    <CheckIcon
      className={cn(
        "mt-0.5 size-3 shrink-0",
        write ? "text-primary" : "text-muted-foreground/50",
      )}
    />
  )
}
