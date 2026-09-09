import { graphql } from "@/graphql/gql"

// --- Mutations ---

// Published by the SPA as the operator navigates. Deliberately a mutation over
// HTTP rather than anything on the WebSocket: the subscription registry
// disposes every socket when the tab is hidden, which is exactly when a beacon
// would matter most, and apiFetch handles the CSRF double-submit correctly.
export const PublishOperatorFocusMutation = graphql(`
  mutation PublishOperatorFocus($input: OperatorFocusInput!) {
    publishOperatorFocus(input: $input)
  }
`)

// --- Queries ---

// Read-back, for confirming the beacon is working. Agents read focus through
// MCP, not through this.
export const MyOperatorFocusQuery = graphql(`
  query MyOperatorFocus {
    myOperatorFocus {
      route
      operationId
      wikiOperationId
      wikiDocumentId
      hostId
      credentialId
      hashId
      taskId
      findingsTab
      topologyLens
      topologyFocusedNodeId
      topologyFocusedEdgeId
      searchSummary
      updatedAt
    }
  }
`)
