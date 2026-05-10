import { graphql } from "@/graphql/gql"

// --- Fragments ---

// Lightweight fields for tree rendering (no content).
export const WikiDocumentTreeFields = graphql(`
  fragment WikiDocumentTreeFields on WikiDocument {
    id
    operationId
    parentDocument { id }
    title
    emoji
    icon
    color
    sortOrder
    childCount
    createdAt
    updatedAt
  }
`)

// Full document fields including content and metadata.
export const WikiDocumentFields = graphql(`
  fragment WikiDocumentFields on WikiDocument {
    id
    operationId
    parentDocument { id }
    title
    content
    emoji
    color
    icon
    sortOrder
    createdBy { id username }
    lastUpdatedBy { id username }
    lastUpdatedAt
    lastBackupAt
    createdAt
    updatedAt
  }
`)

// Backup list fields — cheap fragment for the paginated list view.
// Deliberately excludes `content` so paginated list requests don't ship
// full document bodies for every row; `contentLength` is server-computed.
export const WikiDocumentBackupListFields = graphql(`
  fragment WikiDocumentBackupListFields on WikiDocumentBackup {
    id
    documentId
    title
    trigger
    description
    contentLength
    createdBy { id username }
    createdAt
  }
`)

// Backup detail fields — includes `content` for the preview dialog.
export const WikiDocumentBackupDetailFields = graphql(`
  fragment WikiDocumentBackupDetailFields on WikiDocumentBackup {
    id
    documentId
    title
    content
    contentLength
    trigger
    description
    createdBy { id username }
    createdAt
  }
`)

// Visit-history list row. The `document` relation is resolved server-side so
// renames/icon updates flow into the dropdown without a separate invalidate
// cycle. The doc projection is minimal — only the fields the dropdown row
// renders (icon trio + title) — to keep the history payload small.
export const WikiDocumentVisitListFields = graphql(`
  fragment WikiDocumentVisitListFields on WikiDocumentVisit {
    id
    visitedAt
    document {
      id
      title
      emoji
      icon
      color
    }
  }
`)

// --- Queries ---

export const WikiDocumentTreeQuery = graphql(`
  query WikiDocumentTree($operationId: ID!) {
    wikiDocumentTree(operationId: $operationId) {
      ...WikiDocumentTreeFields
    }
  }
`)

export const WikiDocumentQuery = graphql(`
  query WikiDocument($id: ID!) {
    wikiDocument(id: $id) {
      ...WikiDocumentFields
    }
  }
`)

export const WikiDocumentsQuery = graphql(`
  query WikiDocuments(
    $operationId: ID!
    $parentDocumentId: ID
    $search: String
    $first: Int
    $after: String
  ) {
    wikiDocuments(
      operationId: $operationId
      parentDocumentId: $parentDocumentId
      search: $search
      first: $first
      after: $after
    ) {
      edges {
        node {
          id
          operationId
          parentDocument { id }
          title
          emoji
          icon
          color
          sortOrder
          createdBy { id username }
          createdAt
          updatedAt
        }
        cursor
      }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
`)

export const WikiSearchQuery = graphql(`
  query WikiSearch(
    $operationId: ID!
    $scope: ID
    $query: String!
    $offset: Int
    $limit: Int
  ) {
    wikiSearch(
      operationId: $operationId
      scope: $scope
      query: $query
      offset: $offset
      limit: $limit
    ) {
      hits {
        document {
          id
          title
          emoji
          icon
          color
          parentDocument { id }
          createdBy { id username }
        }
        snippet
        matchRanges { start end }
        score
      }
      total
      hasMore
    }
  }
`)

export const WikiDocumentTrashQuery = graphql(`
  query WikiDocumentTrash($operationId: ID!, $first: Int, $after: String) {
    wikiDocumentTrash(operationId: $operationId, first: $first, after: $after) {
      edges {
        node {
          id
          title
          emoji
          icon
          color
          deletedAt
          deletedBy { id username }
          createdAt
          ancestors { id title emoji icon color isDeleted }
        }
        cursor
      }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
`)

export const WikiDocumentBackupsQuery = graphql(`
  query WikiDocumentBackups($documentId: ID!, $first: Int, $after: String) {
    wikiDocumentBackups(documentId: $documentId, first: $first, after: $after) {
      edges {
        node {
          ...WikiDocumentBackupListFields
        }
        cursor
      }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
`)

export const WikiDocumentBackupQuery = graphql(`
  query WikiDocumentBackupDetail($id: ID!) {
    wikiDocumentBackup(id: $id) {
      ...WikiDocumentBackupDetailFields
    }
  }
`)

export const WikiDocumentPresenceQuery = graphql(`
  query WikiDocumentPresence($documentId: ID!) {
    wikiDocumentPresence(documentId: $documentId) {
      documentId
      activeEditors { userId username connectedAt }
    }
  }
`)

export const WikiOperationPresenceQuery = graphql(`
  query WikiOperationPresence($operationId: ID!) {
    wikiOperationPresence(operationId: $operationId) {
      documentId
      activeEditors { userId username connectedAt }
    }
  }
`)

export const WikiDocumentHistoryQuery = graphql(`
  query WikiDocumentHistory($operationId: ID!, $offset: Int, $limit: Int) {
    wikiDocumentHistory(operationId: $operationId, offset: $offset, limit: $limit) {
      edges {
        node {
          ...WikiDocumentVisitListFields
        }
      }
      totalCount
    }
  }
`)

// --- Mutations ---

export const CreateWikiDocumentMutation = graphql(`
  mutation CreateWikiDocument($operationId: ID!, $input: CreateWikiDocumentInput!) {
    createWikiDocument(operationId: $operationId, input: $input) {
      id operationId title emoji color icon sortOrder
      parentDocument { id }
      createdBy { id username }
      createdAt updatedAt
    }
  }
`)

export const UpdateWikiDocumentMutation = graphql(`
  mutation UpdateWikiDocument($id: ID!, $input: UpdateWikiDocumentInput!) {
    updateWikiDocument(id: $id, input: $input) {
      id title emoji color icon sortOrder
      parentDocument { id }
      updatedAt
    }
  }
`)

export const DeleteWikiDocumentMutation = graphql(`
  mutation DeleteWikiDocument($id: ID!) {
    deleteWikiDocument(id: $id)
  }
`)

export const RestoreWikiDocumentMutation = graphql(`
  mutation RestoreWikiDocument($id: ID!, $cascade: Boolean) {
    restoreWikiDocument(id: $id, cascade: $cascade) {
      id operationId title emoji icon color sortOrder
      parentDocument { id }
    }
  }
`)

export const WikiDocumentTrashedDescendantsQuery = graphql(`
  query WikiDocumentTrashedDescendants($documentId: ID!) {
    wikiDocumentTrashedDescendants(documentId: $documentId) {
      id title emoji icon color
    }
  }
`)

export const PermanentlyDeleteWikiDocumentMutation = graphql(`
  mutation PermanentlyDeleteWikiDocument($id: ID!) {
    permanentlyDeleteWikiDocument(id: $id)
  }
`)

export const EmptyWikiDocumentTrashMutation = graphql(`
  mutation EmptyWikiDocumentTrash($operationId: ID!) {
    emptyWikiDocumentTrash(operationId: $operationId)
  }
`)

export const CreateWikiDocumentBackupMutation = graphql(`
  mutation CreateWikiDocumentBackup($documentId: ID!, $description: String) {
    createWikiDocumentBackup(documentId: $documentId, description: $description) {
      id documentId title trigger description
      createdBy { id username }
      createdAt
    }
  }
`)

export const RestoreWikiDocumentBackupMutation = graphql(`
  mutation RestoreWikiDocumentBackup($documentId: ID!, $backupId: ID!) {
    restoreWikiDocumentBackup(documentId: $documentId, backupId: $backupId) {
      id title content
    }
  }
`)

export const DeleteWikiDocumentBackupMutation = graphql(`
  mutation DeleteWikiDocumentBackup($id: ID!) {
    deleteWikiDocumentBackup(id: $id)
  }
`)

export const TrackWikiDocumentVisitMutation = graphql(`
  mutation TrackWikiDocumentVisit($documentId: ID!) {
    trackWikiDocumentVisit(documentId: $documentId) {
      id
      visitedAt
    }
  }
`)

// --- Subscriptions ---

// Real-time document CRUD events via SSE.
export const WikiDocumentChangedSubscription = graphql(`
  subscription WikiDocumentChanged($operationId: ID!) {
    wikiDocumentChanged(operationId: $operationId) {
      action
      documentId
      operationId
      parentDocumentId
      document { id title emoji icon color sortOrder parentDocument { id } }
    }
  }
`)

// Real-time presence join/leave events via SSE.
export const WikiDocumentPresenceChangedSubscription = graphql(`
  subscription WikiDocumentPresenceChanged($operationId: ID!) {
    wikiDocumentPresenceChanged(operationId: $operationId) {
      documentId operationId userId username action
    }
  }
`)
