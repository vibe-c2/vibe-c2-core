import { useCallback, useEffect, useRef, useState } from "react"
import { useSubscription } from "@/hooks/use-subscription"
import { AgentActivityDocument } from "@/graphql/gql/graphql"
import type { AgentActivitySubscription } from "@/graphql/gql/graphql"

export type AgentActivityEvent =
  AgentActivitySubscription["agentActivity"]

// How many recent calls the rail keeps. Enough to show what an agent is
// working through, few enough that it stays a glance rather than a log.
const MAX_ACTIVITY = 8

// How long the rail keeps showing an agent after its last call. An agent that
// has gone quiet is not working, and leaving it on screen would suggest
// otherwise.
const IDLE_TIMEOUT_MS = 60_000

export interface AgentActivityFeed {
  events: AgentActivityEvent[]
  /** The most recent call, or null once the agent has gone quiet. */
  current: AgentActivityEvent | null
}

/**
 * Subscribes to agent activity in one operation and keeps a short rolling
 * window of it for display.
 *
 * Deliberately not written into TanStack Query: this is a transient feed with
 * no canonical server state to refetch, and the durable record lives in the
 * timeline and the audit collection. Losing it on a reload is correct.
 */
export function useAgentActivity(operationId: string | null): AgentActivityFeed {
  const [events, setEvents] = useState<AgentActivityEvent[]>([])
  const [current, setCurrent] = useState<AgentActivityEvent | null>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleData = useCallback((data: AgentActivitySubscription) => {
    const event = data.agentActivity
    setEvents((prev) => [event, ...prev].slice(0, MAX_ACTIVITY))
    setCurrent(event)

    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setCurrent(null), IDLE_TIMEOUT_MS)
  }, [])

  useSubscription(
    AgentActivityDocument,
    { operationId: operationId ?? "" },
    { onData: handleData, enabled: !!operationId },
  )

  // Switching operations must not leave the previous one's activity on
  // screen. Reset during render via the prev-value pattern rather than in an
  // effect, matching operation-switcher.tsx — an effect here would render one
  // frame of the old operation's feed under the new one.
  const [lastOperationId, setLastOperationId] = useState(operationId)
  if (lastOperationId !== operationId) {
    setLastOperationId(operationId)
    setEvents([])
    setCurrent(null)
  }

  useEffect(() => {
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [])

  return { events, current }
}
