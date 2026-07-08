import { graphql } from "@/graphql/gql"

// --- Fragments ---

// Lightweight fields for tree rendering (no content).
//
// `parentDocumentId` is a scalar id (not a nested `parentDocument { id }`)
// so the backend doesn't issue a per-row Mongo lookup just to surface the
// parent's identity. `childCount` is precomputed in bulk by the tree-shaped
// query resolvers (aggregation pipeline) so it's a constant-time read on
// the wire, no N+1.
//
// `lastUpdatedAt` + `updatedAt` are carried so the document-reference picker
// can sort its full-tree result by recency (latest-first) without a separate
// query. The sidebar/reveal-path consumers don't read them — two extra
// timestamp strings per row is negligible wire size.
//
// Shared by the lazy-children query (wikiDocumentChildren), the reveal-path
// query (wikiDocumentTreeRevealPath), and the legacy full-tree query
// (wikiDocumentTree) — the latter is still used by the move dialog, which
// lazy-fetches the full tree only when opened.
export const WikiDocumentTreeFields = graphql(`
  fragment WikiDocumentTreeFields on WikiDocument {
    id
    # operationId is required so per-parent cache writes (revealPath,
    # ensureWikiTree) can key on the row's *actual* operation rather than
    # trusting whichever operationId the caller had in scope at fetch time.
    # Without it, opening a /wiki/<operationDocId> URL while the Public tab
    # is active silently pollutes the Public children cache with operation
    # rows — sidebar then renders the wrong tree under Public.
    operationId
    parentDocumentId
    title
    emoji
    icon
    color
    sortOrder
    childCount
    hasContent
    isTemplate
    sourceTemplateId
    checklistTotal
    checklistRequired
    checklistAnswered
    lastUpdatedAt
    updatedAt
  }
`)

// Minimal projection used by the inline /doc chip — never reads content.
// A page can cite the same doc many times; this fragment is shared across
// all chip instances via the per-id query cache key.
export const WikiDocumentLiteFields = graphql(`
  fragment WikiDocumentLiteFields on WikiDocument {
    id
    title
    emoji
    icon
    color
    isTemplate
    deletedAt
  }
`)

// Backlink row fields. Carries one ancestor segment so the UI can
// disambiguate same-titled pages without pulling the full breadcrumb chain.
export const WikiDocumentBacklinkFields = graphql(`
  fragment WikiDocumentBacklinkFields on WikiDocument {
    id
    title
    emoji
    icon
    color
    updatedAt
    ancestors { id title emoji icon color isDeleted }
  }
`)

// Full document fields including content and metadata.
//
// `ancestors` is included so the editor header can render its breadcrumb
// without consulting a separate flat tree — the server already walks the
// parent chain and the data piggybacks on the single per-doc fetch.
export const WikiDocumentFields = graphql(`
  fragment WikiDocumentFields on WikiDocument {
    id
    operationId
    parentDocumentId
    ancestors { id title emoji icon color isDeleted }
    title
    content
    emoji
    color
    icon
    sortOrder
    isTemplate
    sourceTemplateId
    checklistTotal
    checklistRequired
    checklistAnswered
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
// cycle. `ancestors` is included so the dropdown can render the full breadcrumb
// path beneath the title, disambiguating same-named documents in different
// locations.
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
      ancestors { id title emoji icon color isDeleted }
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

// Templates in an operation — just the isTemplate-flagged rows, sorted by
// title server-side. Backs the create-from-template picker so it no longer
// pulls the whole tree and filters in memory; cost scales with template
// count, not total document count.
export const WikiTemplatesQuery = graphql(`
  query WikiTemplates($operationId: ID!) {
    wikiTemplates(operationId: $operationId) {
      ...WikiDocumentTreeFields
    }
  }
`)

// Direct children of a parent (roots when parentDocumentId is null) — the
// core query for the lazy sidebar. One request per expanded branch.
export const WikiDocumentChildrenQuery = graphql(`
  query WikiDocumentChildren($operationId: ID!, $parentDocumentId: ID) {
    wikiDocumentChildren(
      operationId: $operationId
      parentDocumentId: $parentDocumentId
    ) {
      ...WikiDocumentTreeFields
    }
  }
`)

// Everything the sidebar needs to render itself expanded down to documentId:
// roots + each ancestor's siblings. One round trip on direct-link landings.
export const WikiDocumentTreeRevealPathQuery = graphql(`
  query WikiDocumentTreeRevealPath($documentId: ID!) {
    wikiDocumentTreeRevealPath(documentId: $documentId) {
      ...WikiDocumentTreeFields
    }
  }
`)

// Cheap badge query for the trash icon. Replaces the old practice of
// firing the full paginated trash list just to read its totalCount.
export const WikiDocumentTrashCountQuery = graphql(`
  query WikiDocumentTrashCount($operationId: ID!) {
    wikiDocumentTrashCount(operationId: $operationId)
  }
`)

export const WikiDocumentQuery = graphql(`
  query WikiDocument($id: ID!) {
    wikiDocument(id: $id) {
      ...WikiDocumentFields
    }
  }
`)

// Recent-documents modal feed. Sort defaults to RECENTLY_CREATED on the
// server; clients pass RECENTLY_UPDATED for the "Recently updated" toggle.
// The row projection mirrors what wiki-recent-docs-modal.tsx needs: icon
// fields for the row glyph, ancestors for the breadcrumb, and both
// createdAt + lastUpdatedAt so the timestamp shown next to the row matches
// the active sort.
export const WikiRecentDocumentsQuery = graphql(`
  query WikiRecentDocuments(
    $operationId: ID!
    $sort: WikiDocumentSort
    $first: Int
    $after: String
  ) {
    wikiDocuments(
      operationId: $operationId
      sort: $sort
      first: $first
      after: $after
    ) {
      edges {
        node {
          id
          title
          emoji
          icon
          color
          parentDocumentId
          ancestors { id title emoji icon color isDeleted }
          createdAt
          updatedAt
          lastUpdatedAt
          createdBy { id username }
          lastUpdatedBy { id username }
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
          parentDocumentId
          ancestors { id title emoji icon color isDeleted }
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

export const WikiDocumentLiteQuery = graphql(`
  query WikiDocumentLite($id: ID!) {
    wikiDocument(id: $id) {
      ...WikiDocumentLiteFields
    }
  }
`)

export const WikiDocumentBacklinksQuery = graphql(`
  query WikiDocumentBacklinks($documentId: ID!) {
    wikiDocumentBacklinks(documentId: $documentId) {
      ...WikiDocumentBacklinkFields
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
      parentDocumentId
      createdBy { id username }
      createdAt updatedAt
    }
  }
`)

export const UpdateWikiDocumentMutation = graphql(`
  mutation UpdateWikiDocument($id: ID!, $input: UpdateWikiDocumentInput!) {
    updateWikiDocument(id: $id, input: $input) {
      id title emoji color icon sortOrder
      parentDocumentId
      updatedAt
    }
  }
`)

// Bulk sibling reorder. Replaces the N-mutation rebalance loop in the DnD
// flow with one round trip + one SSE invalidation wave per affected parent
// bucket. Returns the new ordering as committed by the server so the
// optimistic client cache can be reconciled in one setQueryData call.
export const ReorderWikiDocumentSiblingsMutation = graphql(`
  mutation ReorderWikiDocumentSiblings($input: ReorderWikiDocumentSiblingsInput!) {
    reorderWikiDocumentSiblings(input: $input) {
      id sortOrder parentDocumentId updatedAt
    }
  }
`)

export const DeleteWikiDocumentMutation = graphql(`
  mutation DeleteWikiDocument($id: ID!) {
    deleteWikiDocument(id: $id)
  }
`)

// Duplicate a document as a sibling. When `withChildren` is true the entire
// active subtree is cloned. The duplicate is placed immediately after the
// source in sortOrder.
export const DuplicateWikiDocumentMutation = graphql(`
  mutation DuplicateWikiDocument($id: ID!, $withChildren: Boolean) {
    duplicateWikiDocument(id: $id, withChildren: $withChildren) {
      id operationId title emoji color icon sortOrder
      parentDocumentId
      createdAt updatedAt
    }
  }
`)

// Flag/unflag a document as a reusable template. Returns the updated doc so
// the cache picks up the new isTemplate value (and the fixed template icon).
export const SetWikiDocumentTemplateMutation = graphql(`
  mutation SetWikiDocumentTemplate($id: ID!, $isTemplate: Boolean!) {
    setWikiDocumentTemplate(id: $id, isTemplate: $isTemplate) {
      id operationId title emoji icon color sortOrder
      parentDocumentId
      isTemplate
      updatedAt
    }
  }
`)

// Fork a template (any doc flagged isTemplate that the caller can read) into an
// operation's wiki tree. Returns the new instance, placed under
// `parentDocumentId` when given (else at the operation root).
export const InstantiateTemplateMutation = graphql(`
  mutation InstantiateTemplate(
    $templateId: ID!
    $targetOperationId: ID!
    $parentDocumentId: ID
    $title: String
    $emoji: String
    $icon: String
    $color: String
  ) {
    instantiateTemplate(
      templateId: $templateId
      targetOperationId: $targetOperationId
      parentDocumentId: $parentDocumentId
      title: $title
      emoji: $emoji
      icon: $icon
      color: $color
    ) {
      id operationId title emoji color icon sortOrder
      parentDocumentId
      isTemplate
      sourceTemplateId
      checklistTotal
      checklistRequired
      checklistAnswered
      createdAt updatedAt
    }
  }
`)

export const RestoreWikiDocumentMutation = graphql(`
  mutation RestoreWikiDocument($id: ID!, $cascade: Boolean) {
    restoreWikiDocument(id: $id, cascade: $cascade) {
      id operationId title emoji icon color sortOrder
      parentDocumentId
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
      previousParentDocumentId
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
