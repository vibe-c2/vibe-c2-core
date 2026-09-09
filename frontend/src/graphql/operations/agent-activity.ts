import { graphql } from "@/graphql/gql"

// Live agent activity for one operation. Reads are included on purpose: they
// are what make an agent feel present rather than occasionally surprising.
// Only writes reach the timeline.
export const AgentActivitySubscription = graphql(`
  subscription AgentActivity($operationId: ID!) {
    agentActivity(operationId: $operationId) {
      operationId
      agentKeyId
      agentName
      agentLabel
      ownerUserId
      tool
      write
      outcome
      summary
    }
  }
`)
