import { graphql } from "@/graphql/gql"

export const CredentialCommentFields = graphql(`
  fragment CredentialCommentFields on CredentialComment {
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

export const CredentialFields = graphql(`
  fragment CredentialFields on Credential {
    id
    operationId
    name
    type
    username
    password
    keys {
      name
      content
    }
    properties {
      name
      value
    }
    isValid
    tags
    comments {
      ...CredentialCommentFields
    }
    viewerCanModerateComments
    createdBy {
      id
      username
    }
    backlinkCount
    createdAt
    updatedAt
  }
`)

// Variant used by the cross-operation Findings view. Adds the parent
// operation so the table can render an "Operation" column. Kept separate
// from CredentialFields so scoped views don't pay the extra Operation
// lookup per row.
export const CredentialFieldsWithOperation = graphql(`
  fragment CredentialFieldsWithOperation on Credential {
    ...CredentialFields
    operation {
      id
      name
    }
  }
`)

export const CredentialQuery = graphql(`
  query Credential($id: ID!) {
    credential(id: $id) {
      ...CredentialFields
    }
  }
`)

export const CredentialsQuery = graphql(`
  query Credentials(
    $operationId: ID!
    $search: String
    $type: CredentialType
    $tags: [String!]
    $validOnly: Boolean
    $first: Int
    $after: String
  ) {
    credentials(
      operationId: $operationId
      search: $search
      type: $type
      tags: $tags
      validOnly: $validOnly
      first: $first
      after: $after
    ) {
      edges {
        node {
          ...CredentialFields
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

export const CredentialTagsQuery = graphql(`
  query CredentialTags($operationId: ID!) {
    credentialTags(operationId: $operationId)
  }
`)

// Wiki documents that reference the given credential via the inline
// /credential chip. Powers the "Referenced in" section in the credential
// details dialog. Mirrors WikiDocumentBacklinksQuery and reuses the same
// row fragment so both surfaces render identically.
export const CredentialBacklinksQuery = graphql(`
  query CredentialBacklinks($credentialId: ID!) {
    wikiDocumentsReferencingCredential(credentialId: $credentialId) {
      ...WikiDocumentBacklinkFields
    }
  }
`)

// Cross-operation list query — powers the "global" Findings page.
// operationIds: null  = "all my accessible operations" (server resolves)
// operationIds: []    = explicit empty (returns empty connection)
// operationIds: [...] = listed operations (server authorizes each)
export const MyCredentialsQuery = graphql(`
  query MyCredentials(
    $operationIds: [ID!]
    $search: String
    $type: CredentialType
    $tags: [String!]
    $validOnly: Boolean
    $first: Int
    $after: String
  ) {
    myCredentials(
      operationIds: $operationIds
      search: $search
      type: $type
      tags: $tags
      validOnly: $validOnly
      first: $first
      after: $after
    ) {
      edges {
        node {
          ...CredentialFieldsWithOperation
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

export const MyCredentialTagsQuery = graphql(`
  query MyCredentialTags($operationIds: [ID!]) {
    myCredentialTags(operationIds: $operationIds)
  }
`)

export const CreateCredentialMutation = graphql(`
  mutation CreateCredential($operationId: ID!, $input: CreateCredentialInput!) {
    createCredential(operationId: $operationId, input: $input) {
      ...CredentialFields
    }
  }
`)

export const UpdateCredentialMutation = graphql(`
  mutation UpdateCredential($id: ID!, $input: UpdateCredentialInput!) {
    updateCredential(id: $id, input: $input) {
      ...CredentialFields
    }
  }
`)

export const DeleteCredentialMutation = graphql(`
  mutation DeleteCredential($id: ID!) {
    deleteCredential(id: $id)
  }
`)

export const AddCredentialCommentMutation = graphql(`
  mutation AddCredentialComment($credentialId: ID!, $text: String!) {
    addCredentialComment(credentialId: $credentialId, text: $text) {
      ...CredentialFields
    }
  }
`)

export const UpdateCredentialCommentMutation = graphql(`
  mutation UpdateCredentialComment(
    $credentialId: ID!
    $commentId: ID!
    $text: String!
  ) {
    updateCredentialComment(
      credentialId: $credentialId
      commentId: $commentId
      text: $text
    ) {
      ...CredentialFields
    }
  }
`)

export const DeleteCredentialCommentMutation = graphql(`
  mutation DeleteCredentialComment($credentialId: ID!, $commentId: ID!) {
    deleteCredentialComment(credentialId: $credentialId, commentId: $commentId) {
      ...CredentialFields
    }
  }
`)

export const CredentialChangedSubscription = graphql(`
  subscription CredentialChanged($operationId: ID!) {
    credentialChanged(operationId: $operationId) {
      action
      credentialId
      operationId
      credential {
        ...CredentialFields
      }
    }
  }
`)

// Cross-operation subscription — sibling of credentialChanged. Powers live
// updates on the global Findings page. operationIds follows the same
// null/empty/explicit semantics as MyCredentialsQuery.
export const MyCredentialChangedSubscription = graphql(`
  subscription MyCredentialChanged($operationIds: [ID!]) {
    myCredentialChanged(operationIds: $operationIds) {
      action
      credentialId
      operationId
      credential {
        ...CredentialFieldsWithOperation
      }
    }
  }
`)
