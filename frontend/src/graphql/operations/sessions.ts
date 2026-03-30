import { graphql } from "@/graphql/gql"

export const SessionFields = graphql(`
  fragment SessionFields on Session {
    id
    userId
    user {
      id
      username
    }
    ipAddress
    userAgent
    browser
    os
    device
    status
    terminationReason
    lastActivityAt
    expiresAt
    terminatedAt
    isCurrent
    createdAt
    updatedAt
  }
`)

// --- Queries ---

export const MySessionsQuery = graphql(`
  query MySessions($activeOnly: Boolean, $first: Int, $after: String) {
    mySessions(activeOnly: $activeOnly, first: $first, after: $after) {
      edges {
        node {
          ...SessionFields
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

export const SessionsQuery = graphql(`
  query Sessions($userId: ID, $search: String, $activeOnly: Boolean, $first: Int, $after: String) {
    sessions(userId: $userId, search: $search, activeOnly: $activeOnly, first: $first, after: $after) {
      edges {
        node {
          ...SessionFields
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

export const SessionQuery = graphql(`
  query Session($id: ID!) {
    session(id: $id) {
      ...SessionFields
    }
  }
`)

// --- Mutations ---

export const RevokeSessionMutation = graphql(`
  mutation RevokeSession($id: ID!) {
    revokeSession(id: $id)
  }
`)

export const RevokeAllMySessionsMutation = graphql(`
  mutation RevokeAllMySessions {
    revokeAllMySessions
  }
`)

export const AdminRevokeSessionMutation = graphql(`
  mutation AdminRevokeSession($id: ID!) {
    adminRevokeSession(id: $id)
  }
`)

export const AdminRevokeAllUserSessionsMutation = graphql(`
  mutation AdminRevokeAllUserSessions($userId: ID!) {
    adminRevokeAllUserSessions(userId: $userId)
  }
`)

// --- Subscriptions ---

// Real-time subscription for the caller's own session changes via SSE.
export const MySessionChangedSubscription = graphql(`
  subscription MySessionChanged {
    mySessionChanged {
      action
      sessionId
      userId
      session {
        ...SessionFields
      }
    }
  }
`)

// Real-time subscription for all session changes (admin only) via SSE.
export const SessionChangedSubscription = graphql(`
  subscription SessionChanged($userId: ID) {
    sessionChanged(userId: $userId) {
      action
      sessionId
      userId
      session {
        ...SessionFields
      }
    }
  }
`)
