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
    lastBackupAt
    createdAt
    updatedAt
  }
`)

// Backup fields.
export const WikiDocumentBackupFields = graphql(`
  fragment WikiDocumentBackupFields on WikiDocumentBackup {
    id
    documentId
    title
    content
    trigger
    description
    createdBy { id username }
    createdAt
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

export const WikiDocumentTrashQuery = graphql(`
  query WikiDocumentTrash($operationId: ID!, $first: Int, $after: String) {
    wikiDocumentTrash(operationId: $operationId, first: $first, after: $after) {
      edges {
        node {
          id
          title
          emoji
          deletedAt
          deletedBy { id username }
          createdAt
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
          ...WikiDocumentBackupFields
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
      ...WikiDocumentBackupFields
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
  mutation RestoreWikiDocument($id: ID!) {
    restoreWikiDocument(id: $id) {
      id operationId title emoji sortOrder
      parentDocument { id }
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

// --- Subscriptions ---

// Real-time document CRUD events via SSE.
export const WikiDocumentChangedSubscription = graphql(`
  subscription WikiDocumentChanged($operationId: ID!) {
    wikiDocumentChanged(operationId: $operationId) {
      action
      documentId
      operationId
      parentDocumentId
      document { id title emoji sortOrder parentDocument { id } }
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
