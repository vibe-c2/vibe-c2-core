import { graphql } from "@/graphql/gql"

export const UserFields = graphql(`
  fragment UserFields on User {
    id
    username
    roles
    active
    createdAt
    updatedAt
  }
`)

export const MeQuery = graphql(`
  query Me {
    me {
      ...UserFields
    }
  }
`)

export const UserQuery = graphql(`
  query User($id: ID!) {
    user(id: $id) {
      ...UserFields
    }
  }
`)

export const UsersQuery = graphql(`
  query Users($search: String, $first: Int, $after: String) {
    users(search: $search, first: $first, after: $after) {
      edges {
        node {
          ...UserFields
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

export const CreateUserMutation = graphql(`
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      ...UserFields
    }
  }
`)

export const UpdateUserMutation = graphql(`
  mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
    updateUser(id: $id, input: $input) {
      ...UserFields
    }
  }
`)

export const DeleteUserMutation = graphql(`
  mutation DeleteUser($id: ID!) {
    deleteUser(id: $id)
  }
`)

export const UpdateOwnProfileMutation = graphql(`
  mutation UpdateOwnProfile($input: UpdateUserInput!) {
    updateOwnProfile(input: $input) {
      ...UserFields
    }
  }
`)

// Real-time subscription — streams user create/update/delete events via SSE.
// The server includes the full User object for CREATE/UPDATE (null on DELETE).
export const UserChangedSubscription = graphql(`
  subscription UserChanged {
    userChanged {
      action
      userId
      username
      user {
        ...UserFields
      }
    }
  }
`)
