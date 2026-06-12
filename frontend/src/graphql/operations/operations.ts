import { graphql } from "@/graphql/gql"

export const OperationMemberFields = graphql(`
  fragment OperationMemberFields on OperationMember {
    user {
      id
      username
      roles
      active
      createdAt
      updatedAt
    }
    role
  }
`)

export const OperationFields = graphql(`
  fragment OperationFields on Operation {
    id
    name
    description
    members {
      ...OperationMemberFields
    }
    createdAt
    updatedAt
  }
`)

export const OperationQuery = graphql(`
  query Operation($id: ID!) {
    operation(id: $id) {
      ...OperationFields
    }
  }
`)

export const OperationsQuery = graphql(`
  query Operations(
    $search: String
    $sortBy: OperationSortField
    $sortDirection: SortDirection
    $first: Int
    $after: String
  ) {
    operations(
      search: $search
      sortBy: $sortBy
      sortDirection: $sortDirection
      first: $first
      after: $after
    ) {
      edges {
        node {
          ...OperationFields
        }
        cursor
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
`)

export const MyOperationRoleQuery = graphql(`
  query MyOperationRole($operationId: ID!) {
    myOperationRole(operationId: $operationId)
  }
`)

export const CreateOperationMutation = graphql(`
  mutation CreateOperation($input: CreateOperationInput!) {
    createOperation(input: $input) {
      ...OperationFields
    }
  }
`)

export const UpdateOperationMutation = graphql(`
  mutation UpdateOperation($id: ID!, $input: UpdateOperationInput!) {
    updateOperation(id: $id, input: $input) {
      ...OperationFields
    }
  }
`)

export const DeleteOperationMutation = graphql(`
  mutation DeleteOperation($id: ID!) {
    deleteOperation(id: $id)
  }
`)

export const AddOperationMemberMutation = graphql(`
  mutation AddOperationMember($operationId: ID!, $userId: ID!, $role: OperationRole!) {
    addOperationMember(operationId: $operationId, userId: $userId, role: $role) {
      ...OperationFields
    }
  }
`)

export const RemoveOperationMemberMutation = graphql(`
  mutation RemoveOperationMember($operationId: ID!, $userId: ID!) {
    removeOperationMember(operationId: $operationId, userId: $userId) {
      ...OperationFields
    }
  }
`)

export const UpdateOperationMemberRoleMutation = graphql(`
  mutation UpdateOperationMemberRole($operationId: ID!, $userId: ID!, $role: OperationRole!) {
    updateOperationMemberRole(operationId: $operationId, userId: $userId, role: $role) {
      ...OperationFields
    }
  }
`)

// Lightweight user search for autocomplete pickers (e.g., adding operation members).
// Returns only id and username — available to all authenticated users with operation:member.
export const UserSuggestionsQuery = graphql(`
  query UserSuggestions($search: String!, $first: Int) {
    userSuggestions(search: $search, first: $first) {
      id
      username
    }
  }
`)

// Real-time subscription — streams operation create/update/delete events via SSE.
// The server includes the full Operation object for CREATE/UPDATE (null on DELETE).
export const OperationChangedSubscription = graphql(`
  subscription OperationChanged($operationId: ID) {
    operationChanged(operationId: $operationId) {
      action
      operationId
      name
      operation {
        ...OperationFields
      }
    }
  }
`)

// Real-time subscription — streams membership change events via SSE.
// Only carries IDs (no full operation), so the hook invalidates queries.
export const OperationMemberChangedSubscription = graphql(`
  subscription OperationMemberChanged($operationId: ID) {
    operationMemberChanged(operationId: $operationId) {
      action
      operationId
      userId
    }
  }
`)
