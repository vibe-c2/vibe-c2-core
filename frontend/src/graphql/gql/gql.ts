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
    "\n  fragment UserFields on User {\n    id\n    username\n    roles\n    active\n    createdAt\n    updatedAt\n  }\n": typeof types.UserFieldsFragmentDoc,
    "\n  query Me {\n    me {\n      ...UserFields\n    }\n  }\n": typeof types.MeDocument,
    "\n  query User($id: ID!) {\n    user(id: $id) {\n      ...UserFields\n    }\n  }\n": typeof types.UserDocument,
    "\n  query Users($search: String, $first: Int, $after: String) {\n    users(search: $search, first: $first, after: $after) {\n      edges {\n        node {\n          ...UserFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n": typeof types.UsersDocument,
    "\n  mutation CreateUser($input: CreateUserInput!) {\n    createUser(input: $input) {\n      ...UserFields\n    }\n  }\n": typeof types.CreateUserDocument,
    "\n  mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {\n    updateUser(id: $id, input: $input) {\n      ...UserFields\n    }\n  }\n": typeof types.UpdateUserDocument,
    "\n  mutation DeleteUser($id: ID!) {\n    deleteUser(id: $id)\n  }\n": typeof types.DeleteUserDocument,
    "\n  mutation UpdateOwnProfile($input: UpdateUserInput!) {\n    updateOwnProfile(input: $input) {\n      ...UserFields\n    }\n  }\n": typeof types.UpdateOwnProfileDocument,
    "\n  subscription UserChanged {\n    userChanged {\n      action\n      userId\n      username\n      user {\n        ...UserFields\n      }\n    }\n  }\n": typeof types.UserChangedDocument,
    "\n  fragment WikiDocumentTreeFields on WikiDocument {\n    id\n    operationId\n    parentDocument { id }\n    title\n    emoji\n    icon\n    color\n    sortOrder\n    childCount\n    createdAt\n    updatedAt\n  }\n": typeof types.WikiDocumentTreeFieldsFragmentDoc,
    "\n  fragment WikiDocumentFields on WikiDocument {\n    id\n    operationId\n    parentDocument { id }\n    title\n    content\n    emoji\n    color\n    icon\n    sortOrder\n    createdBy { id username }\n    lastUpdatedBy { id username }\n    lastUpdatedAt\n    lastBackupAt\n    createdAt\n    updatedAt\n  }\n": typeof types.WikiDocumentFieldsFragmentDoc,
    "\n  fragment WikiDocumentBackupListFields on WikiDocumentBackup {\n    id\n    documentId\n    title\n    trigger\n    description\n    contentLength\n    createdBy { id username }\n    createdAt\n  }\n": typeof types.WikiDocumentBackupListFieldsFragmentDoc,
    "\n  fragment WikiDocumentBackupDetailFields on WikiDocumentBackup {\n    id\n    documentId\n    title\n    content\n    contentLength\n    trigger\n    description\n    createdBy { id username }\n    createdAt\n  }\n": typeof types.WikiDocumentBackupDetailFieldsFragmentDoc,
    "\n  query WikiDocumentTree($operationId: ID!) {\n    wikiDocumentTree(operationId: $operationId) {\n      ...WikiDocumentTreeFields\n    }\n  }\n": typeof types.WikiDocumentTreeDocument,
    "\n  query WikiDocument($id: ID!) {\n    wikiDocument(id: $id) {\n      ...WikiDocumentFields\n    }\n  }\n": typeof types.WikiDocumentDocument,
    "\n  query WikiDocuments(\n    $operationId: ID!\n    $parentDocumentId: ID\n    $search: String\n    $first: Int\n    $after: String\n  ) {\n    wikiDocuments(\n      operationId: $operationId\n      parentDocumentId: $parentDocumentId\n      search: $search\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          id\n          operationId\n          parentDocument { id }\n          title\n          emoji\n          sortOrder\n          createdBy { id username }\n          createdAt\n          updatedAt\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n": typeof types.WikiDocumentsDocument,
    "\n  query WikiSearch(\n    $operationId: ID!\n    $scope: ID\n    $query: String!\n    $offset: Int\n    $limit: Int\n  ) {\n    wikiSearch(\n      operationId: $operationId\n      scope: $scope\n      query: $query\n      offset: $offset\n      limit: $limit\n    ) {\n      hits {\n        document {\n          id\n          title\n          emoji\n          icon\n          parentDocument { id }\n          createdBy { id username }\n        }\n        snippet\n        matchRanges { start end }\n        score\n      }\n      total\n      hasMore\n    }\n  }\n": typeof types.WikiSearchDocument,
    "\n  query WikiDocumentTrash($operationId: ID!, $first: Int, $after: String) {\n    wikiDocumentTrash(operationId: $operationId, first: $first, after: $after) {\n      edges {\n        node {\n          id\n          title\n          emoji\n          icon\n          deletedAt\n          deletedBy { id username }\n          createdAt\n          ancestors { id title emoji icon isDeleted }\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n": typeof types.WikiDocumentTrashDocument,
    "\n  query WikiDocumentBackups($documentId: ID!, $first: Int, $after: String) {\n    wikiDocumentBackups(documentId: $documentId, first: $first, after: $after) {\n      edges {\n        node {\n          ...WikiDocumentBackupListFields\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n": typeof types.WikiDocumentBackupsDocument,
    "\n  query WikiDocumentBackupDetail($id: ID!) {\n    wikiDocumentBackup(id: $id) {\n      ...WikiDocumentBackupDetailFields\n    }\n  }\n": typeof types.WikiDocumentBackupDetailDocument,
    "\n  query WikiDocumentPresence($documentId: ID!) {\n    wikiDocumentPresence(documentId: $documentId) {\n      documentId\n      activeEditors { userId username connectedAt }\n    }\n  }\n": typeof types.WikiDocumentPresenceDocument,
    "\n  query WikiOperationPresence($operationId: ID!) {\n    wikiOperationPresence(operationId: $operationId) {\n      documentId\n      activeEditors { userId username connectedAt }\n    }\n  }\n": typeof types.WikiOperationPresenceDocument,
    "\n  mutation CreateWikiDocument($operationId: ID!, $input: CreateWikiDocumentInput!) {\n    createWikiDocument(operationId: $operationId, input: $input) {\n      id operationId title emoji color icon sortOrder\n      parentDocument { id }\n      createdBy { id username }\n      createdAt updatedAt\n    }\n  }\n": typeof types.CreateWikiDocumentDocument,
    "\n  mutation UpdateWikiDocument($id: ID!, $input: UpdateWikiDocumentInput!) {\n    updateWikiDocument(id: $id, input: $input) {\n      id title emoji color icon sortOrder\n      parentDocument { id }\n      updatedAt\n    }\n  }\n": typeof types.UpdateWikiDocumentDocument,
    "\n  mutation DeleteWikiDocument($id: ID!) {\n    deleteWikiDocument(id: $id)\n  }\n": typeof types.DeleteWikiDocumentDocument,
    "\n  mutation RestoreWikiDocument($id: ID!, $cascade: Boolean) {\n    restoreWikiDocument(id: $id, cascade: $cascade) {\n      id operationId title emoji sortOrder\n      parentDocument { id }\n    }\n  }\n": typeof types.RestoreWikiDocumentDocument,
    "\n  query WikiDocumentTrashedDescendants($documentId: ID!) {\n    wikiDocumentTrashedDescendants(documentId: $documentId) {\n      id title emoji icon\n    }\n  }\n": typeof types.WikiDocumentTrashedDescendantsDocument,
    "\n  mutation PermanentlyDeleteWikiDocument($id: ID!) {\n    permanentlyDeleteWikiDocument(id: $id)\n  }\n": typeof types.PermanentlyDeleteWikiDocumentDocument,
    "\n  mutation EmptyWikiDocumentTrash($operationId: ID!) {\n    emptyWikiDocumentTrash(operationId: $operationId)\n  }\n": typeof types.EmptyWikiDocumentTrashDocument,
    "\n  mutation CreateWikiDocumentBackup($documentId: ID!, $description: String) {\n    createWikiDocumentBackup(documentId: $documentId, description: $description) {\n      id documentId title trigger description\n      createdBy { id username }\n      createdAt\n    }\n  }\n": typeof types.CreateWikiDocumentBackupDocument,
    "\n  mutation RestoreWikiDocumentBackup($documentId: ID!, $backupId: ID!) {\n    restoreWikiDocumentBackup(documentId: $documentId, backupId: $backupId) {\n      id title content\n    }\n  }\n": typeof types.RestoreWikiDocumentBackupDocument,
    "\n  mutation DeleteWikiDocumentBackup($id: ID!) {\n    deleteWikiDocumentBackup(id: $id)\n  }\n": typeof types.DeleteWikiDocumentBackupDocument,
    "\n  subscription WikiDocumentChanged($operationId: ID!) {\n    wikiDocumentChanged(operationId: $operationId) {\n      action\n      documentId\n      operationId\n      parentDocumentId\n      document { id title emoji sortOrder parentDocument { id } }\n    }\n  }\n": typeof types.WikiDocumentChangedDocument,
    "\n  subscription WikiDocumentPresenceChanged($operationId: ID!) {\n    wikiDocumentPresenceChanged(operationId: $operationId) {\n      documentId operationId userId username action\n    }\n  }\n": typeof types.WikiDocumentPresenceChangedDocument,
};
const documents: Documents = {
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
    "\n  fragment UserFields on User {\n    id\n    username\n    roles\n    active\n    createdAt\n    updatedAt\n  }\n": types.UserFieldsFragmentDoc,
    "\n  query Me {\n    me {\n      ...UserFields\n    }\n  }\n": types.MeDocument,
    "\n  query User($id: ID!) {\n    user(id: $id) {\n      ...UserFields\n    }\n  }\n": types.UserDocument,
    "\n  query Users($search: String, $first: Int, $after: String) {\n    users(search: $search, first: $first, after: $after) {\n      edges {\n        node {\n          ...UserFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n": types.UsersDocument,
    "\n  mutation CreateUser($input: CreateUserInput!) {\n    createUser(input: $input) {\n      ...UserFields\n    }\n  }\n": types.CreateUserDocument,
    "\n  mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {\n    updateUser(id: $id, input: $input) {\n      ...UserFields\n    }\n  }\n": types.UpdateUserDocument,
    "\n  mutation DeleteUser($id: ID!) {\n    deleteUser(id: $id)\n  }\n": types.DeleteUserDocument,
    "\n  mutation UpdateOwnProfile($input: UpdateUserInput!) {\n    updateOwnProfile(input: $input) {\n      ...UserFields\n    }\n  }\n": types.UpdateOwnProfileDocument,
    "\n  subscription UserChanged {\n    userChanged {\n      action\n      userId\n      username\n      user {\n        ...UserFields\n      }\n    }\n  }\n": types.UserChangedDocument,
    "\n  fragment WikiDocumentTreeFields on WikiDocument {\n    id\n    operationId\n    parentDocument { id }\n    title\n    emoji\n    icon\n    color\n    sortOrder\n    childCount\n    createdAt\n    updatedAt\n  }\n": types.WikiDocumentTreeFieldsFragmentDoc,
    "\n  fragment WikiDocumentFields on WikiDocument {\n    id\n    operationId\n    parentDocument { id }\n    title\n    content\n    emoji\n    color\n    icon\n    sortOrder\n    createdBy { id username }\n    lastUpdatedBy { id username }\n    lastUpdatedAt\n    lastBackupAt\n    createdAt\n    updatedAt\n  }\n": types.WikiDocumentFieldsFragmentDoc,
    "\n  fragment WikiDocumentBackupListFields on WikiDocumentBackup {\n    id\n    documentId\n    title\n    trigger\n    description\n    contentLength\n    createdBy { id username }\n    createdAt\n  }\n": types.WikiDocumentBackupListFieldsFragmentDoc,
    "\n  fragment WikiDocumentBackupDetailFields on WikiDocumentBackup {\n    id\n    documentId\n    title\n    content\n    contentLength\n    trigger\n    description\n    createdBy { id username }\n    createdAt\n  }\n": types.WikiDocumentBackupDetailFieldsFragmentDoc,
    "\n  query WikiDocumentTree($operationId: ID!) {\n    wikiDocumentTree(operationId: $operationId) {\n      ...WikiDocumentTreeFields\n    }\n  }\n": types.WikiDocumentTreeDocument,
    "\n  query WikiDocument($id: ID!) {\n    wikiDocument(id: $id) {\n      ...WikiDocumentFields\n    }\n  }\n": types.WikiDocumentDocument,
    "\n  query WikiDocuments(\n    $operationId: ID!\n    $parentDocumentId: ID\n    $search: String\n    $first: Int\n    $after: String\n  ) {\n    wikiDocuments(\n      operationId: $operationId\n      parentDocumentId: $parentDocumentId\n      search: $search\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          id\n          operationId\n          parentDocument { id }\n          title\n          emoji\n          sortOrder\n          createdBy { id username }\n          createdAt\n          updatedAt\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n": types.WikiDocumentsDocument,
    "\n  query WikiSearch(\n    $operationId: ID!\n    $scope: ID\n    $query: String!\n    $offset: Int\n    $limit: Int\n  ) {\n    wikiSearch(\n      operationId: $operationId\n      scope: $scope\n      query: $query\n      offset: $offset\n      limit: $limit\n    ) {\n      hits {\n        document {\n          id\n          title\n          emoji\n          icon\n          parentDocument { id }\n          createdBy { id username }\n        }\n        snippet\n        matchRanges { start end }\n        score\n      }\n      total\n      hasMore\n    }\n  }\n": types.WikiSearchDocument,
    "\n  query WikiDocumentTrash($operationId: ID!, $first: Int, $after: String) {\n    wikiDocumentTrash(operationId: $operationId, first: $first, after: $after) {\n      edges {\n        node {\n          id\n          title\n          emoji\n          icon\n          deletedAt\n          deletedBy { id username }\n          createdAt\n          ancestors { id title emoji icon isDeleted }\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n": types.WikiDocumentTrashDocument,
    "\n  query WikiDocumentBackups($documentId: ID!, $first: Int, $after: String) {\n    wikiDocumentBackups(documentId: $documentId, first: $first, after: $after) {\n      edges {\n        node {\n          ...WikiDocumentBackupListFields\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n": types.WikiDocumentBackupsDocument,
    "\n  query WikiDocumentBackupDetail($id: ID!) {\n    wikiDocumentBackup(id: $id) {\n      ...WikiDocumentBackupDetailFields\n    }\n  }\n": types.WikiDocumentBackupDetailDocument,
    "\n  query WikiDocumentPresence($documentId: ID!) {\n    wikiDocumentPresence(documentId: $documentId) {\n      documentId\n      activeEditors { userId username connectedAt }\n    }\n  }\n": types.WikiDocumentPresenceDocument,
    "\n  query WikiOperationPresence($operationId: ID!) {\n    wikiOperationPresence(operationId: $operationId) {\n      documentId\n      activeEditors { userId username connectedAt }\n    }\n  }\n": types.WikiOperationPresenceDocument,
    "\n  mutation CreateWikiDocument($operationId: ID!, $input: CreateWikiDocumentInput!) {\n    createWikiDocument(operationId: $operationId, input: $input) {\n      id operationId title emoji color icon sortOrder\n      parentDocument { id }\n      createdBy { id username }\n      createdAt updatedAt\n    }\n  }\n": types.CreateWikiDocumentDocument,
    "\n  mutation UpdateWikiDocument($id: ID!, $input: UpdateWikiDocumentInput!) {\n    updateWikiDocument(id: $id, input: $input) {\n      id title emoji color icon sortOrder\n      parentDocument { id }\n      updatedAt\n    }\n  }\n": types.UpdateWikiDocumentDocument,
    "\n  mutation DeleteWikiDocument($id: ID!) {\n    deleteWikiDocument(id: $id)\n  }\n": types.DeleteWikiDocumentDocument,
    "\n  mutation RestoreWikiDocument($id: ID!, $cascade: Boolean) {\n    restoreWikiDocument(id: $id, cascade: $cascade) {\n      id operationId title emoji sortOrder\n      parentDocument { id }\n    }\n  }\n": types.RestoreWikiDocumentDocument,
    "\n  query WikiDocumentTrashedDescendants($documentId: ID!) {\n    wikiDocumentTrashedDescendants(documentId: $documentId) {\n      id title emoji icon\n    }\n  }\n": types.WikiDocumentTrashedDescendantsDocument,
    "\n  mutation PermanentlyDeleteWikiDocument($id: ID!) {\n    permanentlyDeleteWikiDocument(id: $id)\n  }\n": types.PermanentlyDeleteWikiDocumentDocument,
    "\n  mutation EmptyWikiDocumentTrash($operationId: ID!) {\n    emptyWikiDocumentTrash(operationId: $operationId)\n  }\n": types.EmptyWikiDocumentTrashDocument,
    "\n  mutation CreateWikiDocumentBackup($documentId: ID!, $description: String) {\n    createWikiDocumentBackup(documentId: $documentId, description: $description) {\n      id documentId title trigger description\n      createdBy { id username }\n      createdAt\n    }\n  }\n": types.CreateWikiDocumentBackupDocument,
    "\n  mutation RestoreWikiDocumentBackup($documentId: ID!, $backupId: ID!) {\n    restoreWikiDocumentBackup(documentId: $documentId, backupId: $backupId) {\n      id title content\n    }\n  }\n": types.RestoreWikiDocumentBackupDocument,
    "\n  mutation DeleteWikiDocumentBackup($id: ID!) {\n    deleteWikiDocumentBackup(id: $id)\n  }\n": types.DeleteWikiDocumentBackupDocument,
    "\n  subscription WikiDocumentChanged($operationId: ID!) {\n    wikiDocumentChanged(operationId: $operationId) {\n      action\n      documentId\n      operationId\n      parentDocumentId\n      document { id title emoji sortOrder parentDocument { id } }\n    }\n  }\n": types.WikiDocumentChangedDocument,
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
export function graphql(source: "\n  fragment WikiDocumentTreeFields on WikiDocument {\n    id\n    operationId\n    parentDocument { id }\n    title\n    emoji\n    icon\n    color\n    sortOrder\n    childCount\n    createdAt\n    updatedAt\n  }\n"): (typeof documents)["\n  fragment WikiDocumentTreeFields on WikiDocument {\n    id\n    operationId\n    parentDocument { id }\n    title\n    emoji\n    icon\n    color\n    sortOrder\n    childCount\n    createdAt\n    updatedAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment WikiDocumentFields on WikiDocument {\n    id\n    operationId\n    parentDocument { id }\n    title\n    content\n    emoji\n    color\n    icon\n    sortOrder\n    createdBy { id username }\n    lastUpdatedBy { id username }\n    lastUpdatedAt\n    lastBackupAt\n    createdAt\n    updatedAt\n  }\n"): (typeof documents)["\n  fragment WikiDocumentFields on WikiDocument {\n    id\n    operationId\n    parentDocument { id }\n    title\n    content\n    emoji\n    color\n    icon\n    sortOrder\n    createdBy { id username }\n    lastUpdatedBy { id username }\n    lastUpdatedAt\n    lastBackupAt\n    createdAt\n    updatedAt\n  }\n"];
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
export function graphql(source: "\n  query WikiDocumentTree($operationId: ID!) {\n    wikiDocumentTree(operationId: $operationId) {\n      ...WikiDocumentTreeFields\n    }\n  }\n"): (typeof documents)["\n  query WikiDocumentTree($operationId: ID!) {\n    wikiDocumentTree(operationId: $operationId) {\n      ...WikiDocumentTreeFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiDocument($id: ID!) {\n    wikiDocument(id: $id) {\n      ...WikiDocumentFields\n    }\n  }\n"): (typeof documents)["\n  query WikiDocument($id: ID!) {\n    wikiDocument(id: $id) {\n      ...WikiDocumentFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiDocuments(\n    $operationId: ID!\n    $parentDocumentId: ID\n    $search: String\n    $first: Int\n    $after: String\n  ) {\n    wikiDocuments(\n      operationId: $operationId\n      parentDocumentId: $parentDocumentId\n      search: $search\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          id\n          operationId\n          parentDocument { id }\n          title\n          emoji\n          sortOrder\n          createdBy { id username }\n          createdAt\n          updatedAt\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query WikiDocuments(\n    $operationId: ID!\n    $parentDocumentId: ID\n    $search: String\n    $first: Int\n    $after: String\n  ) {\n    wikiDocuments(\n      operationId: $operationId\n      parentDocumentId: $parentDocumentId\n      search: $search\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          id\n          operationId\n          parentDocument { id }\n          title\n          emoji\n          sortOrder\n          createdBy { id username }\n          createdAt\n          updatedAt\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiSearch(\n    $operationId: ID!\n    $scope: ID\n    $query: String!\n    $offset: Int\n    $limit: Int\n  ) {\n    wikiSearch(\n      operationId: $operationId\n      scope: $scope\n      query: $query\n      offset: $offset\n      limit: $limit\n    ) {\n      hits {\n        document {\n          id\n          title\n          emoji\n          icon\n          parentDocument { id }\n          createdBy { id username }\n        }\n        snippet\n        matchRanges { start end }\n        score\n      }\n      total\n      hasMore\n    }\n  }\n"): (typeof documents)["\n  query WikiSearch(\n    $operationId: ID!\n    $scope: ID\n    $query: String!\n    $offset: Int\n    $limit: Int\n  ) {\n    wikiSearch(\n      operationId: $operationId\n      scope: $scope\n      query: $query\n      offset: $offset\n      limit: $limit\n    ) {\n      hits {\n        document {\n          id\n          title\n          emoji\n          icon\n          parentDocument { id }\n          createdBy { id username }\n        }\n        snippet\n        matchRanges { start end }\n        score\n      }\n      total\n      hasMore\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiDocumentTrash($operationId: ID!, $first: Int, $after: String) {\n    wikiDocumentTrash(operationId: $operationId, first: $first, after: $after) {\n      edges {\n        node {\n          id\n          title\n          emoji\n          icon\n          deletedAt\n          deletedBy { id username }\n          createdAt\n          ancestors { id title emoji icon isDeleted }\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query WikiDocumentTrash($operationId: ID!, $first: Int, $after: String) {\n    wikiDocumentTrash(operationId: $operationId, first: $first, after: $after) {\n      edges {\n        node {\n          id\n          title\n          emoji\n          icon\n          deletedAt\n          deletedBy { id username }\n          createdAt\n          ancestors { id title emoji icon isDeleted }\n        }\n        cursor\n      }\n      pageInfo { hasNextPage endCursor }\n      totalCount\n    }\n  }\n"];
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
export function graphql(source: "\n  mutation CreateWikiDocument($operationId: ID!, $input: CreateWikiDocumentInput!) {\n    createWikiDocument(operationId: $operationId, input: $input) {\n      id operationId title emoji color icon sortOrder\n      parentDocument { id }\n      createdBy { id username }\n      createdAt updatedAt\n    }\n  }\n"): (typeof documents)["\n  mutation CreateWikiDocument($operationId: ID!, $input: CreateWikiDocumentInput!) {\n    createWikiDocument(operationId: $operationId, input: $input) {\n      id operationId title emoji color icon sortOrder\n      parentDocument { id }\n      createdBy { id username }\n      createdAt updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateWikiDocument($id: ID!, $input: UpdateWikiDocumentInput!) {\n    updateWikiDocument(id: $id, input: $input) {\n      id title emoji color icon sortOrder\n      parentDocument { id }\n      updatedAt\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateWikiDocument($id: ID!, $input: UpdateWikiDocumentInput!) {\n    updateWikiDocument(id: $id, input: $input) {\n      id title emoji color icon sortOrder\n      parentDocument { id }\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteWikiDocument($id: ID!) {\n    deleteWikiDocument(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeleteWikiDocument($id: ID!) {\n    deleteWikiDocument(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RestoreWikiDocument($id: ID!, $cascade: Boolean) {\n    restoreWikiDocument(id: $id, cascade: $cascade) {\n      id operationId title emoji sortOrder\n      parentDocument { id }\n    }\n  }\n"): (typeof documents)["\n  mutation RestoreWikiDocument($id: ID!, $cascade: Boolean) {\n    restoreWikiDocument(id: $id, cascade: $cascade) {\n      id operationId title emoji sortOrder\n      parentDocument { id }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WikiDocumentTrashedDescendants($documentId: ID!) {\n    wikiDocumentTrashedDescendants(documentId: $documentId) {\n      id title emoji icon\n    }\n  }\n"): (typeof documents)["\n  query WikiDocumentTrashedDescendants($documentId: ID!) {\n    wikiDocumentTrashedDescendants(documentId: $documentId) {\n      id title emoji icon\n    }\n  }\n"];
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
export function graphql(source: "\n  subscription WikiDocumentChanged($operationId: ID!) {\n    wikiDocumentChanged(operationId: $operationId) {\n      action\n      documentId\n      operationId\n      parentDocumentId\n      document { id title emoji sortOrder parentDocument { id } }\n    }\n  }\n"): (typeof documents)["\n  subscription WikiDocumentChanged($operationId: ID!) {\n    wikiDocumentChanged(operationId: $operationId) {\n      action\n      documentId\n      operationId\n      parentDocumentId\n      document { id title emoji sortOrder parentDocument { id } }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription WikiDocumentPresenceChanged($operationId: ID!) {\n    wikiDocumentPresenceChanged(operationId: $operationId) {\n      documentId operationId userId username action\n    }\n  }\n"): (typeof documents)["\n  subscription WikiDocumentPresenceChanged($operationId: ID!) {\n    wikiDocumentPresenceChanged(operationId: $operationId) {\n      documentId operationId userId username action\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;