import { graphql } from "@/graphql/gql"

export const AgentActionFields = graphql(`
  fragment AgentActionFields on AgentAction {
    id
    agentKeyId
    agentName
    tool
    write
    outcome
    error
    arguments
    durationMs
    occurredAt
    owner {
      id
      username
    }
  }
`)

// The audit trail behind the agent activity page. Reads are included, which is
// the point: the timeline shows what an agent changed, this shows what it
// looked at.
export const AgentActionsQuery = graphql(`
  query AgentActions(
    $operationId: ID!
    $agentKeyId: ID
    $writesOnly: Boolean
    $outcomes: [AgentActionOutcome!]
    $before: String
    $limit: Int
  ) {
    agentActions(
      operationId: $operationId
      agentKeyId: $agentKeyId
      writesOnly: $writesOnly
      outcomes: $outcomes
      before: $before
      limit: $limit
    ) {
      ...AgentActionFields
    }
  }
`)

export const AgentActivitySummaryQuery = graphql(`
  query AgentActivitySummary($operationId: ID!) {
    agentActivitySummary(operationId: $operationId) {
      agentKeyId
      agentName
      actions
      lastSeen
    }
  }
`)
