import { graphql } from "@/graphql/gql"

export const HashCommentFields = graphql(`
  fragment HashCommentFields on HashComment {
    id
    text
    createdAt
    updatedAt
    author {
      id
      username
    }
  }
`)

export const HashCrackingMetaFields = graphql(`
  fragment HashCrackingMetaFields on HashCrackingMeta {
    tool
    wordlist
    rules
    durationSec
    crackedAt
    crackedBy {
      id
      username
    }
  }
`)

// Light row fragment for the table — leaves `credential` off (a per-row DB
// lookup) and uses credentialId chip rendering instead. The details dialog
// query loads the full credential.
export const HashFields = graphql(`
  fragment HashFields on Hash {
    id
    operationId
    value
    hashType
    hashcatMode
    username
    domain
    status
    source
    tags
    credentialId
    properties {
      name
      value
    }
    comments {
      ...HashCommentFields
    }
    crackingMeta {
      ...HashCrackingMetaFields
    }
    viewerCanModerateComments
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
    $hashTypes: [String!]
    $tags: [String!]
    $hasCredential: Boolean
    $first: Int
    $after: String
  ) {
    hashes(
      operationId: $operationId
      search: $search
      statuses: $statuses
      hashTypes: $hashTypes
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

export const MyHashesQuery = graphql(`
  query MyHashes(
    $operationIds: [ID!]
    $search: String
    $statuses: [HashStatus!]
    $hashTypes: [String!]
    $tags: [String!]
    $hasCredential: Boolean
    $first: Int
    $after: String
  ) {
    myHashes(
      operationIds: $operationIds
      search: $search
      statuses: $statuses
      hashTypes: $hashTypes
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

export const HashTypesQuery = graphql(`
  query HashTypes {
    hashTypes {
      name
      displayName
      hashcatMode
    }
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

export const AddHashCommentMutation = graphql(`
  mutation AddHashComment($hashId: ID!, $text: String!) {
    addHashComment(hashId: $hashId, text: $text) {
      ...HashFields
    }
  }
`)

export const UpdateHashCommentMutation = graphql(`
  mutation UpdateHashComment(
    $hashId: ID!
    $commentId: ID!
    $text: String!
  ) {
    updateHashComment(hashId: $hashId, commentId: $commentId, text: $text) {
      ...HashFields
    }
  }
`)

export const DeleteHashCommentMutation = graphql(`
  mutation DeleteHashComment($hashId: ID!, $commentId: ID!) {
    deleteHashComment(hashId: $hashId, commentId: $commentId) {
      ...HashFields
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
