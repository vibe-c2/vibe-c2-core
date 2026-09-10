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
    $first: Int
    $after: String
  ) {
    myAgentActions(
      agentKeyId: $agentKeyId
      operationId: $operationId
      writesOnly: $writesOnly
      outcomes: $outcomes
      first: $first
      after: $after
    ) {
      edges {
        node {
          ...AgentActionFields
        }
        cursor
      }
      pageInfo {
        hasNextPage
        endCursor
      }
      totalCount
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

// Fires on every call any of the caller's agents makes, so the page stays
// current without a reload.
export const MyAgentActionOccurredSubscription = graphql(`
  subscription MyAgentActionOccurred {
    myAgentActionOccurred {
      agentKeyId
      agentName
      tool
      write
      outcome
      operationId
    }
  }
`)
