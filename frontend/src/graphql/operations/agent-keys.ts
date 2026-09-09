import { graphql } from "@/graphql/gql"

export const AgentKeyFields = graphql(`
  fragment AgentKeyFields on AgentKey {
    id
    keyId
    name
    enabled
    maxRole
    allowWrites
    operationScopes {
      id
      name
    }
    lastUsedAt
    createdAt
    updatedAt
  }
`)

// --- Queries ---

export const MyAgentKeysQuery = graphql(`
  query MyAgentKeys {
    myAgentKeys {
      ...AgentKeyFields
    }
  }
`)

// --- Mutations ---

// Create and regenerate are the only two operations that ever return the raw
// token. The client must capture it immediately — every subsequent read
// surfaces only the public keyId prefix.
export const CreateAgentKeyMutation = graphql(`
  mutation CreateAgentKey($input: CreateAgentKeyInput!) {
    createAgentKey(input: $input) {
      agentKey {
        ...AgentKeyFields
      }
      token
    }
  }
`)

export const RegenerateAgentKeyMutation = graphql(`
  mutation RegenerateAgentKey($id: ID!) {
    regenerateAgentKey(id: $id) {
      agentKey {
        ...AgentKeyFields
      }
      token
    }
  }
`)

export const UpdateAgentKeyMutation = graphql(`
  mutation UpdateAgentKey($id: ID!, $input: UpdateAgentKeyInput!) {
    updateAgentKey(id: $id, input: $input) {
      ...AgentKeyFields
    }
  }
`)

export const SetAgentKeyEnabledMutation = graphql(`
  mutation SetAgentKeyEnabled($id: ID!, $enabled: Boolean!) {
    setAgentKeyEnabled(id: $id, enabled: $enabled) {
      ...AgentKeyFields
    }
  }
`)

export const DeleteAgentKeyMutation = graphql(`
  mutation DeleteAgentKey($id: ID!) {
    deleteAgentKey(id: $id)
  }
`)
