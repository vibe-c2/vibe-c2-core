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
    isValid
    tags
    comments {
      ...CredentialCommentFields
    }
    createdBy {
      id
      username
    }
    createdAt
    updatedAt
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
