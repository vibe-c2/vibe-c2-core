import { graphql } from "@/graphql/gql"

export const APIKeyFields = graphql(`
  fragment APIKeyFields on APIKey {
    id
    keyId
    enabled
    lastUsedAt
    createdAt
    updatedAt
  }
`)

// --- Queries ---

export const MyAPIKeyQuery = graphql(`
  query MyAPIKey {
    myAPIKey {
      ...APIKeyFields
    }
  }
`)

// --- Mutations ---

// CreateMyAPIKey / RegenerateMyAPIKey both return the full raw token.
// This is the ONLY time the secret is exposed — the client must capture
// it immediately. Subsequent queries surface only the public keyId prefix.
export const CreateMyAPIKeyMutation = graphql(`
  mutation CreateMyAPIKey {
    createMyAPIKey {
      apiKey {
        ...APIKeyFields
      }
      token
    }
  }
`)

export const RegenerateMyAPIKeyMutation = graphql(`
  mutation RegenerateMyAPIKey {
    regenerateMyAPIKey {
      apiKey {
        ...APIKeyFields
      }
      token
    }
  }
`)

export const SetMyAPIKeyEnabledMutation = graphql(`
  mutation SetMyAPIKeyEnabled($enabled: Boolean!) {
    setMyAPIKeyEnabled(enabled: $enabled) {
      ...APIKeyFields
    }
  }
`)

export const DeleteMyAPIKeyMutation = graphql(`
  mutation DeleteMyAPIKey {
    deleteMyAPIKey
  }
`)
