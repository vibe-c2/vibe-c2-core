import { BotIcon, CheckIcon, ShieldOffIcon, TriangleAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FormattedDateTimeText } from "@/components/ui/formatted-date-time-text"
import { cn } from "@/lib/utils"
import type { AgentActionFieldsFragment } from "@/graphql/gql/graphql"

interface AgentActionListProps {
  actions: AgentActionFieldsFragment[]
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  filtered: boolean
}

export function AgentActionList({
  actions,
  hasMore,
  loadingMore,
  onLoadMore,
  filtered,
}: AgentActionListProps) {
  if (actions.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        <BotIcon className="mx-auto mb-2 size-5" />
        {filtered
          ? "No activity matches these filters."
          : "None of your agents has done anything yet."}
      </div>
    )
  }

  return (
    <div className="pt-2">
      <ul className="divide-y rounded-md border">
        {actions.map((action) => (
          <ActionRow key={action.id} action={action} />
        ))}
      </ul>

      {hasMore && (
        <div className="flex justify-center py-3">
          <Button variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load older"}
          </Button>
        </div>
      )}
    </div>
  )
}

function ActionRow({ action }: { action: AgentActionFieldsFragment }) {
  return (
    <li className="flex items-start gap-3 px-3 py-2 text-sm">
      <OutcomeIcon outcome={action.outcome} write={action.write} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono text-xs">{action.tool}</span>
          {action.write && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              write
            </span>
          )}
          <span className="text-xs text-muted-foreground">{action.agentName}</span>
          {/* The feed spans operations, so each row has to say which one it
              acted in. Absent for calls that are not operation-scoped. */}
          {action.operation && (
            <span className="text-xs text-muted-foreground/70">
              · {action.operation.name}
            </span>
          )}
        </div>

        {action.error && (
          <div
            className={cn(
              "mt-0.5 break-words text-xs",
              action.outcome === "REFUSED"
                ? "text-amber-700 dark:text-amber-500"
                : "text-destructive",
            )}
          >
            {action.error}
          </div>
        )}

        {/* The arguments are the difference between "it read hosts" and "it
            read every host matching this filter". Collapsed by default because
            most rows are uninteresting and the feed is long. */}
        {action.arguments && action.arguments !== "{}" && (
          <details className="mt-0.5">
            <summary className="cursor-pointer select-none text-[11px] text-muted-foreground">
              arguments
            </summary>
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/40 p-2 font-mono text-[11px]">
              {formatArguments(action.arguments)}
            </pre>
          </details>
        )}
      </div>

      <div className="shrink-0 text-right text-xs text-muted-foreground">
        <div>
          <FormattedDateTimeText date={action.occurredAt} />
        </div>
        <div className="text-[10px] text-muted-foreground/70">{action.durationMs} ms</div>
      </div>
    </li>
  )
}

// Refusals render distinctly from failures: one means the agent hit the edge
// of what its key allows, the other means something broke. Conflating them
// would send an operator debugging a permission decision.
function OutcomeIcon({ outcome, write }: { outcome: string; write: boolean }) {
  if (outcome === "REFUSED") {
    return <ShieldOffIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
  }
  if (outcome === "ERROR") {
    return <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
  }
  return (
    <CheckIcon
      className={cn(
        "mt-0.5 size-4 shrink-0",
        write ? "text-primary" : "text-muted-foreground/40",
      )}
    />
  )
}

// The server stores arguments as JSON, truncated at 4 KB — so a long one may
// not parse. Show it raw rather than dropping it.
function formatArguments(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}
