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
    operation {
      id
      name
    }
  }
`)

// The caller's own audit trail, across every operation their agents touched.
// Reads are included, which is the point: the timeline shows what an agent
// changed, this shows what it looked at.
export const MyAgentActionsQuery = graphql(`
  query MyAgentActions(
    $agentKeyId: ID
    $operationId: ID
    $writesOnly: Boolean
    $outcomes: [AgentActionOutcome!]
    $before: String
    $limit: Int
  ) {
    myAgentActions(
      agentKeyId: $agentKeyId
      operationId: $operationId
      writesOnly: $writesOnly
      outcomes: $outcomes
      before: $before
      limit: $limit
    ) {
      ...AgentActionFields
    }
  }
`)

export const MyAgentActivitySummaryQuery = graphql(`
  query MyAgentActivitySummary {
    myAgentActivitySummary {
      agentKeyId
      agentName
      actions
      operations
      lastSeen
    }
  }
`)
