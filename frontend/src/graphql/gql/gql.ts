/* eslint-disable */
import * as types from './graphql';
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  fragment APIKeyFields on APIKey {\n    id\n    keyId\n    enabled\n    lastUsedAt\n    createdAt\n    updatedAt\n  }\n": typeof types.ApiKeyFieldsFragmentDoc,
    "\n  query MyAPIKey {\n    myAPIKey {\n      ...APIKeyFields\n    }\n  }\n": typeof types.MyApiKeyDocument,
    "\n  mutation CreateMyAPIKey {\n    createMyAPIKey {\n      apiKey {\n        ...APIKeyFields\n      }\n      token\n    }\n  }\n": typeof types.CreateMyApiKeyDocument,
    "\n  mutation RegenerateMyAPIKey {\n    regenerateMyAPIKey {\n      apiKey {\n        ...APIKeyFields\n      }\n      token\n    }\n  }\n": typeof types.RegenerateMyApiKeyDocument,
    "\n  mutation SetMyAPIKeyEnabled($enabled: Boolean!) {\n    setMyAPIKeyEnabled(enabled: $enabled) {\n      ...APIKeyFields\n    }\n  }\n": typeof types.SetMyApiKeyEnabledDocument,
    "\n  mutation DeleteMyAPIKey {\n    deleteMyAPIKey\n  }\n": typeof types.DeleteMyApiKeyDocument,
    "\n  fragment CredentialCommentFields on CredentialComment {\n    id\n    text\n    createdAt\n    updatedAt\n    author {\n      id\n      username\n    }\n  }\n": typeof types.CredentialCommentFieldsFragmentDoc,
    "\n  fragment CredentialFields on Credential {\n    id\n    operationId\n    name\n    type\n    username\n    password\n    keys {\n      name\n      content\n    }\n    isValid\n    tags\n    comments {\n      ...CredentialCommentFields\n    }\n    createdBy {\n      id\n      username\n    }\n    backlinkCount\n    createdAt\n    updatedAt\n  }\n": typeof types.CredentialFieldsFragmentDoc,
    "\n  fragment CredentialFieldsWithOperation on Credential {\n    ...CredentialFields\n    operation {\n      id\n      name\n    }\n  }\n": typeof types.CredentialFieldsWithOperationFragmentDoc,
    "\n  query Credential($id: ID!) {\n    credential(id: $id) {\n      ...CredentialFields\n    }\n  }\n": typeof types.CredentialDocument,
    "\n  query Credentials(\n    $operationId: ID!\n    $search: String\n    $type: CredentialType\n    $tags: [String!]\n    $validOnly: Boolean\n    $first: Int\n    $after: String\n  ) {\n    credentials(\n      operationId: $operationId\n      search: $search\n      type: $type\n      tags: $tags\n      validOnly: $validOnly\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...CredentialFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n": typeof types.CredentialsDocument,
    "\n  query CredentialTags($operationId: ID!) {\n    credentialTags(operationId: $operationId)\n  }\n": typeof types.CredentialTagsDocument,
    "\n  query CredentialBacklinks($credentialId: ID!) {\n    wikiDocumentsReferencingCredential(credentialId: $credentialId) {\n      ...WikiDocumentBacklinkFields\n    }\n  }\n": typeof types.CredentialBacklinksDocument,
    "\n  query MyCredentials(\n    $operationIds: [ID!]\n    $search: String\n    $type: CredentialType\n    $tags: [String!]\n    $validOnly: Boolean\n    $first: Int\n    $after: String\n  ) {\n    myCredentials(\n      operationIds: $operationIds\n      search: $search\n      type: $type\n      tags: $tags\n      validOnly: $validOnly\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...CredentialFieldsWithOperation\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n": typeof types.MyCredentialsDocument,
    "\n  query MyCredentialTags($operationIds: [ID!]) {\n    myCredentialTags(operationIds: $operationIds)\n  }\n": typeof types.MyCredentialTagsDocument,
    "\n  mutation CreateCredential($operationId: ID!, $input: CreateCredentialInput!) {\n    createCredential(operationId: $operationId, input: $input) {\n      ...CredentialFields\n    }\n  }\n": typeof types.CreateCredentialDocument,
    "\n  mutation UpdateCredential($id: ID!, $input: UpdateCredentialInput!) {\n    updateCredential(id: $id, input: $input) {\n      ...CredentialFields\n    }\n  }\n": typeof types.UpdateCredentialDocument,
    "\n  mutation DeleteCredential($id: ID!) {\n    deleteCredential(id: $id)\n  }\n": typeof types.DeleteCredentialDocument,
    "\n  mutation AddCredentialComment($credentialId: ID!, $text: String!) {\n    addCredentialComment(credentialId: $credentialId, text: $text) {\n      ...CredentialFields\n    }\n  }\n": typeof types.AddCredentialCommentDocument,
    "\n  mutation UpdateCredentialComment(\n    $credentialId: ID!\n    $commentId: ID!\n    $text: String!\n  ) {\n    updateCredentialComment(\n      credentialId: $credentialId\n      commentId: $commentId\n      text: $text\n    ) {\n      ...CredentialFields\n    }\n  }\n": typeof types.UpdateCredentialCommentDocument,
    "\n  mutation DeleteCredentialComment($credentialId: ID!, $commentId: ID!) {\n    deleteCredentialComment(credentialId: $credentialId, commentId: $commentId) {\n      ...CredentialFields\n    }\n  }\n": typeof types.DeleteCredentialCommentDocument,
    "\n  subscription CredentialChanged($operationId: ID!) {\n    credentialChanged(operationId: $operationId) {\n      action\n      credentialId\n      operationId\n      credential {\n        ...CredentialFields\n      }\n    }\n  }\n": typeof types.CredentialChangedDocument,
    "\n  subscription MyCredentialChanged($operationIds: [ID!]) {\n    myCredentialChanged(operationIds: $operationIds) {\n      action\n      credentialId\n      operationId\n      credential {\n        ...CredentialFieldsWithOperation\n      }\n    }\n  }\n": typeof types.MyCredentialChangedDocument,
    "\n  fragment OperationMemberFields on OperationMember {\n    user {\n      id\n      username\n      roles\n      active\n      createdAt\n      updatedAt\n    }\n    role\n  }\n": typeof types.OperationMemberFieldsFragmentDoc,
    "\n  fragment OperationFields on Operation {\n    id\n    name\n    description\n    members {\n      ...OperationMemberFields\n    }\n    createdAt\n    updatedAt\n  }\n": typeof types.OperationFieldsFragmentDoc,
    "\n  query Operation($id: ID!) {\n    operation(id: $id) {\n      ...OperationFields\n    }\n  }\n": typeof types.OperationDocument,
    "\n  query Operations($search: String, $first: Int, $after: String) {\n    operations(search: $search, first: $first, after: $after) {\n      edges {\n        node {\n          ...OperationFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n": typeof types.OperationsDocument,
    "\n  query MyOperationRole($operationId: ID!) {\n    myOperationRole(operationId: $operationId)\n  }\n": typeof types.MyOperationRoleDocument,
    "\n  mutation CreateOperation($input: CreateOperationInput!) {\n    createOperation(input: $input) {\n      ...OperationFields\n    }\n  }\n": typeof types.CreateOperationDocument,
    "\n  mutation UpdateOperation($id: ID!, $input: UpdateOperationInput!) {\n    updateOperation(id: $id, input: $input) {\n      ...OperationFields\n    }\n  }\n": typeof types.UpdateOperationDocument,
    "\n  mutation DeleteOperation($id: ID!) {\n    deleteOperation(id: $id)\n  }\n": typeof types.DeleteOperationDocument,
    "\n  mutation AddOperationMember($operationId: ID!, $userId: ID!, $role: OperationRole!) {\n    addOperationMember(operationId: $operationId, userId: $userId, role: $role) {\n      ...OperationFields\n    }\n  }\n": typeof types.AddOperationMemberDocument,
    "\n  mutation RemoveOperationMember($operationId: ID!, $userId: ID!) {\n    removeOperationMember(operationId: $operationId, userId: $userId) {\n      ...OperationFields\n    }\n  }\n": typeof types.RemoveOperationMemberDocument,
    "\n  mutation UpdateOperationMemberRole($operationId: ID!, $userId: ID!, $role: OperationRole!) {\n    updateOperationMemberRole(operationId: $operationId, userId: $userId, role: $role) {\n      ...OperationFields\n    }\n  }\n": typeof types.UpdateOperationMemberRoleDocument,
    "\n  query UserSuggestions($search: String!, $first: Int) {\n    userSuggestions(search: $search, first: $first) {\n      id\n      username\n    }\n  }\n": typeof types.UserSuggestionsDocument,
    "\n  subscription OperationChanged($operationId: ID) {\n    operationChanged(operationId: $operationId) {\n      action\n      operationId\n      name\n      operation {\n        ...OperationFields\n      }\n    }\n  }\n": typeof types.OperationChangedDocument,
    "\n  subscription OperationMemberChanged($operationId: ID) {\n    operationMemberChanged(operationId: $operationId) {\n      action\n      operationId\n      userId\n    }\n  }\n": typeof types.OperationMemberChangedDocument,
    "\n  fragment SessionFields on Session {\n    id\n    userId\n    user {\n      id\n      username\n    }\n    ipAddress\n    userAgent\n    browser\n    os\n    device\n    status\n    lastActivityAt\n    isCurrent\n    createdAt\n    updatedAt\n  }\n": typeof types.SessionFieldsFragmentDoc,
    "\n  query MySessions($activeOnly: Boolean, $first: Int, $after: String) {\n    mySessions(activeOnly: $activeOnly, first: $first, after: $after) {\n      edges {\n        node {\n          ...SessionFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n": typeof types.MySessionsDocument,
    "\n  query Sessions($userId: ID, $search: String, $activeOnly: Boolean, $first: Int, $after: String) {\n    sessions(userId: $userId, search: $search, activeOnly: $activeOnly, first: $first, after: $after) {\n      edges {\n        node {\n          ...SessionFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n": typeof types.SessionsDocument,
    "\n  query Session($id: ID!) {\n    session(id: $id) {\n      ...SessionFields\n    }\n  }\n": typeof types.SessionDocument,
    "\n  mutation RevokeSession($id: ID!) {\n    revokeSession(id: $id)\n  }\n": typeof types.RevokeSessionDocument,
    "\n  mutation RevokeAllMySessions {\n    revokeAllMySessions\n  }\n": typeof types.RevokeAllMySessionsDocument,
    "\n  mutation AdminRevokeSession($id: ID!) {\n    adminRevokeSession(id: $id)\n  }\n": typeof types.AdminRevokeSessionDocument,
    "\n  mutation AdminRevokeAllUserSessions($userId: ID!) {\n    adminRevokeAllUserSessions(userId: $userId)\n  }\n": typeof types.AdminRevokeAllUserSessionsDocument,
    "\n  subscription MySessionChanged {\n    mySessionChanged {\n      action\n      sessionId\n      userId\n      session {\n        ...SessionFields\n      }\n    }\n  }\n": typeof types.MySessionChangedDocument,
    "\n  subscription SessionChanged($userId: ID) {\n    sessionChanged(userId: $userId) {\n      action\n      sessionId\n      userId\n      session {\n        ...SessionFields\n      }\n    }\n  }\n": typeof types.SessionChangedDocument,
    "\n  fragment TimelineEventFields on TimelineEvent {\n    id\n    operationId\n    topic\n    subjectKind\n    subjectId\n    subjectName\n    occurredAt\n    metadata\n    actor {\n      id\n      username\n    }\n  }\n": typeof types.TimelineEventFieldsFragmentDoc,
    "\n  query TimelineBuckets(\n    $operationId: ID!\n    $granularity: TimelineGranularity = DAY\n    $timezone: String!\n    $from: String\n    $to: String\n    $types: [String!]\n    $actorIds: [ID!]\n  ) {\n    timelineBuckets(\n      operationId: $operationId\n      granularity: $granularity\n      timezone: $timezone\n      from: $from\n      to: $to\n      types: $types\n      actorIds: $actorIds\n    ) {\n      bucketStart\n      count\n      topicCounts {\n        topic\n        subjectKind\n        count\n      }\n    }\n  }\n": typeof types.TimelineBucketsDocument,
    "\n  query TimelineEventsByDay(\n    $operationId: ID!\n    $date: String!\n    $timezone: String!\n    $granularity: TimelineGranularity = DAY\n    $types: [String!]\n    $actorIds: [ID!]\n    $first: Int = 100\n    $after: String\n  ) {\n    timelineEventsByDay(\n      operationId: $operationId\n      date: $date\n      timezone: $timezone\n      granularity: $granularity\n      types: $types\n      actorIds: $actorIds\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...TimelineEventFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n    }\n  }\n": typeof types.TimelineEventsByDayDocument,
    "\n  subscription TimelineEventAdded($operationId: ID!) {\n    timelineEventAdded(operationId: $operationId) {\n      ...TimelineEventFields\n    }\n  }\n": typeof types.TimelineEventAddedDocument,
    "\n  mutation CreateCustomTimelineEvent(\n    $operationId: ID!\n    $input: CreateCustomTimelineEventInput!\n  ) {\n    createCustomTimelineEvent(operationId: $operationId, input: $input) {\n      ...TimelineEventFields\n    }\n  }\n": typeof types.CreateCustomTimelineEventDocument,
    "\n  mutation UpdateCustomTimelineEvent(\n    $id: ID!\n    $input: UpdateCustomTimelineEventInput!\n  ) {\n    updateCustomTimelineEvent(id: $id, input: $input) {\n      ...TimelineEventFields\n    }\n  }\n": typeof types.UpdateCustomTimelineEventDocument,
    "\n  mutation DeleteCustomTimelineEvent($id: ID!) {\n    deleteCustomTimelineEvent(id: $id)\n  }\n": typeof types.DeleteCustomTimelineEventDocument,
    "\n  fragment UserFields on User {\n    id\n    username\n    roles\n    active\n    createdAt\n    updatedAt\n  }\n": typeof types.UserFieldsFragmentDoc,
    "\n  query Me {\n    me {\n      ...UserFields\n    }\n  }\n": typeof types.MeDocument,
    "\n  query User($id: ID!) {\n    user(id: $id) {\n      ...UserFields\n    }\n  }\n": typeof types.UserDocument,
    "\n  query Users($search: String, $first: Int, $after: String) {\n    users(search: $search, first: $first, after: $after) {\n      edges {\n        node {\n          ...UserFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n": typeof types.UsersDocument,
    "\n  mutation CreateUser($input: CreateUserInput!) {\n    createUser(input: $input) {\n      ...UserFields\n    }\n  }\n": typeof types.CreateUserDocument,
    "\n  mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {\n    updateUser(id: $id, input: $input) {\n      ...UserFields\n    }\n  }\n": typeof types.UpdateUserDocument,
    "\n  mutation DeleteUser($id: ID!) {\n    deleteUser(id: $id)\n  }\n": typeof types.DeleteUserDocument,
    "\n  mutation UpdateOwnProfile($input: UpdateUserInput!) {\n    updateOwnProfile(input: $input) {\n      ...UserFields\n    }\n  }\n": typeof types.UpdateOwnProfileDocument,
    "\n  subscription UserChanged {\n    userChanged {\n      action\n      userId\n      username\n      user {\n        ...UserFields\n      }\n    }\n  }\n": typeof types.UserChangedDocument,
    "\n  fragment WikiDocumentTreeFields on WikiDocument {\n    id\n    parentDocumentId\n    title\n    emoji\n    icon\n    color\n    sortOrder\n    childCount\n    lastUpdatedAt\n    updatedAt\n  }\n": typeof types.WikiDocumentTreeFieldsFragmentDoc,
    "\n  fragment WikiDocumentLiteFields on WikiDocument {\n    id\n    title\n    emoji\n    icon\n    color\n    deletedAt\n  }\n": typeof types.WikiDocumentLiteFieldsFragmentDoc,
    "\n  fragment WikiDocumentBacklinkFields on WikiDocument {\n    id\n    title\n    emoji\n    icon\n    color\n    updatedAt\n    ancestors { id title emoji icon color isDeleted }\n  }\n": typeof types.WikiDocumentBacklinkFieldsFragmentDoc,
    "\n  fragment WikiDocumentFields on WikiDocument {\n    id\n    operationId\n    parentDocumentId\n    ancestors { id title emoji icon color isDeleted }\n    title\n    content\n    emoji\n    color\n    icon\n    sortOrder\n    createdBy { id username }\n    lastUpdatedBy { id username }\n    lastUpdatedAt\n    lastBackupAt\n    createdAt\n    updatedAt\n  }\n": typeof types.WikiDocumentFieldsFragmentDoc,
    "\n  fragment WikiDocumentBackupListFields on WikiDocumentBackup {\n    id\n    documentId\n    title\n    trigger\n    description\n    contentLength\n    createdBy { id username }\n    createdAt\n  }\n": typeof types.WikiDocumentBackupListFieldsFragmentDoc,
    "\n  fragment WikiDocumentBackupDetailFields on WikiDocumentBackup {\n    id\n    documentId\n    title\n    content\n    contentLength\n    trigger\n    description\n    createdBy { id username }\n    createdAt\n  }\n": typeof types.WikiDocumentBackupDetailFieldsFragmentDoc,
    "\n  fragment WikiDocumentVisitListFields on WikiDocumentVisit {\n    id\n    visitedAt\n    document {\n      id\n      title\n      emoji\n      icon\n      color\n      ancestors { id title emoji icon color isDeleted }\n    }\n  }\n": typeof types.WikiDocumentVisitListFieldsFragmentDoc,
    "\n  query WikiDocumentTree($operationId: ID!) {\n    wikiDocumentTree(operationId: $operationId) {\n      ...WikiDocumentTreeFields\n    }\n  }\n": typeof types.WikiDocumentTreeDocument,
    "\n  query WikiDocumentChildren($operationId: ID!, $parentDocumentId: ID) {\n    wikiDocumentChildren(\n      operationId: $operationId\n      parentDocumentId: $parentDocumentId\n    ) {\n      ...WikiDocumentTreeFields\n    }\n  }\n": typeof types.WikiDocumentChildrenDocument,
    "\n  query WikiDocumentTreeRevealPath($documentId: ID!) {\n    wikiDocumentTreeRevealPath(documentId: $documentId) {\n      ...WikiDocumentTreeFields\n    }\n  }\n": typeof types.WikiDocumentTreeRevealPathDocument,
    "\n  query WikiDocumentTrashCount($operationId: ID!) {\n    wikiDocumentTrashCount(operationId: $operationId)\n  }\n": typeof types.WikiDocumentTrashCountDocument,
    "\n  query WikiDocument($id: ID!) {\n    wikiDocument(id: $id) {\n      ...WikiDocumentFields\n    }\n  }\n": typeof types.WikiDocumentDocument,
    "\n  query WikiDocuments(\n    $operationId: ID!\n    $parentDocumentId: ID\n    $search: String\n    $first: Int\n    $after: String\n  ) {\n    wikiDocuments(\n      operationId: $operationId\n      parentDocumentId: $parentDocumentId\n      search: $search\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          id\n          operationId\n          parentDocumentId\n          title\n          emoji\n          icon\n          color\n          sortOrder\n          createdBy { id username }\n          createdAt\n          updatedAt\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n": typeof types.WikiDocumentsDocument,
    "\n  query WikiRecentDocuments(\n    $operationId: ID!\n    $sort: WikiDocumentSort\n    $first: Int\n    $after: String\n  ) {\n    wikiDocuments(\n      operationId: $operationId\n      sort: $sort\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          id\n          title\n          emoji\n          icon\n          color\n          parentDocumentId\n          ancestors { id title emoji icon color isDeleted }\n          createdAt\n          updatedAt\n          lastUpdatedAt\n          createdBy { id username }\n          lastUpdatedBy { id username }\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n": typeof types.WikiRecentDocumentsDocument,
    "\n  query WikiSearch(\n    $operationId: ID!\n    $scope: ID\n    $query: String!\n    $offset: Int\n    $limit: Int\n  ) {\n    wikiSearch(\n      operationId: $operationId\n      scope: $scope\n      query: $query\n      offset: $offset\n      limit: $limit\n    ) {\n      hits {\n        document {\n          id\n          title\n          emoji\n          icon\n          color\n          parentDocumentId\n          ancestors { id title emoji icon color isDeleted }\n          createdBy { id username }\n        }\n        snippet\n        matchRanges { start end }\n        score\n      }\n      total\n      hasMore\n    }\n  }\n": typeof types.WikiSearchDocument,
    "\n  query WikiDocumentLite($id: ID!) {\n    wikiDocument(id: $id) {\n      ...WikiDocumentLiteFields\n    }\n  }\n": typeof types.WikiDocumentLiteDocument,
    "\n  query WikiDocumentBacklinks($documentId: ID!) {\n    wikiDocumentBacklinks(documentId: $documentId) {\n      ...WikiDocumentBacklinkFields\n    }\n  }\n": typeof types.WikiDocumentBacklinksDocument,
    "\n  query WikiDocumentTrash($operationId: ID!, $first: Int, $after: String) {\n    wikiDocumentTrash(operationId: $operationId, first: $first, after: $after) {\n      edges {\n        node {\n          id\n          title\n          emoji\n          icon\n          color\n          deletedAt\n          deletedBy { id username }\n          createdAt\n          ancestors { id title emoji icon color isDeleted }\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n": typeof types.WikiDocumentTrashDocument,
    "\n  query WikiDocumentBackups($documentId: ID!, $first: Int, $after: String) {\n    wikiDocumentBackups(documentId: $documentId, first: $first, after: $after) {\n      edges {\n        node {\n          ...WikiDocumentBackupListFields\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n": typeof types.WikiDocumentBackupsDocument,
    "\n  query WikiDocumentBackupDetail($id: ID!) {\n    wikiDocumentBackup(id: $id) {\n      ...WikiDocumentBackupDetailFields\n    }\n  }\n": typeof types.WikiDocumentBackupDetailDocument,
    "\n  query WikiDocumentPresence($documentId: ID!) {\n    wikiDocumentPresence(documentId: $documentId) {\n      documentId\n      activeEditors { userId username connectedAt }\n    }\n  }\n": typeof types.WikiDocumentPresenceDocument,
    "\n  query WikiOperationPresence($operationId: ID!) {\n    wikiOperationPresence(operationId: $operationId) {\n      documentId\n      activeEditors { userId username connectedAt }\n    }\n  }\n": typeof types.WikiOperationPresenceDocument,
    "\n  query WikiDocumentHistory($operationId: ID!, $offset: Int, $limit: Int) {\n    wikiDocumentHistory(operationId: $operationId, offset: $offset, limit: $limit) {\n      edges {\n        node {\n          ...WikiDocumentVisitListFields\n        }\n      }\n      totalCount\n    }\n  }\n": typeof types.WikiDocumentHistoryDocument,
    "\n  mutation CreateWikiDocument($operationId: ID!, $input: CreateWikiDocumentInput!) {\n    createWikiDocument(operationId: $operationId, input: $input) {\n      id operationId title emoji color icon sortOrder\n      parentDocumentId\n      createdBy { id username }\n      createdAt updatedAt\n    }\n  }\n": typeof types.CreateWikiDocumentDocument,
    "\n  mutation UpdateWikiDocument($id: ID!, $input: UpdateWikiDocumentInput!) {\n    updateWikiDocument(id: $id, input: $input) {\n      id title emoji color icon sortOrder\n      parentDocumentId\n      updatedAt\n    }\n  }\n": typeof types.UpdateWikiDocumentDocument,
    "\n  mutation ReorderWikiDocumentSiblings($input: ReorderWikiDocumentSiblingsInput!) {\n    reorderWikiDocumentSiblings(input: $input) {\n      id sortOrder parentDocumentId updatedAt\n    }\n  }\n": typeof types.ReorderWikiDocumentSiblingsDocument,
    "\n  mutation DeleteWikiDocument($id: ID!) {\n    deleteWikiDocument(id: $id)\n  }\n": typeof types.DeleteWikiDocumentDocument,
    "\n  mutation DuplicateWikiDocument($id: ID!, $withChildren: Boolean) {\n    duplicateWikiDocument(id: $id, withChildren: $withChildren) {\n      id operationId title emoji color icon sortOrder\n      parentDocumentId\n      createdAt updatedAt\n    }\n  }\n": typeof types.DuplicateWikiDocumentDocument,
    "\n  mutation RestoreWikiDocument($id: ID!, $cascade: Boolean) {\n    restoreWikiDocument(id: $id, cascade: $cascade) {\n      id operationId title emoji icon color sortOrder\n      parentDocumentId\n    }\n  }\n": typeof types.RestoreWikiDocumentDocument,
    "\n  query WikiDocumentTrashedDescendants($documentId: ID!) {\n    wikiDocumentTrashedDescendants(documentId: $documentId) {\n      id title emoji icon color\n    }\n  }\n": typeof types.WikiDocumentTrashedDescendantsDocument,
    "\n  mutation PermanentlyDeleteWikiDocument($id: ID!) {\n    permanentlyDeleteWikiDocument(id: $id)\n  }\n": typeof types.PermanentlyDeleteWikiDocumentDocument,
    "\n  mutation EmptyWikiDocumentTrash($operationId: ID!) {\n    emptyWikiDocumentTrash(operationId: $operationId)\n  }\n": typeof types.EmptyWikiDocumentTrashDocument,
    "\n  mutation CreateWikiDocumentBackup($documentId: ID!, $description: String) {\n    createWikiDocumentBackup(documentId: $documentId, description: $description) {\n      id documentId title trigger description\n      createdBy { id username }\n      createdAt\n    }\n  }\n": typeof types.CreateWikiDocumentBackupDocument,
    "\n  mutation RestoreWikiDocumentBackup($documentId: ID!, $backupId: ID!) {\n    restoreWikiDocumentBackup(documentId: $documentId, backupId: $backupId) {\n      id title content\n    }\n  }\n": typeof types.RestoreWikiDocumentBackupDocument,
    "\n  mutation DeleteWikiDocumentBackup($id: ID!) {\n    deleteWikiDocumentBackup(id: $id)\n  }\n": typeof types.DeleteWikiDocumentBackupDocument,
    "\n  mutation TrackWikiDocumentVisit($documentId: ID!) {\n    trackWikiDocumentVisit(documentId: $documentId) {\n      id\n      visitedAt\n    }\n  }\n": typeof types.TrackWikiDocumentVisitDocument,
    "\n  subscription WikiDocumentChanged($operationId: ID!) {\n    wikiDocumentChanged(operationId: $operationId) {\n      action\n      documentId\n      operationId\n      parentDocumentId\n      previousParentDocumentId\n      document { id title emoji icon color sortOrder parentDocument { id } }\n    }\n  }\n": typeof types.WikiDocumentChangedDocument,
    "\n  subscription WikiDocumentPresenceChanged($operationId: ID!) {\n    wikiDocumentPresenceChanged(operationId: $operationId) {\n      documentId operationId userId username action\n    }\n  }\n": typeof types.WikiDocumentPresenceChangedDocument,
};
const documents: Documents = {
    "\n  fragment APIKeyFields on APIKey {\n    id\n    keyId\n    enabled\n    lastUsedAt\n    createdAt\n    updatedAt\n  }\n": types.ApiKeyFieldsFragmentDoc,
    "\n  query MyAPIKey {\n    myAPIKey {\n      ...APIKeyFields\n    }\n  }\n": types.MyApiKeyDocument,
    "\n  mutation CreateMyAPIKey {\n    createMyAPIKey {\n      apiKey {\n        ...APIKeyFields\n      }\n      token\n    }\n  }\n": types.CreateMyApiKeyDocument,
    "\n  mutation RegenerateMyAPIKey {\n    regenerateMyAPIKey {\n      apiKey {\n        ...APIKeyFields\n      }\n      token\n    }\n  }\n": types.RegenerateMyApiKeyDocument,
    "\n  mutation SetMyAPIKeyEnabled($enabled: Boolean!) {\n    setMyAPIKeyEnabled(enabled: $enabled) {\n      ...APIKeyFields\n    }\n  }\n": types.SetMyApiKeyEnabledDocument,
    "\n  mutation DeleteMyAPIKey {\n    deleteMyAPIKey\n  }\n": types.DeleteMyApiKeyDocument,
    "\n  fragment CredentialCommentFields on CredentialComment {\n    id\n    text\n    createdAt\n    updatedAt\n    author {\n      id\n      username\n    }\n  }\n": types.CredentialCommentFieldsFragmentDoc,
    "\n  fragment CredentialFields on Credential {\n    id\n    operationId\n    name\n    type\n    username\n    password\n    keys {\n      name\n      content\n    }\n    isValid\n    tags\n    comments {\n      ...CredentialCommentFields\n    }\n    createdBy {\n      id\n      username\n    }\n    backlinkCount\n    createdAt\n    updatedAt\n  }\n": types.CredentialFieldsFragmentDoc,
    "\n  fragment CredentialFieldsWithOperation on Credential {\n    ...CredentialFields\n    operation {\n      id\n      name\n    }\n  }\n": types.CredentialFieldsWithOperationFragmentDoc,
    "\n  query Credential($id: ID!) {\n    credential(id: $id) {\n      ...CredentialFields\n    }\n  }\n": types.CredentialDocument,
    "\n  query Credentials(\n    $operationId: ID!\n    $search: String\n    $type: CredentialType\n    $tags: [String!]\n    $validOnly: Boolean\n    $first: Int\n    $after: String\n  ) {\n    credentials(\n      operationId: $operationId\n      search: $search\n      type: $type\n      tags: $tags\n      validOnly: $validOnly\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...CredentialFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n": types.CredentialsDocument,
    "\n  query CredentialTags($operationId: ID!) {\n    credentialTags(operationId: $operationId)\n  }\n": types.CredentialTagsDocument,
    "\n  query CredentialBacklinks($credentialId: ID!) {\n    wikiDocumentsReferencingCredential(credentialId: $credentialId) {\n      ...WikiDocumentBacklinkFields\n    }\n  }\n": types.CredentialBacklinksDocument,
    "\n  query MyCredentials(\n    $operationIds: [ID!]\n    $search: String\n    $type: CredentialType\n    $tags: [String!]\n    $validOnly: Boolean\n    $first: Int\n    $after: String\n  ) {\n    myCredentials(\n      operationIds: $operationIds\n      search: $search\n      type: $type\n      tags: $tags\n      validOnly: $validOnly\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...CredentialFieldsWithOperation\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n": types.MyCredentialsDocument,
    "\n  query MyCredentialTags($operationIds: [ID!]) {\n    myCredentialTags(operationIds: $operationIds)\n  }\n": types.MyCredentialTagsDocument,
    "\n  mutation CreateCredential($operationId: ID!, $input: CreateCredentialInput!) {\n    createCredential(operationId: $operationId, input: $input) {\n      ...CredentialFields\n    }\n  }\n": types.CreateCredentialDocument,
    "\n  mutation UpdateCredential($id: ID!, $input: UpdateCredentialInput!) {\n    updateCredential(id: $id, input: $input) {\n      ...CredentialFields\n    }\n  }\n": types.UpdateCredentialDocument,
    "\n  mutation DeleteCredential($id: ID!) {\n    deleteCredential(id: $id)\n  }\n": types.DeleteCredentialDocument,
    "\n  mutation AddCredentialComment($credentialId: ID!, $text: String!) {\n    addCredentialComment(credentialId: $credentialId, text: $text) {\n      ...CredentialFields\n    }\n  }\n": types.AddCredentialCommentDocument,
    "\n  mutation UpdateCredentialComment(\n    $credentialId: ID!\n    $commentId: ID!\n    $text: String!\n  ) {\n    updateCredentialComment(\n      credentialId: $credentialId\n      commentId: $commentId\n      text: $text\n    ) {\n      ...CredentialFields\n    }\n  }\n": types.UpdateCredentialCommentDocument,
    "\n  mutation DeleteCredentialComment($credentialId: ID!, $commentId: ID!) {\n    deleteCredentialComment(credentialId: $credentialId, commentId: $commentId) {\n      ...CredentialFields\n    }\n  }\n": types.DeleteCredentialCommentDocument,
    "\n  subscription CredentialChanged($operationId: ID!) {\n    credentialChanged(operationId: $operationId) {\n      action\n      credentialId\n      operationId\n      credential {\n        ...CredentialFields\n      }\n    }\n  }\n": types.CredentialChangedDocument,
    "\n  subscription MyCredentialChanged($operationIds: [ID!]) {\n    myCredentialChanged(operationIds: $operationIds) {\n      action\n      credentialId\n      operationId\n      credential {\n        ...CredentialFieldsWithOperation\n      }\n    }\n  }\n": types.MyCredentialChangedDocument,
    "\n  fragment OperationMemberFields on OperationMember {\n    user {\n      id\n      username\n      roles\n      active\n      createdAt\n      updatedAt\n    }\n    role\n  }\n": types.OperationMemberFieldsFragmentDoc,
    "\n  fragment OperationFields on Operation {\n    id\n    name\n    description\n    members {\n      ...OperationMemberFields\n    }\n    createdAt\n    updatedAt\n  }\n": types.OperationFieldsFragmentDoc,
    "\n  query Operation($id: ID!) {\n    operation(id: $id) {\n      ...OperationFields\n    }\n  }\n": types.OperationDocument,
    "\n  query Operations($search: String, $first: Int, $after: String) {\n    operations(search: $search, first: $first, after: $after) {\n      edges {\n        node {\n          ...OperationFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n": types.OperationsDocument,
    "\n  query MyOperationRole($operationId: ID!) {\n    myOperationRole(operationId: $operationId)\n  }\n": types.MyOperationRoleDocument,
    "\n  mutation CreateOperation($input: CreateOperationInput!) {\n    createOperation(input: $input) {\n      ...OperationFields\n    }\n  }\n": types.CreateOperationDocument,
    "\n  mutation UpdateOperation($id: ID!, $input: UpdateOperationInput!) {\n    updateOperation(id: $id, input: $input) {\n      ...OperationFields\n    }\n  }\n": types.UpdateOperationDocument,
    "\n  mutation DeleteOperation($id: ID!) {\n    deleteOperation(id: $id)\n  }\n": types.DeleteOperationDocument,
    "\n  mutation AddOperationMember($operationId: ID!, $userId: ID!, $role: OperationRole!) {\n    addOperationMember(operationId: $operationId, userId: $userId, role: $role) {\n      ...OperationFields\n    }\n  }\n": types.AddOperationMemberDocument,
    "\n  mutation RemoveOperationMember($operationId: ID!, $userId: ID!) {\n    removeOperationMember(operationId: $operationId, userId: $userId) {\n      ...OperationFields\n    }\n  }\n": types.RemoveOperationMemberDocument,
    "\n  mutation UpdateOperationMemberRole($operationId: ID!, $userId: ID!, $role: OperationRole!) {\n    updateOperationMemberRole(operationId: $operationId, userId: $userId, role: $role) {\n      ...OperationFields\n    }\n  }\n": types.UpdateOperationMemberRoleDocument,
    "\n  query UserSuggestions($search: String!, $first: Int) {\n    userSuggestions(search: $search, first: $first) {\n      id\n      username\n    }\n  }\n": types.UserSuggestionsDocument,
    "\n  subscription OperationChanged($operationId: ID) {\n    operationChanged(operationId: $operationId) {\n      action\n      operationId\n      name\n      operation {\n        ...OperationFields\n      }\n    }\n  }\n": types.OperationChangedDocument,
    "\n  subscription OperationMemberChanged($operationId: ID) {\n    operationMemberChanged(operationId: $operationId) {\n      action\n      operationId\n      userId\n    }\n  }\n": types.OperationMemberChangedDocument,
    "\n  fragment SessionFields on Session {\n    id\n    userId\n    user {\n      id\n      username\n    }\n    ipAddress\n    userAgent\n    browser\n    os\n    device\n    status\n    lastActivityAt\n    isCurrent\n    createdAt\n    updatedAt\n  }\n": types.SessionFieldsFragmentDoc,
    "\n  query MySessions($activeOnly: Boolean, $first: Int, $after: String) {\n    mySessions(activeOnly: $activeOnly, first: $first, after: $after) {\n      edges {\n        node {\n          ...SessionFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n": types.MySessionsDocument,
    "\n  query Sessions($userId: ID, $search: String, $activeOnly: Boolean, $first: Int, $after: String) {\n    sessions(userId: $userId, search: $search, activeOnly: $activeOnly, first: $first, after: $after) {\n      edges {\n        node {\n          ...SessionFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n": types.SessionsDocument,
    "\n  query Session($id: ID!) {\n    session(id: $id) {\n      ...SessionFields\n    }\n  }\n": types.SessionDocument,
    "\n  mutation RevokeSession($id: ID!) {\n    revokeSession(id: $id)\n  }\n": types.RevokeSessionDocument,
    "\n  mutation RevokeAllMySessions {\n    revokeAllMySessions\n  }\n": types.RevokeAllMySessionsDocument,
    "\n  mutation AdminRevokeSession($id: ID!) {\n    adminRevokeSession(id: $id)\n  }\n": types.AdminRevokeSessionDocument,
    "\n  mutation AdminRevokeAllUserSessions($userId: ID!) {\n    adminRevokeAllUserSessions(userId: $userId)\n  }\n": types.AdminRevokeAllUserSessionsDocument,
    "\n  subscription MySessionChanged {\n    mySessionChanged {\n      action\n      sessionId\n      userId\n      session {\n        ...SessionFields\n      }\n    }\n  }\n": types.MySessionChangedDocument,
    "\n  subscription SessionChanged($userId: ID) {\n    sessionChanged(userId: $userId) {\n      action\n      sessionId\n      userId\n      session {\n        ...SessionFields\n      }\n    }\n  }\n": types.SessionChangedDocument,
    "\n  fragment TimelineEventFields on TimelineEvent {\n    id\n    operationId\n    topic\n    subjectKind\n    subjectId\n    subjectName\n    occurredAt\n    metadata\n    actor {\n      id\n      username\n    }\n  }\n": types.TimelineEventFieldsFragmentDoc,
    "\n  query TimelineBuckets(\n    $operationId: ID!\n    $granularity: TimelineGranularity = DAY\n    $timezone: String!\n    $from: String\n    $to: String\n    $types: [String!]\n    $actorIds: [ID!]\n  ) {\n    timelineBuckets(\n      operationId: $operationId\n      granularity: $granularity\n      timezone: $timezone\n      from: $from\n      to: $to\n      types: $types\n      actorIds: $actorIds\n    ) {\n      bucketStart\n      count\n      topicCounts {\n        topic\n        subjectKind\n        count\n      }\n    }\n  }\n": types.TimelineBucketsDocument,
    "\n  query TimelineEventsByDay(\n    $operationId: ID!\n    $date: String!\n    $timezone: String!\n    $granularity: TimelineGranularity = DAY\n    $types: [String!]\n    $actorIds: [ID!]\n    $first: Int = 100\n    $after: String\n  ) {\n    timelineEventsByDay(\n      operationId: $operationId\n      date: $date\n      timezone: $timezone\n      granularity: $granularity\n      types: $types\n      actorIds: $actorIds\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...TimelineEventFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n    }\n  }\n": types.TimelineEventsByDayDocument,
    "\n  subscription TimelineEventAdded($operationId: ID!) {\n    timelineEventAdded(operationId: $operationId) {\n      ...TimelineEventFields\n    }\n  }\n": types.TimelineEventAddedDocument,
    "\n  mutation CreateCustomTimelineEvent(\n    $operationId: ID!\n    $input: CreateCustomTimelineEventInput!\n  ) {\n    createCustomTimelineEvent(operationId: $operationId, input: $input) {\n      ...TimelineEventFields\n    }\n  }\n": types.CreateCustomTimelineEventDocument,
    "\n  mutation UpdateCustomTimelineEvent(\n    $id: ID!\n    $input: UpdateCustomTimelineEventInput!\n  ) {\n    updateCustomTimelineEvent(id: $id, input: $input) {\n      ...TimelineEventFields\n    }\n  }\n": types.UpdateCustomTimelineEventDocument,
    "\n  mutation DeleteCustomTimelineEvent($id: ID!) {\n    deleteCustomTimelineEvent(id: $id)\n  }\n": types.DeleteCustomTimelineEventDocument,
    "\n  fragment UserFields on User {\n    id\n    username\n    roles\n    active\n    createdAt\n    updatedAt\n  }\n": types.UserFieldsFragmentDoc,
    "\n  query Me {\n    me {\n      ...UserFields\n    }\n  }\n": types.MeDocument,
    "\n  query User($id: ID!) {\n    user(id: $id) {\n      ...UserFields\n    }\n  }\n": types.UserDocument,
    "\n  query Users($search: String, $first: Int, $after: String) {\n    users(search: $search, first: $first, after: $after) {\n      edges {\n        node {\n          ...UserFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n": types.UsersDocument,
    "\n  mutation CreateUser($input: CreateUserInput!) {\n    createUser(input: $input) {\n      ...UserFields\n    }\n  }\n": types.CreateUserDocument,
    "\n  mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {\n    updateUser(id: $id, input: $input) {\n      ...UserFields\n    }\n  }\n": types.UpdateUserDocument,
    "\n  mutation DeleteUser($id: ID!) {\n    deleteUser(id: $id)\n  }\n": types.DeleteUserDocument,
    "\n  mutation UpdateOwnProfile($input: UpdateUserInput!) {\n    updateOwnProfile(input: $input) {\n      ...UserFields\n    }\n  }\n": types.UpdateOwnProfileDocument,
    "\n  subscription UserChanged {\n    userChanged {\n      action\n      userId\n      username\n      user {\n        ...UserFields\n      }\n    }\n  }\n": types.UserChangedDocument,
    "\n  fragment WikiDocumentTreeFields on WikiDocument {\n    id\n    parentDocumentId\n    title\n    emoji\n    icon\n    color\n    sortOrder\n    childCount\n    lastUpdatedAt\n    updatedAt\n  }\n": types.WikiDocumentTreeFieldsFragmentDoc,
    "\n  fragment WikiDocumentLiteFields on WikiDocument {\n    id\n    title\n    emoji\n    icon\n    color\n    deletedAt\n  }\n": types.WikiDocumentLiteFieldsFragmentDoc,
    "\n  fragment WikiDocumentBacklinkFields on WikiDocument {\n    id\n    title\n    emoji\n    icon\n    color\n    updatedAt\n    ancestors { id title emoji icon color isDeleted }\n  }\n": types.WikiDocumentBacklinkFieldsFragmentDoc,
    "\n  fragment WikiDocumentFields on WikiDocument {\n    id\n    operationId\n    parentDocumentId\n    ancestors { id title emoji icon color isDeleted }\n    title\n    content\n    emoji\n    color\n    icon\n    sortOrder\n    createdBy { id username }\n    lastUpdatedBy { id username }\n    lastUpdatedAt\n    lastBackupAt\n    createdAt\n    updatedAt\n  }\n": types.WikiDocumentFieldsFragmentDoc,
    "\n  fragment WikiDocumentBackupListFields on WikiDocumentBackup {\n    id\n    documentId\n    title\n    trigger\n    description\n    contentLength\n    createdBy { id username }\n    createdAt\n  }\n": types.WikiDocumentBackupListFieldsFragmentDoc,
    "\n  fragment WikiDocumentBackupDetailFields on WikiDocumentBackup {\n    id\n    documentId\n    title\n    content\n    contentLength\n    trigger\n    description\n    createdBy { id username }\n    createdAt\n  }\n": types.WikiDocumentBackupDetailFieldsFragmentDoc,
    "\n  fragment WikiDocumentVisitListFields on WikiDocumentVisit {\n    id\n    visitedAt\n    document {\n      id\n      title\n      emoji\n      icon\n      color\n      ancestors { id title emoji icon color isDeleted }\n    }\n  }\n": types.WikiDocumentVisitListFieldsFragmentDoc,
    "\n  query WikiDocumentTree($operationId: ID!) {\n    wikiDocumentTree(operationId: $operationId) {\n      ...WikiDocumentTreeFields\n    }\n  }\n": types.WikiDocumentTreeDocument,
    "\n  query WikiDocumentChildren($operationId: ID!, $parentDocumentId: ID) {\n    wikiDocumentChildren(\n      operationId: $operationId\n      parentDocumentId: $parentDocumentId\n    ) {\n      ...WikiDocumentTreeFields\n    }\n  }\n": types.WikiDocumentChildrenDocument,
    "\n  query WikiDocumentTreeRevealPath($documentId: ID!) {\n    wikiDocumentTreeRevealPath(documentId: $documentId) {\n      ...WikiDocumentTreeFields\n    }\n  }\n": types.WikiDocumentTreeRevealPathDocument,
    "\n  query WikiDocumentTrashCount($operationId: ID!) {\n    wikiDocumentTrashCount(operationId: $operationId)\n  }\n": types.WikiDocumentTrashCountDocument,
    "\n  query WikiDocument($id: ID!) {\n    wikiDocument(id: $id) {\n      ...WikiDocumentFields\n    }\n  }\n": types.WikiDocumentDocument,
    "\n  query WikiDocuments(\n    $operationId: ID!\n    $parentDocumentId: ID\n    $search: String\n    $first: Int\n    $after: String\n  ) {\n    wikiDocuments(\n      operationId: $operationId\n      parentDocumentId: $parentDocumentId\n      search: $search\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          id\n          operationId\n          parentDocumentId\n          title\n          emoji\n          icon\n          color\n          sortOrder\n          createdBy { id username }\n          createdAt\n          updatedAt\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n": types.WikiDocumentsDocument,
    "\n  query WikiRecentDocuments(\n    $operationId: ID!\n    $sort: WikiDocumentSort\n    $first: Int\n    $after: String\n  ) {\n    wikiDocuments(\n      operationId: $operationId\n      sort: $sort\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          id\n          title\n          emoji\n          icon\n          color\n          parentDocumentId\n          ancestors { id title emoji icon color isDeleted }\n          createdAt\n          updatedAt\n          lastUpdatedAt\n          createdBy { id username }\n          lastUpdatedBy { id username }\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n": types.WikiRecentDocumentsDocument,
    "\n  query WikiSearch(\n    $operationId: ID!\n    $scope: ID\n    $query: String!\n    $offset: Int\n    $limit: Int\n  ) {\n    wikiSearch(\n      operationId: $operationId\n      scope: $scope\n      query: $query\n      offset: $offset\n      limit: $limit\n    ) {\n      hits {\n        document {\n          id\n          title\n          emoji\n          icon\n          color\n          parentDocumentId\n          ancestors { id title emoji icon color isDeleted }\n          createdBy { id username }\n        }\n        snippet\n        matchRanges { start end }\n        score\n      }\n      total\n      hasMore\n    }\n  }\n": types.WikiSearchDocument,
    "\n  query WikiDocumentLite($id: ID!) {\n    wikiDocument(id: $id) {\n      ...WikiDocumentLiteFields\n    }\n  }\n": types.WikiDocumentLiteDocument,
    "\n  query WikiDocumentBacklinks($documentId: ID!) {\n    wikiDocumentBacklinks(documentId: $documentId) {\n      ...WikiDocumentBacklinkFields\n    }\n  }\n": types.WikiDocumentBacklinksDocument,
    "\n  query WikiDocumentTrash($operationId: ID!, $first: Int, $after: String) {\n    wikiDocumentTrash(operationId: $operationId, first: $first, after: $after) {\n      edges {\n        node {\n          id\n          title\n          emoji\n          icon\n          color\n          deletedAt\n          deletedBy { id username }\n          createdAt\n          ancestors { id title emoji icon color isDeleted }\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n": types.WikiDocumentTrashDocument,
    "\n  query WikiDocumentBackups($documentId: ID!, $first: Int, $after: String) {\n    wikiDocumentBackups(documentId: $documentId, first: $first, after: $after) {\n      edges {\n        node {\n          ...WikiDocumentBackupListFields\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n": types.WikiDocumentBackupsDocument,
    "\n  query WikiDocumentBackupDetail($id: ID!) {\n    wikiDocumentBackup(id: $id) {\n      ...WikiDocumentBackupDetailFields\n    }\n  }\n": types.WikiDocumentBackupDetailDocument,
    "\n  query WikiDocumentPresence($documentId: ID!) {\n    wikiDocumentPresence(documentId: $documentId) {\n      documentId\n      activeEditors { userId username connectedAt }\n    }\n  }\n": types.WikiDocumentPresenceDocument,
    "\n  query WikiOperationPresence($operationId: ID!) {\n    wikiOperationPresence(operationId: $operationId) {\n      documentId\n      activeEditors { userId username connectedAt }\n    }\n  }\n": types.WikiOperationPresenceDocument,
    "\n  query WikiDocumentHistory($operationId: ID!, $offset: Int, $limit: Int) {\n    wikiDocumentHistory(operationId: $operationId, offset: $offset, limit: $limit) {\n      edges {\n        node {\n          ...WikiDocumentVisitListFields\n        }\n      }\n      totalCount\n    }\n  }\n": types.WikiDocumentHistoryDocument,
    "\n  mutation CreateWikiDocument($operationId: ID!, $input: CreateWikiDocumentInput!) {\n    createWikiDocument(operationId: $operationId, input: $input) {\n      id operationId title emoji color icon sortOrder\n      parentDocumentId\n      createdBy { id username }\n      createdAt updatedAt\n    }\n  }\n": types.CreateWikiDocumentDocument,
    "\n  mutation UpdateWikiDocument($id: ID!, $input: UpdateWikiDocumentInput!) {\n    updateWikiDocument(id: $id, input: $input) {\n      id title emoji color icon sortOrder\n      parentDocumentId\n      updatedAt\n    }\n  }\n": types.UpdateWikiDocumentDocument,
    "\n  mutation ReorderWikiDocumentSiblings($input: ReorderWikiDocumentSiblingsInput!) {\n    reorderWikiDocumentSiblings(input: $input) {\n      id sortOrder parentDocumentId updatedAt\n    }\n  }\n": types.ReorderWikiDocumentSiblingsDocument,
    "\n  mutation DeleteWikiDocument($id: ID!) {\n    deleteWikiDocument(id: $id)\n  }\n": types.DeleteWikiDocumentDocument,
    "\n  mutation DuplicateWikiDocument($id: ID!, $withChildren: Boolean) {\n    duplicateWikiDocument(id: $id, withChildren: $withChildren) {\n      id operationId title emoji color icon sortOrder\n      parentDocumentId\n      createdAt updatedAt\n    }\n  }\n": types.DuplicateWikiDocumentDocument,
    "\n  mutation RestoreWikiDocument($id: ID!, $cascade: Boolean) {\n    restoreWikiDocument(id: $id, cascade: $cascade) {\n      id operationId title emoji icon color sortOrder\n      parentDocumentId\n    }\n  }\n": types.RestoreWikiDocumentDocument,
    "\n  query WikiDocumentTrashedDescendants($documentId: ID!) {\n    wikiDocumentTrashedDescendants(documentId: $documentId) {\n      id title emoji icon color\n    }\n  }\n": types.WikiDocumentTrashedDescendantsDocument,
    "\n  mutation PermanentlyDeleteWikiDocument($id: ID!) {\n    permanentlyDeleteWikiDocument(id: $id)\n  }\n": types.PermanentlyDeleteWikiDocumentDocument,
    "\n  mutation EmptyWikiDocumentTrash($operationId: ID!) {\n    emptyWikiDocumentTrash(operationId: $operationId)\n  }\n": types.EmptyWikiDocumentTrashDocument,
    "\n  mutation CreateWikiDocumentBackup($documentId: ID!, $description: String) {\n    createWikiDocumentBackup(documentId: $documentId, description: $description) {\n      id documentId title trigger description\n      createdBy { id username }\n      createdAt\n    }\n  }\n": types.CreateWikiDocumentBackupDocument,
    "\n  mutation RestoreWikiDocumentBackup($documentId: ID!, $backupId: ID!) {\n    restoreWikiDocumentBackup(documentId: $documentId, backupId: $backupId) {\n      id title content\n    }\n  }\n": types.RestoreWikiDocumentBackupDocument,
    "\n  mutation DeleteWikiDocumentBackup($id: ID!) {\n    deleteWikiDocumentBackup(id: $id)\n  }\n": types.DeleteWikiDocumentBackupDocument,
    "\n  mutation TrackWikiDocumentVisit($documentId: ID!) {\n    trackWikiDocumentVisit(documentId: $documentId) {\n      id\n      visitedAt\n    }\n  }\n": types.TrackWikiDocumentVisitDocument,
    "\n  subscription WikiDocumentChanged($operationId: ID!) {\n    wikiDocumentChanged(operationId: $operationId) {\n      action\n      documentId\n      operationId\n      parentDocumentId\n      previousParentDocumentId\n      document { id title emoji icon color sortOrder parentDocument { id } }\n    }\n  }\n": types.WikiDocumentChangedDocument,
    "\n  subscription WikiDocumentPresenceChanged($operationId: ID!) {\n    wikiDocumentPresenceChanged(operationId: $operationId) {\n      documentId operationId userId username action\n    }\n  }\n": types.WikiDocumentPresenceChangedDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment APIKeyFields on APIKey {\n    id\n    keyId\n    enabled\n    lastUsedAt\n    createdAt\n    updatedAt\n  }\n"): (typeof documents)["\n  fragment APIKeyFields on APIKey {\n    id\n    keyId\n    enabled\n    lastUsedAt\n    createdAt\n    updatedAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MyAPIKey {\n    myAPIKey {\n      ...APIKeyFields\n    }\n  }\n"): (typeof documents)["\n  query MyAPIKey {\n    myAPIKey {\n      ...APIKeyFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateMyAPIKey {\n    createMyAPIKey {\n      apiKey {\n        ...APIKeyFields\n      }\n      token\n    }\n  }\n"): (typeof documents)["\n  mutation CreateMyAPIKey {\n    createMyAPIKey {\n      apiKey {\n        ...APIKeyFields\n      }\n      token\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RegenerateMyAPIKey {\n    regenerateMyAPIKey {\n      apiKey {\n        ...APIKeyFields\n      }\n      token\n    }\n  }\n"): (typeof documents)["\n  mutation RegenerateMyAPIKey {\n    regenerateMyAPIKey {\n      apiKey {\n        ...APIKeyFields\n      }\n      token\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SetMyAPIKeyEnabled($enabled: Boolean!) {\n    setMyAPIKeyEnabled(enabled: $enabled) {\n      ...APIKeyFields\n    }\n  }\n"): (typeof documents)["\n  mutation SetMyAPIKeyEnabled($enabled: Boolean!) {\n    setMyAPIKeyEnabled(enabled: $enabled) {\n      ...APIKeyFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteMyAPIKey {\n    deleteMyAPIKey\n  }\n"): (typeof documents)["\n  mutation DeleteMyAPIKey {\n    deleteMyAPIKey\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment CredentialCommentFields on CredentialComment {\n    id\n    text\n    createdAt\n    updatedAt\n    author {\n      id\n      username\n    }\n  }\n"): (typeof documents)["\n  fragment CredentialCommentFields on CredentialComment {\n    id\n    text\n    createdAt\n    updatedAt\n    author {\n      id\n      username\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment CredentialFields on Credential {\n    id\n    operationId\n    name\n    type\n    username\n    password\n    keys {\n      name\n      content\n    }\n    isValid\n    tags\n    comments {\n      ...CredentialCommentFields\n    }\n    createdBy {\n      id\n      username\n    }\n    backlinkCount\n    createdAt\n    updatedAt\n  }\n"): (typeof documents)["\n  fragment CredentialFields on Credential {\n    id\n    operationId\n    name\n    type\n    username\n    password\n    keys {\n      name\n      content\n    }\n    isValid\n    tags\n    comments {\n      ...CredentialCommentFields\n    }\n    createdBy {\n      id\n      username\n    }\n    backlinkCount\n    createdAt\n    updatedAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment CredentialFieldsWithOperation on Credential {\n    ...CredentialFields\n    operation {\n      id\n      name\n    }\n  }\n"): (typeof documents)["\n  fragment CredentialFieldsWithOperation on Credential {\n    ...CredentialFields\n    operation {\n      id\n      name\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Credential($id: ID!) {\n    credential(id: $id) {\n      ...CredentialFields\n    }\n  }\n"): (typeof documents)["\n  query Credential($id: ID!) {\n    credential(id: $id) {\n      ...CredentialFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Credentials(\n    $operationId: ID!\n    $search: String\n    $type: CredentialType\n    $tags: [String!]\n    $validOnly: Boolean\n    $first: Int\n    $after: String\n  ) {\n    credentials(\n      operationId: $operationId\n      search: $search\n      type: $type\n      tags: $tags\n      validOnly: $validOnly\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...CredentialFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query Credentials(\n    $operationId: ID!\n    $search: String\n    $type: CredentialType\n    $tags: [String!]\n    $validOnly: Boolean\n    $first: Int\n    $after: String\n  ) {\n    credentials(\n      operationId: $operationId\n      search: $search\n      type: $type\n      tags: $tags\n      validOnly: $validOnly\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...CredentialFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CredentialTags($operationId: ID!) {\n    credentialTags(operationId: $operationId)\n  }\n"): (typeof documents)["\n  query CredentialTags($operationId: ID!) {\n    credentialTags(operationId: $operationId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CredentialBacklinks($credentialId: ID!) {\n    wikiDocumentsReferencingCredential(credentialId: $credentialId) {\n      ...WikiDocumentBacklinkFields\n    }\n  }\n"): (typeof documents)["\n  query CredentialBacklinks($credentialId: ID!) {\n    wikiDocumentsReferencingCredential(credentialId: $credentialId) {\n      ...WikiDocumentBacklinkFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MyCredentials(\n    $operationIds: [ID!]\n    $search: String\n    $type: CredentialType\n    $tags: [String!]\n    $validOnly: Boolean\n    $first: Int\n    $after: String\n  ) {\n    myCredentials(\n      operationIds: $operationIds\n      search: $search\n      type: $type\n      tags: $tags\n      validOnly: $validOnly\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...CredentialFieldsWithOperation\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query MyCredentials(\n    $operationIds: [ID!]\n    $search: String\n    $type: CredentialType\n    $tags: [String!]\n    $validOnly: Boolean\n    $first: Int\n    $after: String\n  ) {\n    myCredentials(\n      operationIds: $operationIds\n      search: $search\n      type: $type\n      tags: $tags\n      validOnly: $validOnly\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...CredentialFieldsWithOperation\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MyCredentialTags($operationIds: [ID!]) {\n    myCredentialTags(operationIds: $operationIds)\n  }\n"): (typeof documents)["\n  query MyCredentialTags($operationIds: [ID!]) {\n    myCredentialTags(operationIds: $operationIds)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateCredential($operationId: ID!, $input: CreateCredentialInput!) {\n    createCredential(operationId: $operationId, input: $input) {\n      ...CredentialFields\n    }\n  }\n"): (typeof documents)["\n  mutation CreateCredential($operationId: ID!, $input: CreateCredentialInput!) {\n    createCredential(operationId: $operationId, input: $input) {\n      ...CredentialFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateCredential($id: ID!, $input: UpdateCredentialInput!) {\n    updateCredential(id: $id, input: $input) {\n      ...CredentialFields\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateCredential($id: ID!, $input: UpdateCredentialInput!) {\n    updateCredential(id: $id, input: $input) {\n      ...CredentialFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteCredential($id: ID!) {\n    deleteCredential(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeleteCredential($id: ID!) {\n    deleteCredential(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddCredentialComment($credentialId: ID!, $text: String!) {\n    addCredentialComment(credentialId: $credentialId, text: $text) {\n      ...CredentialFields\n    }\n  }\n"): (typeof documents)["\n  mutation AddCredentialComment($credentialId: ID!, $text: String!) {\n    addCredentialComment(credentialId: $credentialId, text: $text) {\n      ...CredentialFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateCredentialComment(\n    $credentialId: ID!\n    $commentId: ID!\n    $text: String!\n  ) {\n    updateCredentialComment(\n      credentialId: $credentialId\n      commentId: $commentId\n      text: $text\n    ) {\n      ...CredentialFields\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateCredentialComment(\n    $credentialId: ID!\n    $commentId: ID!\n    $text: String!\n  ) {\n    updateCredentialComment(\n      credentialId: $credentialId\n      commentId: $commentId\n      text: $text\n    ) {\n      ...CredentialFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteCredentialComment($credentialId: ID!, $commentId: ID!) {\n    deleteCredentialComment(credentialId: $credentialId, commentId: $commentId) {\n      ...CredentialFields\n    }\n  }\n"): (typeof documents)["\n  mutation DeleteCredentialComment($credentialId: ID!, $commentId: ID!) {\n    deleteCredentialComment(credentialId: $credentialId, commentId: $commentId) {\n      ...CredentialFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription CredentialChanged($operationId: ID!) {\n    credentialChanged(operationId: $operationId) {\n      action\n      credentialId\n      operationId\n      credential {\n        ...CredentialFields\n      }\n    }\n  }\n"): (typeof documents)["\n  subscription CredentialChanged($operationId: ID!) {\n    credentialChanged(operationId: $operationId) {\n      action\n      credentialId\n      operationId\n      credential {\n        ...CredentialFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription MyCredentialChanged($operationIds: [ID!]) {\n    myCredentialChanged(operationIds: $operationIds) {\n      action\n      credentialId\n      operationId\n      credential {\n        ...CredentialFieldsWithOperation\n      }\n    }\n  }\n"): (typeof documents)["\n  subscription MyCredentialChanged($operationIds: [ID!]) {\n    myCredentialChanged(operationIds: $operationIds) {\n      action\n      credentialId\n      operationId\n      credential {\n        ...CredentialFieldsWithOperation\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment OperationMemberFields on OperationMember {\n    user {\n      id\n      username\n      roles\n      active\n      createdAt\n      updatedAt\n    }\n    role\n  }\n"): (typeof documents)["\n  fragment OperationMemberFields on OperationMember {\n    user {\n      id\n      username\n      roles\n      active\n      createdAt\n      updatedAt\n    }\n    role\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment OperationFields on Operation {\n    id\n    name\n    description\n    members {\n      ...OperationMemberFields\n    }\n    createdAt\n    updatedAt\n  }\n"): (typeof documents)["\n  fragment OperationFields on Operation {\n    id\n    name\n    description\n    members {\n      ...OperationMemberFields\n    }\n    createdAt\n    updatedAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Operation($id: ID!) {\n    operation(id: $id) {\n      ...OperationFields\n    }\n  }\n"): (typeof documents)["\n  query Operation($id: ID!) {\n    operation(id: $id) {\n      ...OperationFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Operations($search: String, $first: Int, $after: String) {\n    operations(search: $search, first: $first, after: $after) {\n      edges {\n        node {\n          ...OperationFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query Operations($search: String, $first: Int, $after: String) {\n    operations(search: $search, first: $first, after: $after) {\n      edges {\n        node {\n          ...OperationFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MyOperationRole($operationId: ID!) {\n    myOperationRole(operationId: $operationId)\n  }\n"): (typeof documents)["\n  query MyOperationRole($operationId: ID!) {\n    myOperationRole(operationId: $operationId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateOperation($input: CreateOperationInput!) {\n    createOperation(input: $input) {\n      ...OperationFields\n    }\n  }\n"): (typeof documents)["\n  mutation CreateOperation($input: CreateOperationInput!) {\n    createOperation(input: $input) {\n      ...OperationFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateOperation($id: ID!, $input: UpdateOperationInput!) {\n    updateOperation(id: $id, input: $input) {\n      ...OperationFields\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateOperation($id: ID!, $input: UpdateOperationInput!) {\n    updateOperation(id: $id, input: $input) {\n      ...OperationFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteOperation($id: ID!) {\n    deleteOperation(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeleteOperation($id: ID!) {\n    deleteOperation(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddOperationMember($operationId: ID!, $userId: ID!, $role: OperationRole!) {\n    addOperationMember(operationId: $operationId, userId: $userId, role: $role) {\n      ...OperationFields\n    }\n  }\n"): (typeof documents)["\n  mutation AddOperationMember($operationId: ID!, $userId: ID!, $role: OperationRole!) {\n    addOperationMember(operationId: $operationId, userId: $userId, role: $role) {\n      ...OperationFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RemoveOperationMember($operationId: ID!, $userId: ID!) {\n    removeOperationMember(operationId: $operationId, userId: $userId) {\n      ...OperationFields\n    }\n  }\n"): (typeof documents)["\n  mutation RemoveOperationMember($operationId: ID!, $userId: ID!) {\n    removeOperationMember(operationId: $operationId, userId: $userId) {\n      ...OperationFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateOperationMemberRole($operationId: ID!, $userId: ID!, $role: OperationRole!) {\n    updateOperationMemberRole(operationId: $operationId, userId: $userId, role: $role) {\n      ...OperationFields\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateOperationMemberRole($operationId: ID!, $userId: ID!, $role: OperationRole!) {\n    updateOperationMemberRole(operationId: $operationId, userId: $userId, role: $role) {\n      ...OperationFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query UserSuggestions($search: String!, $first: Int) {\n    userSuggestions(search: $search, first: $first) {\n      id\n      username\n    }\n  }\n"): (typeof documents)["\n  query UserSuggestions($search: String!, $first: Int) {\n    userSuggestions(search: $search, first: $first) {\n      id\n      username\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription OperationChanged($operationId: ID) {\n    operationChanged(operationId: $operationId) {\n      action\n      operationId\n      name\n      operation {\n        ...OperationFields\n      }\n    }\n  }\n"): (typeof documents)["\n  subscription OperationChanged($operationId: ID) {\n    operationChanged(operationId: $operationId) {\n      action\n      operationId\n      name\n      operation {\n        ...OperationFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription OperationMemberChanged($operationId: ID) {\n    operationMemberChanged(operationId: $operationId) {\n      action\n      operationId\n      userId\n    }\n  }\n"): (typeof documents)["\n  subscription OperationMemberChanged($operationId: ID) {\n    operationMemberChanged(operationId: $operationId) {\n      action\n      operationId\n      userId\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment SessionFields on Session {\n    id\n    userId\n    user {\n      id\n      username\n    }\n    ipAddress\n    userAgent\n    browser\n    os\n    device\n    status\n    lastActivityAt\n    isCurrent\n    createdAt\n    updatedAt\n  }\n"): (typeof documents)["\n  fragment SessionFields on Session {\n    id\n    userId\n    user {\n      id\n      username\n    }\n    ipAddress\n    userAgent\n    browser\n    os\n    device\n    status\n    lastActivityAt\n    isCurrent\n    createdAt\n    updatedAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MySessions($activeOnly: Boolean, $first: Int, $after: String) {\n    mySessions(activeOnly: $activeOnly, first: $first, after: $after) {\n      edges {\n        node {\n          ...SessionFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query MySessions($activeOnly: Boolean, $first: Int, $after: String) {\n    mySessions(activeOnly: $activeOnly, first: $first, after: $after) {\n      edges {\n        node {\n          ...SessionFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Sessions($userId: ID, $search: String, $activeOnly: Boolean, $first: Int, $after: String) {\n    sessions(userId: $userId, search: $search, activeOnly: $activeOnly, first: $first, after: $after) {\n      edges {\n        node {\n          ...SessionFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query Sessions($userId: ID, $search: String, $activeOnly: Boolean, $first: Int, $after: String) {\n    sessions(userId: $userId, search: $search, activeOnly: $activeOnly, first: $first, after: $after) {\n      edges {\n        node {\n          ...SessionFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Session($id: ID!) {\n    session(id: $id) {\n      ...SessionFields\n    }\n  }\n"): (typeof documents)["\n  query Session($id: ID!) {\n    session(id: $id) {\n      ...SessionFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RevokeSession($id: ID!) {\n    revokeSession(id: $id)\n  }\n"): (typeof documents)["\n  mutation RevokeSession($id: ID!) {\n    revokeSession(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RevokeAllMySessions {\n    revokeAllMySessions\n  }\n"): (typeof documents)["\n  mutation RevokeAllMySessions {\n    revokeAllMySessions\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AdminRevokeSession($id: ID!) {\n    adminRevokeSession(id: $id)\n  }\n"): (typeof documents)["\n  mutation AdminRevokeSession($id: ID!) {\n    adminRevokeSession(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AdminRevokeAllUserSessions($userId: ID!) {\n    adminRevokeAllUserSessions(userId: $userId)\n  }\n"): (typeof documents)["\n  mutation AdminRevokeAllUserSessions($userId: ID!) {\n    adminRevokeAllUserSessions(userId: $userId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription MySessionChanged {\n    mySessionChanged {\n      action\n      sessionId\n      userId\n      session {\n        ...SessionFields\n      }\n    }\n  }\n"): (typeof documents)["\n  subscription MySessionChanged {\n    mySessionChanged {\n      action\n      sessionId\n      userId\n      session {\n        ...SessionFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription SessionChanged($userId: ID) {\n    sessionChanged(userId: $userId) {\n      action\n      sessionId\n      userId\n      session {\n        ...SessionFields\n      }\n    }\n  }\n"): (typeof documents)["\n  subscription SessionChanged($userId: ID) {\n    sessionChanged(userId: $userId) {\n      action\n      sessionId\n      userId\n      session {\n        ...SessionFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment TimelineEventFields on TimelineEvent {\n    id\n    operationId\n    topic\n    subjectKind\n    subjectId\n    subjectName\n    occurredAt\n    metadata\n    actor {\n      id\n      username\n    }\n  }\n"): (typeof documents)["\n  fragment TimelineEventFields on TimelineEvent {\n    id\n    operationId\n    topic\n    subjectKind\n    subjectId\n    subjectName\n    occurredAt\n    metadata\n    actor {\n      id\n      username\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query TimelineBuckets(\n    $operationId: ID!\n    $granularity: TimelineGranularity = DAY\n    $timezone: String!\n    $from: String\n    $to: String\n    $types: [String!]\n    $actorIds: [ID!]\n  ) {\n    timelineBuckets(\n      operationId: $operationId\n      granularity: $granularity\n      timezone: $timezone\n      from: $from\n      to: $to\n      types: $types\n      actorIds: $actorIds\n    ) {\n      bucketStart\n      count\n      topicCounts {\n        topic\n        subjectKind\n        count\n      }\n    }\n  }\n"): (typeof documents)["\n  query TimelineBuckets(\n    $operationId: ID!\n    $granularity: TimelineGranularity = DAY\n    $timezone: String!\n    $from: String\n    $to: String\n    $types: [String!]\n    $actorIds: [ID!]\n  ) {\n    timelineBuckets(\n      operationId: $operationId\n      granularity: $granularity\n      timezone: $timezone\n      from: $from\n      to: $to\n      types: $types\n      actorIds: $actorIds\n    ) {\n      bucketStart\n      count\n      topicCounts {\n        topic\n        subjectKind\n        count\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query TimelineEventsByDay(\n    $operationId: ID!\n    $date: String!\n    $timezone: String!\n    $granularity: TimelineGranularity = DAY\n    $types: [String!]\n    $actorIds: [ID!]\n    $first: Int = 100\n    $after: String\n  ) {\n    timelineEventsByDay(\n      operationId: $operationId\n      date: $date\n      timezone: $timezone\n      granularity: $granularity\n      types: $types\n      actorIds: $actorIds\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...TimelineEventFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n    }\n  }\n"): (typeof documents)["\n  query TimelineEventsByDay(\n    $operationId: ID!\n    $date: String!\n    $timezone: String!\n    $granularity: TimelineGranularity = DAY\n    $types: [String!]\n    $actorIds: [ID!]\n    $first: Int = 100\n    $after: String\n  ) {\n    timelineEventsByDay(\n      operationId: $operationId\n      date: $date\n      timezone: $timezone\n      granularity: $granularity\n      types: $types\n      actorIds: $actorIds\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...TimelineEventFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription TimelineEventAdded($operationId: ID!) {\n    timelineEventAdded(operationId: $operationId) {\n      ...TimelineEventFields\n    }\n  }\n"): (typeof documents)["\n  subscription TimelineEventAdded($operationId: ID!) {\n    timelineEventAdded(operationId: $operationId) {\n      ...TimelineEventFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateCustomTimelineEvent(\n    $operationId: ID!\n    $input: CreateCustomTimelineEventInput!\n  ) {\n    createCustomTimelineEvent(operationId: $operationId, input: $input) {\n      ...TimelineEventFields\n    }\n  }\n"): (typeof documents)["\n  mutation CreateCustomTimelineEvent(\n    $operationId: ID!\n    $input: CreateCustomTimelineEventInput!\n  ) {\n    createCustomTimelineEvent(operationId: $operationId, input: $input) {\n      ...TimelineEventFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateCustomTimelineEvent(\n    $id: ID!\n    $input: UpdateCustomTimelineEventInput!\n  ) {\n    updateCustomTimelineEvent(id: $id, input: $input) {\n      ...TimelineEventFields\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateCustomTimelineEvent(\n    $id: ID!\n    $input: UpdateCustomTimelineEventInput!\n  ) {\n    updateCustomTimelineEvent(id: $id, input: $input) {\n      ...TimelineEventFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteCustomTimelineEvent($id: ID!) {\n    deleteCustomTimelineEvent(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeleteCustomTimelineEvent($id: ID!) {\n    deleteCustomTimelineEvent(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment UserFields on User {\n    id\n    username\n    roles\n    active\n    createdAt\n    updatedAt\n  }\n"): (typeof documents)["\n  fragment UserFields on User {\n    id\n    username\n    roles\n    active\n    createdAt\n    updatedAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Me {\n    me {\n      ...UserFields\n    }\n  }\n"): (typeof documents)["\n  query Me {\n    me {\n      ...UserFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query User($id: ID!) {\n    user(id: $id) {\n      ...UserFields\n    }\n  }\n"): (typeof documents)["\n  query User($id: ID!) {\n    user(id: $id) {\n      ...UserFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Users($search: String, $first: Int, $after: String) {\n    users(search: $search, first: $first, after: $after) {\n      edges {\n        node {\n          ...UserFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query Users($search: String, $first: Int, $after: String) {\n    users(search: $search, first: $first, after: $after) {\n      edges {\n        node {\n          ...UserFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateUser($input: CreateUserInput!) {\n    createUser(input: $input) {\n      ...UserFields\n    }\n  }\n"): (typeof documents)["\n  mutation CreateUser($input: CreateUserInput!) {\n    createUser(input: $input) {\n      ...UserFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {\n    updateUser(id: $id, input: $input) {\n      ...UserFields\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {\n    updateUser(id: $id, input: $input) {\n      ...UserFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteUser($id: ID!) {\n    deleteUser(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeleteUser($id: ID!) {\n    deleteUser(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateOwnProfile($input: UpdateUserInput!) {\n    updateOwnProfile(input: $input) {\n      ...UserFields\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateOwnProfile($input: UpdateUserInput!) {\n    updateOwnProfile(input: $input) {\n      ...UserFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription UserChanged {\n    userChanged {\n      action\n      userId\n      username\n      user {\n        ...UserFields\n      }\n    }\n  }\n"): (typeof documents)["\n  subscription UserChanged {\n    userChanged {\n      action\n      userId\n      username\n      user {\n        ...UserFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment WikiDocumentTreeFields on WikiDocument {\n    id\n    parentDocumentId\n    title\n    emoji\n    icon\n    color\n    sortOrder\n    childCount\n    lastUpdatedAt\n    updatedAt\n  }\n"): (typeof documents)["\n  fragment WikiDocumentTreeFields on WikiDocument {\n    id\n    parentDocumentId\n    title\n    emoji\n    icon\n    color\n    sortOrder\n    childCount\n    lastUpdatedAt\n    updatedAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment WikiDocumentLiteFields on WikiDocument {\n    id\n    title\n    emoji\n    icon\n    color\n    deletedAt\n  }\n"): (typeof documents)["\n  fragment WikiDocumentLiteFields on WikiDocument {\n    id\n    title\n    emoji\n    icon\n    color\n    deletedAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment WikiDocumentBacklinkFields on WikiDocument {\n    id\n    title\n    emoji\n    icon\n    color\n    updatedAt\n    ancestors { id title emoji icon color isDeleted }\n  }\n"): (typeof documents)["\n  fragment WikiDocumentBacklinkFields on WikiDocument {\n    id\n    title\n    emoji\n    icon\n    color\n    updatedAt\n    ancestors { id title emoji icon color isDeleted }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment WikiDocumentFields on WikiDocument {\n    id\n    operationId\n    parentDocumentId\n    ancestors { id title emoji icon color isDeleted }\n    title\n    content\n    emoji\n    color\n    icon\n    sortOrder\n    createdBy { id username }\n    lastUpdatedBy { id username }\n    lastUpdatedAt\n    lastBackupAt\n    createdAt\n    updatedAt\n  }\n"): (typeof documents)["\n  fragment WikiDocumentFields on WikiDocument {\n    id\n    operationId\n    parentDocumentId\n    ancestors { id title emoji icon color isDeleted }\n    title\n    content\n    emoji\n    color\n    icon\n    sortOrder\n    createdBy { id username }\n    lastUpdatedBy { id username }\n    lastUpdatedAt\n    lastBackupAt\n    createdAt\n    updatedAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment WikiDocumentBackupListFields on WikiDocumentBackup {\n    id\n    documentId\n    title\n    trigger\n    description\n    contentLength\n    createdBy { id username }\n    createdAt\n  }\n"): (typeof documents)["\n  fragment WikiDocumentBackupListFields on WikiDocumentBackup {\n    id\n    documentId\n    title\n    trigger\n    description\n    contentLength\n    createdBy { id username }\n    createdAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment WikiDocumentBackupDetailFields on WikiDocumentBackup {\n    id\n    documentId\n    title\n    content\n    contentLength\n    trigger\n    description\n    createdBy { id username }\n    createdAt\n  }\n"): (typeof documents)["\n  fragment WikiDocumentBackupDetailFields on WikiDocumentBackup {\n    id\n    documentId\n    title\n    content\n    contentLength\n    trigger\n    description\n    createdBy { id username }\n    createdAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment WikiDocumentVisitListFields on WikiDocumentVisit {\n    id\n    visitedAt\n    document {\n      id\n      title\n      emoji\n      icon\n      color\n      ancestors { id title emoji icon color isDeleted }\n    }\n  }\n"): (typeof documents)["\n  fragment WikiDocumentVisitListFields on WikiDocumentVisit {\n    id\n    visitedAt\n    document {\n      id\n      title\n      emoji\n      icon\n      color\n      ancestors { id title emoji icon color isDeleted }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiDocumentTree($operationId: ID!) {\n    wikiDocumentTree(operationId: $operationId) {\n      ...WikiDocumentTreeFields\n    }\n  }\n"): (typeof documents)["\n  query WikiDocumentTree($operationId: ID!) {\n    wikiDocumentTree(operationId: $operationId) {\n      ...WikiDocumentTreeFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiDocumentChildren($operationId: ID!, $parentDocumentId: ID) {\n    wikiDocumentChildren(\n      operationId: $operationId\n      parentDocumentId: $parentDocumentId\n    ) {\n      ...WikiDocumentTreeFields\n    }\n  }\n"): (typeof documents)["\n  query WikiDocumentChildren($operationId: ID!, $parentDocumentId: ID) {\n    wikiDocumentChildren(\n      operationId: $operationId\n      parentDocumentId: $parentDocumentId\n    ) {\n      ...WikiDocumentTreeFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiDocumentTreeRevealPath($documentId: ID!) {\n    wikiDocumentTreeRevealPath(documentId: $documentId) {\n      ...WikiDocumentTreeFields\n    }\n  }\n"): (typeof documents)["\n  query WikiDocumentTreeRevealPath($documentId: ID!) {\n    wikiDocumentTreeRevealPath(documentId: $documentId) {\n      ...WikiDocumentTreeFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiDocumentTrashCount($operationId: ID!) {\n    wikiDocumentTrashCount(operationId: $operationId)\n  }\n"): (typeof documents)["\n  query WikiDocumentTrashCount($operationId: ID!) {\n    wikiDocumentTrashCount(operationId: $operationId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiDocument($id: ID!) {\n    wikiDocument(id: $id) {\n      ...WikiDocumentFields\n    }\n  }\n"): (typeof documents)["\n  query WikiDocument($id: ID!) {\n    wikiDocument(id: $id) {\n      ...WikiDocumentFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiDocuments(\n    $operationId: ID!\n    $parentDocumentId: ID\n    $search: String\n    $first: Int\n    $after: String\n  ) {\n    wikiDocuments(\n      operationId: $operationId\n      parentDocumentId: $parentDocumentId\n      search: $search\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          id\n          operationId\n          parentDocumentId\n          title\n          emoji\n          icon\n          color\n          sortOrder\n          createdBy { id username }\n          createdAt\n          updatedAt\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query WikiDocuments(\n    $operationId: ID!\n    $parentDocumentId: ID\n    $search: String\n    $first: Int\n    $after: String\n  ) {\n    wikiDocuments(\n      operationId: $operationId\n      parentDocumentId: $parentDocumentId\n      search: $search\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          id\n          operationId\n          parentDocumentId\n          title\n          emoji\n          icon\n          color\n          sortOrder\n          createdBy { id username }\n          createdAt\n          updatedAt\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiRecentDocuments(\n    $operationId: ID!\n    $sort: WikiDocumentSort\n    $first: Int\n    $after: String\n  ) {\n    wikiDocuments(\n      operationId: $operationId\n      sort: $sort\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          id\n          title\n          emoji\n          icon\n          color\n          parentDocumentId\n          ancestors { id title emoji icon color isDeleted }\n          createdAt\n          updatedAt\n          lastUpdatedAt\n          createdBy { id username }\n          lastUpdatedBy { id username }\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query WikiRecentDocuments(\n    $operationId: ID!\n    $sort: WikiDocumentSort\n    $first: Int\n    $after: String\n  ) {\n    wikiDocuments(\n      operationId: $operationId\n      sort: $sort\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          id\n          title\n          emoji\n          icon\n          color\n          parentDocumentId\n          ancestors { id title emoji icon color isDeleted }\n          createdAt\n          updatedAt\n          lastUpdatedAt\n          createdBy { id username }\n          lastUpdatedBy { id username }\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiSearch(\n    $operationId: ID!\n    $scope: ID\n    $query: String!\n    $offset: Int\n    $limit: Int\n  ) {\n    wikiSearch(\n      operationId: $operationId\n      scope: $scope\n      query: $query\n      offset: $offset\n      limit: $limit\n    ) {\n      hits {\n        document {\n          id\n          title\n          emoji\n          icon\n          color\n          parentDocumentId\n          ancestors { id title emoji icon color isDeleted }\n          createdBy { id username }\n        }\n        snippet\n        matchRanges { start end }\n        score\n      }\n      total\n      hasMore\n    }\n  }\n"): (typeof documents)["\n  query WikiSearch(\n    $operationId: ID!\n    $scope: ID\n    $query: String!\n    $offset: Int\n    $limit: Int\n  ) {\n    wikiSearch(\n      operationId: $operationId\n      scope: $scope\n      query: $query\n      offset: $offset\n      limit: $limit\n    ) {\n      hits {\n        document {\n          id\n          title\n          emoji\n          icon\n          color\n          parentDocumentId\n          ancestors { id title emoji icon color isDeleted }\n          createdBy { id username }\n        }\n        snippet\n        matchRanges { start end }\n        score\n      }\n      total\n      hasMore\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiDocumentLite($id: ID!) {\n    wikiDocument(id: $id) {\n      ...WikiDocumentLiteFields\n    }\n  }\n"): (typeof documents)["\n  query WikiDocumentLite($id: ID!) {\n    wikiDocument(id: $id) {\n      ...WikiDocumentLiteFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiDocumentBacklinks($documentId: ID!) {\n    wikiDocumentBacklinks(documentId: $documentId) {\n      ...WikiDocumentBacklinkFields\n    }\n  }\n"): (typeof documents)["\n  query WikiDocumentBacklinks($documentId: ID!) {\n    wikiDocumentBacklinks(documentId: $documentId) {\n      ...WikiDocumentBacklinkFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiDocumentTrash($operationId: ID!, $first: Int, $after: String) {\n    wikiDocumentTrash(operationId: $operationId, first: $first, after: $after) {\n      edges {\n        node {\n          id\n          title\n          emoji\n          icon\n          color\n          deletedAt\n          deletedBy { id username }\n          createdAt\n          ancestors { id title emoji icon color isDeleted }\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query WikiDocumentTrash($operationId: ID!, $first: Int, $after: String) {\n    wikiDocumentTrash(operationId: $operationId, first: $first, after: $after) {\n      edges {\n        node {\n          id\n          title\n          emoji\n          icon\n          color\n          deletedAt\n          deletedBy { id username }\n          createdAt\n          ancestors { id title emoji icon color isDeleted }\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiDocumentBackups($documentId: ID!, $first: Int, $after: String) {\n    wikiDocumentBackups(documentId: $documentId, first: $first, after: $after) {\n      edges {\n        node {\n          ...WikiDocumentBackupListFields\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query WikiDocumentBackups($documentId: ID!, $first: Int, $after: String) {\n    wikiDocumentBackups(documentId: $documentId, first: $first, after: $after) {\n      edges {\n        node {\n          ...WikiDocumentBackupListFields\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiDocumentBackupDetail($id: ID!) {\n    wikiDocumentBackup(id: $id) {\n      ...WikiDocumentBackupDetailFields\n    }\n  }\n"): (typeof documents)["\n  query WikiDocumentBackupDetail($id: ID!) {\n    wikiDocumentBackup(id: $id) {\n      ...WikiDocumentBackupDetailFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiDocumentPresence($documentId: ID!) {\n    wikiDocumentPresence(documentId: $documentId) {\n      documentId\n      activeEditors { userId username connectedAt }\n    }\n  }\n"): (typeof documents)["\n  query WikiDocumentPresence($documentId: ID!) {\n    wikiDocumentPresence(documentId: $documentId) {\n      documentId\n      activeEditors { userId username connectedAt }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiOperationPresence($operationId: ID!) {\n    wikiOperationPresence(operationId: $operationId) {\n      documentId\n      activeEditors { userId username connectedAt }\n    }\n  }\n"): (typeof documents)["\n  query WikiOperationPresence($operationId: ID!) {\n    wikiOperationPresence(operationId: $operationId) {\n      documentId\n      activeEditors { userId username connectedAt }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiDocumentHistory($operationId: ID!, $offset: Int, $limit: Int) {\n    wikiDocumentHistory(operationId: $operationId, offset: $offset, limit: $limit) {\n      edges {\n        node {\n          ...WikiDocumentVisitListFields\n        }\n      }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query WikiDocumentHistory($operationId: ID!, $offset: Int, $limit: Int) {\n    wikiDocumentHistory(operationId: $operationId, offset: $offset, limit: $limit) {\n      edges {\n        node {\n          ...WikiDocumentVisitListFields\n        }\n      }\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateWikiDocument($operationId: ID!, $input: CreateWikiDocumentInput!) {\n    createWikiDocument(operationId: $operationId, input: $input) {\n      id operationId title emoji color icon sortOrder\n      parentDocumentId\n      createdBy { id username }\n      createdAt updatedAt\n    }\n  }\n"): (typeof documents)["\n  mutation CreateWikiDocument($operationId: ID!, $input: CreateWikiDocumentInput!) {\n    createWikiDocument(operationId: $operationId, input: $input) {\n      id operationId title emoji color icon sortOrder\n      parentDocumentId\n      createdBy { id username }\n      createdAt updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateWikiDocument($id: ID!, $input: UpdateWikiDocumentInput!) {\n    updateWikiDocument(id: $id, input: $input) {\n      id title emoji color icon sortOrder\n      parentDocumentId\n      updatedAt\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateWikiDocument($id: ID!, $input: UpdateWikiDocumentInput!) {\n    updateWikiDocument(id: $id, input: $input) {\n      id title emoji color icon sortOrder\n      parentDocumentId\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ReorderWikiDocumentSiblings($input: ReorderWikiDocumentSiblingsInput!) {\n    reorderWikiDocumentSiblings(input: $input) {\n      id sortOrder parentDocumentId updatedAt\n    }\n  }\n"): (typeof documents)["\n  mutation ReorderWikiDocumentSiblings($input: ReorderWikiDocumentSiblingsInput!) {\n    reorderWikiDocumentSiblings(input: $input) {\n      id sortOrder parentDocumentId updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteWikiDocument($id: ID!) {\n    deleteWikiDocument(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeleteWikiDocument($id: ID!) {\n    deleteWikiDocument(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DuplicateWikiDocument($id: ID!, $withChildren: Boolean) {\n    duplicateWikiDocument(id: $id, withChildren: $withChildren) {\n      id operationId title emoji color icon sortOrder\n      parentDocumentId\n      createdAt updatedAt\n    }\n  }\n"): (typeof documents)["\n  mutation DuplicateWikiDocument($id: ID!, $withChildren: Boolean) {\n    duplicateWikiDocument(id: $id, withChildren: $withChildren) {\n      id operationId title emoji color icon sortOrder\n      parentDocumentId\n      createdAt updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RestoreWikiDocument($id: ID!, $cascade: Boolean) {\n    restoreWikiDocument(id: $id, cascade: $cascade) {\n      id operationId title emoji icon color sortOrder\n      parentDocumentId\n    }\n  }\n"): (typeof documents)["\n  mutation RestoreWikiDocument($id: ID!, $cascade: Boolean) {\n    restoreWikiDocument(id: $id, cascade: $cascade) {\n      id operationId title emoji icon color sortOrder\n      parentDocumentId\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiDocumentTrashedDescendants($documentId: ID!) {\n    wikiDocumentTrashedDescendants(documentId: $documentId) {\n      id title emoji icon color\n    }\n  }\n"): (typeof documents)["\n  query WikiDocumentTrashedDescendants($documentId: ID!) {\n    wikiDocumentTrashedDescendants(documentId: $documentId) {\n      id title emoji icon color\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation PermanentlyDeleteWikiDocument($id: ID!) {\n    permanentlyDeleteWikiDocument(id: $id)\n  }\n"): (typeof documents)["\n  mutation PermanentlyDeleteWikiDocument($id: ID!) {\n    permanentlyDeleteWikiDocument(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation EmptyWikiDocumentTrash($operationId: ID!) {\n    emptyWikiDocumentTrash(operationId: $operationId)\n  }\n"): (typeof documents)["\n  mutation EmptyWikiDocumentTrash($operationId: ID!) {\n    emptyWikiDocumentTrash(operationId: $operationId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateWikiDocumentBackup($documentId: ID!, $description: String) {\n    createWikiDocumentBackup(documentId: $documentId, description: $description) {\n      id documentId title trigger description\n      createdBy { id username }\n      createdAt\n    }\n  }\n"): (typeof documents)["\n  mutation CreateWikiDocumentBackup($documentId: ID!, $description: String) {\n    createWikiDocumentBackup(documentId: $documentId, description: $description) {\n      id documentId title trigger description\n      createdBy { id username }\n      createdAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RestoreWikiDocumentBackup($documentId: ID!, $backupId: ID!) {\n    restoreWikiDocumentBackup(documentId: $documentId, backupId: $backupId) {\n      id title content\n    }\n  }\n"): (typeof documents)["\n  mutation RestoreWikiDocumentBackup($documentId: ID!, $backupId: ID!) {\n    restoreWikiDocumentBackup(documentId: $documentId, backupId: $backupId) {\n      id title content\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteWikiDocumentBackup($id: ID!) {\n    deleteWikiDocumentBackup(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeleteWikiDocumentBackup($id: ID!) {\n    deleteWikiDocumentBackup(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation TrackWikiDocumentVisit($documentId: ID!) {\n    trackWikiDocumentVisit(documentId: $documentId) {\n      id\n      visitedAt\n    }\n  }\n"): (typeof documents)["\n  mutation TrackWikiDocumentVisit($documentId: ID!) {\n    trackWikiDocumentVisit(documentId: $documentId) {\n      id\n      visitedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription WikiDocumentChanged($operationId: ID!) {\n    wikiDocumentChanged(operationId: $operationId) {\n      action\n      documentId\n      operationId\n      parentDocumentId\n      previousParentDocumentId\n      document { id title emoji icon color sortOrder parentDocument { id } }\n    }\n  }\n"): (typeof documents)["\n  subscription WikiDocumentChanged($operationId: ID!) {\n    wikiDocumentChanged(operationId: $operationId) {\n      action\n      documentId\n      operationId\n      parentDocumentId\n      previousParentDocumentId\n      document { id title emoji icon color sortOrder parentDocument { id } }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription WikiDocumentPresenceChanged($operationId: ID!) {\n    wikiDocumentPresenceChanged(operationId: $operationId) {\n      documentId operationId userId username action\n    }\n  }\n"): (typeof documents)["\n  subscription WikiDocumentPresenceChanged($operationId: ID!) {\n    wikiDocumentPresenceChanged(operationId: $operationId) {\n      documentId operationId userId username action\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;