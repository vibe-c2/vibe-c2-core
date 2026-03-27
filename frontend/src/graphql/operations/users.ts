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
