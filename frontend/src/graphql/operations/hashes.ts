import { graphql } from "@/graphql/gql"

// Light row fragment for the table — leaves `credential` off (a per-row DB
// lookup) and uses credentialId chip rendering instead. The details dialog
// query loads the full credential.
export const HashFields = graphql(`
  fragment HashFields on Hash {
    id
    operationId
    value
    status
    comment
    tags
    credentialId
    createdBy {
      id
      username
    }
    createdAt
    updatedAt
  }
`)

// Detail fragment — additionally pulls the full linked credential so the
// dialog can render the credential chip with name/username/type without a
// follow-up query.
export const HashFieldsWithCredential = graphql(`
  fragment HashFieldsWithCredential on Hash {
    ...HashFields
    credential {
      id
      name
      type
      username
    }
  }
`)

// Cross-operation variant — adds parent Operation for the "Operation" column
// in the global view.
export const HashFieldsWithOperation = graphql(`
  fragment HashFieldsWithOperation on Hash {
    ...HashFields
    operation {
      id
      name
    }
  }
`)

export const HashQuery = graphql(`
  query Hash($id: ID!) {
    hash(id: $id) {
      ...HashFieldsWithCredential
    }
  }
`)

export const HashesQuery = graphql(`
  query Hashes(
    $operationId: ID!
    $search: String
    $statuses: [HashStatus!]
    $tags: [String!]
    $hasCredential: Boolean
    $first: Int
    $after: String
  ) {
    hashes(
      operationId: $operationId
      search: $search
      statuses: $statuses
      tags: $tags
      hasCredential: $hasCredential
      first: $first
      after: $after
    ) {
      edges {
        node {
          ...HashFields
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

export const HashTagsQuery = graphql(`
  query HashTags($operationId: ID!) {
    hashTags(operationId: $operationId)
  }
`)

// Wiki documents that reference the given hash via the inline /hash chip.
// Powers the "Referenced in" section in the hash details dialog. Mirrors
// CredentialBacklinksQuery and reuses the same row fragment so both surfaces
// render identically.
export const HashBacklinksQuery = graphql(`
  query HashBacklinks($hashId: ID!) {
    wikiDocumentsReferencingHash(hashId: $hashId) {
      ...WikiDocumentBacklinkFields
    }
  }
`)

export const MyHashesQuery = graphql(`
  query MyHashes(
    $operationIds: [ID!]
    $search: String
    $statuses: [HashStatus!]
    $tags: [String!]
    $hasCredential: Boolean
    $first: Int
    $after: String
  ) {
    myHashes(
      operationIds: $operationIds
      search: $search
      statuses: $statuses
      tags: $tags
      hasCredential: $hasCredential
      first: $first
      after: $after
    ) {
      edges {
        node {
          ...HashFieldsWithOperation
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

export const MyHashTagsQuery = graphql(`
  query MyHashTags($operationIds: [ID!]) {
    myHashTags(operationIds: $operationIds)
  }
`)

export const CreateHashMutation = graphql(`
  mutation CreateHash($operationId: ID!, $input: CreateHashInput!) {
    createHash(operationId: $operationId, input: $input) {
      ...HashFields
    }
  }
`)

export const UpdateHashMutation = graphql(`
  mutation UpdateHash($id: ID!, $input: UpdateHashInput!) {
    updateHash(id: $id, input: $input) {
      ...HashFields
    }
  }
`)

export const DeleteHashMutation = graphql(`
  mutation DeleteHash($id: ID!) {
    deleteHash(id: $id)
  }
`)

export const BulkImportHashesMutation = graphql(`
  mutation BulkImportHashes($operationId: ID!, $input: BulkImportHashesInput!) {
    bulkImportHashes(operationId: $operationId, input: $input) {
      added
      skipped
      hashes {
        ...HashFields
      }
    }
  }
`)

export const MarkHashCrackedMutation = graphql(`
  mutation MarkHashCracked($id: ID!, $input: MarkHashCrackedInput!) {
    markHashCracked(id: $id, input: $input) {
      ...HashFieldsWithCredential
    }
  }
`)

export const HashChangedSubscription = graphql(`
  subscription HashChanged($operationId: ID!) {
    hashChanged(operationId: $operationId) {
      action
      hashId
      operationId
      hash {
        ...HashFields
      }
    }
  }
`)

export const MyHashChangedSubscription = graphql(`
  subscription MyHashChanged($operationIds: [ID!]) {
    myHashChanged(operationIds: $operationIds) {
      action
      hashId
      operationId
      hash {
        ...HashFieldsWithOperation
      }
    }
  }
`)
