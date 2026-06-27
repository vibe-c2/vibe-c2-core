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
    "\n  fragment CredentialFields on Credential {\n    id\n    operationId\n    name\n    type\n    username\n    password\n    keys {\n      name\n      content\n    }\n    properties {\n      name\n      value\n    }\n    isValid\n    tags\n    comments {\n      ...CredentialCommentFields\n    }\n    viewerCanModerateComments\n    createdBy {\n      id\n      username\n    }\n    backlinkCount\n    createdAt\n    updatedAt\n  }\n": typeof types.CredentialFieldsFragmentDoc,
    "\n  fragment CredentialFieldsWithOperation on Credential {\n    ...CredentialFields\n    operation {\n      id\n      name\n    }\n  }\n": typeof types.CredentialFieldsWithOperationFragmentDoc,
    "\n  query Credential($id: ID!) {\n    credential(id: $id) {\n      ...CredentialFields\n    }\n  }\n": typeof types.CredentialDocument,
    "\n  query Credentials(\n    $operationId: ID!\n    $search: String\n    $searchFields: [CredentialSearchField!]\n    $type: CredentialType\n    $tags: [String!]\n    $validOnly: Boolean\n    $sortBy: CredentialSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    credentials(\n      operationId: $operationId\n      search: $search\n      searchFields: $searchFields\n      type: $type\n      tags: $tags\n      validOnly: $validOnly\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...CredentialFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n": typeof types.CredentialsDocument,
    "\n  query CredentialTags($operationId: ID!) {\n    credentialTags(operationId: $operationId)\n  }\n": typeof types.CredentialTagsDocument,
    "\n  query CredentialSourceHashes($id: ID!) {\n    credential(id: $id) {\n      id\n      sourceHashes {\n        id\n        value\n        status\n      }\n    }\n  }\n": typeof types.CredentialSourceHashesDocument,
    "\n  query CredentialBacklinks($credentialId: ID!) {\n    wikiDocumentsReferencingCredential(credentialId: $credentialId) {\n      ...WikiDocumentBacklinkFields\n    }\n  }\n": typeof types.CredentialBacklinksDocument,
    "\n  query MyCredentials(\n    $operationIds: [ID!]\n    $search: String\n    $searchFields: [CredentialSearchField!]\n    $type: CredentialType\n    $tags: [String!]\n    $validOnly: Boolean\n    $sortBy: CredentialSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    myCredentials(\n      operationIds: $operationIds\n      search: $search\n      searchFields: $searchFields\n      type: $type\n      tags: $tags\n      validOnly: $validOnly\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...CredentialFieldsWithOperation\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n": typeof types.MyCredentialsDocument,
    "\n  query MyCredentialTags($operationIds: [ID!]) {\n    myCredentialTags(operationIds: $operationIds)\n  }\n": typeof types.MyCredentialTagsDocument,
    "\n  mutation CreateCredential($operationId: ID!, $input: CreateCredentialInput!) {\n    createCredential(operationId: $operationId, input: $input) {\n      ...CredentialFields\n    }\n  }\n": typeof types.CreateCredentialDocument,
    "\n  mutation UpdateCredential($id: ID!, $input: UpdateCredentialInput!) {\n    updateCredential(id: $id, input: $input) {\n      ...CredentialFields\n    }\n  }\n": typeof types.UpdateCredentialDocument,
    "\n  mutation DeleteCredential($id: ID!) {\n    deleteCredential(id: $id)\n  }\n": typeof types.DeleteCredentialDocument,
    "\n  mutation AddCredentialComment($credentialId: ID!, $text: String!) {\n    addCredentialComment(credentialId: $credentialId, text: $text) {\n      ...CredentialFields\n    }\n  }\n": typeof types.AddCredentialCommentDocument,
    "\n  mutation UpdateCredentialComment(\n    $credentialId: ID!\n    $commentId: ID!\n    $text: String!\n  ) {\n    updateCredentialComment(\n      credentialId: $credentialId\n      commentId: $commentId\n      text: $text\n    ) {\n      ...CredentialFields\n    }\n  }\n": typeof types.UpdateCredentialCommentDocument,
    "\n  mutation DeleteCredentialComment($credentialId: ID!, $commentId: ID!) {\n    deleteCredentialComment(credentialId: $credentialId, commentId: $commentId) {\n      ...CredentialFields\n    }\n  }\n": typeof types.DeleteCredentialCommentDocument,
    "\n  subscription CredentialChanged($operationId: ID!) {\n    credentialChanged(operationId: $operationId) {\n      action\n      credentialId\n      operationId\n      credential {\n        ...CredentialFields\n      }\n    }\n  }\n": typeof types.CredentialChangedDocument,
    "\n  subscription MyCredentialChanged($operationIds: [ID!]) {\n    myCredentialChanged(operationIds: $operationIds) {\n      action\n      credentialId\n      operationId\n      credential {\n        ...CredentialFieldsWithOperation\n      }\n    }\n  }\n": typeof types.MyCredentialChangedDocument,
    "\n  fragment HashFields on Hash {\n    id\n    operationId\n    value\n    status\n    comment\n    tags\n    credentialId\n    createdBy {\n      id\n      username\n    }\n    createdAt\n    updatedAt\n  }\n": typeof types.HashFieldsFragmentDoc,
    "\n  fragment HashFieldsWithCredential on Hash {\n    ...HashFields\n    credential {\n      id\n      name\n      type\n      username\n    }\n  }\n": typeof types.HashFieldsWithCredentialFragmentDoc,
    "\n  fragment HashFieldsWithOperation on Hash {\n    ...HashFields\n    operation {\n      id\n      name\n    }\n  }\n": typeof types.HashFieldsWithOperationFragmentDoc,
    "\n  query Hash($id: ID!) {\n    hash(id: $id) {\n      ...HashFieldsWithCredential\n    }\n  }\n": typeof types.HashDocument,
    "\n  query Hashes(\n    $operationId: ID!\n    $search: String\n    $statuses: [HashStatus!]\n    $tags: [String!]\n    $hasCredential: Boolean\n    $first: Int\n    $after: String\n  ) {\n    hashes(\n      operationId: $operationId\n      search: $search\n      statuses: $statuses\n      tags: $tags\n      hasCredential: $hasCredential\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...HashFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n": typeof types.HashesDocument,
    "\n  query HashTags($operationId: ID!) {\n    hashTags(operationId: $operationId)\n  }\n": typeof types.HashTagsDocument,
    "\n  query HashBacklinks($hashId: ID!) {\n    wikiDocumentsReferencingHash(hashId: $hashId) {\n      ...WikiDocumentBacklinkFields\n    }\n  }\n": typeof types.HashBacklinksDocument,
    "\n  query MyHashes(\n    $operationIds: [ID!]\n    $search: String\n    $statuses: [HashStatus!]\n    $tags: [String!]\n    $hasCredential: Boolean\n    $first: Int\n    $after: String\n  ) {\n    myHashes(\n      operationIds: $operationIds\n      search: $search\n      statuses: $statuses\n      tags: $tags\n      hasCredential: $hasCredential\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...HashFieldsWithOperation\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n": typeof types.MyHashesDocument,
    "\n  query MyHashTags($operationIds: [ID!]) {\n    myHashTags(operationIds: $operationIds)\n  }\n": typeof types.MyHashTagsDocument,
    "\n  mutation CreateHash($operationId: ID!, $input: CreateHashInput!) {\n    createHash(operationId: $operationId, input: $input) {\n      ...HashFields\n    }\n  }\n": typeof types.CreateHashDocument,
    "\n  mutation UpdateHash($id: ID!, $input: UpdateHashInput!) {\n    updateHash(id: $id, input: $input) {\n      ...HashFields\n    }\n  }\n": typeof types.UpdateHashDocument,
    "\n  mutation DeleteHash($id: ID!) {\n    deleteHash(id: $id)\n  }\n": typeof types.DeleteHashDocument,
    "\n  mutation BulkImportHashes($operationId: ID!, $input: BulkImportHashesInput!) {\n    bulkImportHashes(operationId: $operationId, input: $input) {\n      added\n      skipped\n      hashes {\n        ...HashFields\n      }\n    }\n  }\n": typeof types.BulkImportHashesDocument,
    "\n  mutation MarkHashCracked($id: ID!, $input: MarkHashCrackedInput!) {\n    markHashCracked(id: $id, input: $input) {\n      ...HashFieldsWithCredential\n    }\n  }\n": typeof types.MarkHashCrackedDocument,
    "\n  subscription HashChanged($operationId: ID!) {\n    hashChanged(operationId: $operationId) {\n      action\n      hashId\n      operationId\n      hash {\n        ...HashFields\n      }\n    }\n  }\n": typeof types.HashChangedDocument,
    "\n  subscription MyHashChanged($operationIds: [ID!]) {\n    myHashChanged(operationIds: $operationIds) {\n      action\n      hashId\n      operationId\n      hash {\n        ...HashFieldsWithOperation\n      }\n    }\n  }\n": typeof types.MyHashChangedDocument,
    "\n  fragment HostFields on Host {\n    id\n    operationId\n    hostname\n    os\n    emoji\n    icon\n    color\n    interfaces {\n      name\n      mac\n      addresses\n    }\n    routes {\n      destination\n      gateway\n      interface\n    }\n    logins {\n      user\n      from\n      tty\n      lastSeen\n      count\n    }\n    createdBy {\n      id\n      username\n    }\n    createdAt\n    updatedAt\n  }\n": typeof types.HostFieldsFragmentDoc,
    "\n  query Hosts(\n    $operationId: ID!\n    $search: String\n    $sortBy: HostSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    hosts(\n      operationId: $operationId\n      search: $search\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...HostFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n": typeof types.HostsDocument,
    "\n  query Host($id: ID!) {\n    host(id: $id) {\n      ...HostFields\n    }\n  }\n": typeof types.HostDocument,
    "\n  mutation CreateHost($operationId: ID!, $input: CreateHostInput!) {\n    createHost(operationId: $operationId, input: $input) {\n      ...HostFields\n    }\n  }\n": typeof types.CreateHostDocument,
    "\n  mutation UpdateHost($id: ID!, $input: UpdateHostInput!) {\n    updateHost(id: $id, input: $input) {\n      ...HostFields\n    }\n  }\n": typeof types.UpdateHostDocument,
    "\n  mutation DeleteHost($id: ID!) {\n    deleteHost(id: $id)\n  }\n": typeof types.DeleteHostDocument,
    "\n  subscription HostChanged($operationId: ID!) {\n    hostChanged(operationId: $operationId) {\n      action\n      hostId\n    }\n  }\n": typeof types.HostChangedDocument,
    "\n  fragment ModuleFields on Module {\n    instance\n    type\n    version\n    status\n    lastStatus\n    registeredAt\n    lastHeartbeatAt\n    deregisteredAt\n    deregisterReason\n    declaredDeadAt\n  }\n": typeof types.ModuleFieldsFragmentDoc,
    "\n  query Modules($status: [String!]) {\n    modules(status: $status) {\n      ...ModuleFields\n    }\n  }\n": typeof types.ModulesDocument,
    "\n  mutation RemoveModule($instance: ID!) {\n    removeModule(instance: $instance) {\n      ...ModuleFields\n    }\n  }\n": typeof types.RemoveModuleDocument,
    "\n  subscription ModuleChanged {\n    moduleChanged {\n      action\n      instance\n      module {\n        ...ModuleFields\n      }\n    }\n  }\n": typeof types.ModuleChangedDocument,
    "\n  fragment OperationMemberFields on OperationMember {\n    user {\n      id\n      username\n      roles\n      active\n      createdAt\n      updatedAt\n    }\n    role\n  }\n": typeof types.OperationMemberFieldsFragmentDoc,
    "\n  fragment OperationFields on Operation {\n    id\n    name\n    description\n    members {\n      ...OperationMemberFields\n    }\n    createdAt\n    updatedAt\n  }\n": typeof types.OperationFieldsFragmentDoc,
    "\n  query Operation($id: ID!) {\n    operation(id: $id) {\n      ...OperationFields\n    }\n  }\n": typeof types.OperationDocument,
    "\n  query Operations(\n    $search: String\n    $sortBy: OperationSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    operations(\n      search: $search\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...OperationFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n": typeof types.OperationsDocument,
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
    "\n  fragment TaskFields on Task {\n    id\n    operationId\n    name\n    description\n    riskScore\n    riskDescription\n    profitScore\n    profitDescription\n    stage\n    status\n    summary\n    assignees {\n      id\n      username\n    }\n    wikiReferences {\n      id\n      title\n      emoji\n    }\n    credentialReferences {\n      id\n      name\n      type\n    }\n    createdBy {\n      id\n      username\n    }\n    lastUpdatedBy {\n      id\n      username\n    }\n    lastUpdatedAt\n    deletedAt\n    doneAt\n    createdAt\n    updatedAt\n  }\n": typeof types.TaskFieldsFragmentDoc,
    "\n  fragment TaskBacklinkFields on Task {\n    id\n    operationId\n    name\n    stage\n    status\n    riskScore\n    profitScore\n    assignees {\n      id\n      username\n    }\n  }\n": typeof types.TaskBacklinkFieldsFragmentDoc,
    "\n  query Task($id: ID!) {\n    task(id: $id) {\n      ...TaskFields\n    }\n  }\n": typeof types.TaskDocument,
    "\n  query Tasks(\n    $operationId: ID!\n    $stage: TaskStage\n    $excludeStages: [TaskStage!]\n    $riskScoreMin: Int\n    $riskScoreMax: Int\n    $profitScoreMin: Int\n    $profitScoreMax: Int\n    $search: String\n    $first: Int\n    $after: String\n  ) {\n    tasks(\n      operationId: $operationId\n      stage: $stage\n      excludeStages: $excludeStages\n      riskScoreMin: $riskScoreMin\n      riskScoreMax: $riskScoreMax\n      profitScoreMin: $profitScoreMin\n      profitScoreMax: $profitScoreMax\n      search: $search\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...TaskFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n": typeof types.TasksDocument,
    "\n  query TaskTrash(\n    $operationId: ID!\n    $first: Int\n    $after: String\n  ) {\n    taskTrash(operationId: $operationId, first: $first, after: $after) {\n      edges {\n        node {\n          ...TaskFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n": typeof types.TaskTrashDocument,
    "\n  query TasksReferencingWikiDocument($documentId: ID!) {\n    tasksReferencingWikiDocument(documentId: $documentId) {\n      ...TaskBacklinkFields\n    }\n  }\n": typeof types.TasksReferencingWikiDocumentDocument,
    "\n  query TasksReferencingCredential($credentialId: ID!) {\n    tasksReferencingCredential(credentialId: $credentialId) {\n      ...TaskBacklinkFields\n    }\n  }\n": typeof types.TasksReferencingCredentialDocument,
    "\n  mutation CreateTask($input: CreateTaskInput!) {\n    createTask(input: $input) {\n      ...TaskFields\n    }\n  }\n": typeof types.CreateTaskDocument,
    "\n  mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) {\n    updateTask(id: $id, input: $input) {\n      ...TaskFields\n    }\n  }\n": typeof types.UpdateTaskDocument,
    "\n  mutation ChangeTaskStage($input: ChangeTaskStageInput!) {\n    changeTaskStage(input: $input) {\n      ...TaskFields\n    }\n  }\n": typeof types.ChangeTaskStageDocument,
    "\n  mutation SetTaskAssignees($taskId: ID!, $assigneeIds: [ID!]!) {\n    setTaskAssignees(taskId: $taskId, assigneeIds: $assigneeIds) {\n      ...TaskFields\n    }\n  }\n": typeof types.SetTaskAssigneesDocument,
    "\n  mutation SetTaskWikiReferences($taskId: ID!, $wikiIds: [ID!]!) {\n    setTaskWikiReferences(taskId: $taskId, wikiIds: $wikiIds) {\n      ...TaskFields\n    }\n  }\n": typeof types.SetTaskWikiReferencesDocument,
    "\n  mutation AddTaskWikiReference($taskId: ID!, $wikiId: ID!) {\n    addTaskWikiReference(taskId: $taskId, wikiId: $wikiId) {\n      ...TaskFields\n    }\n  }\n": typeof types.AddTaskWikiReferenceDocument,
    "\n  mutation SetTaskCredentialReferences(\n    $taskId: ID!\n    $credentialIds: [ID!]!\n  ) {\n    setTaskCredentialReferences(\n      taskId: $taskId\n      credentialIds: $credentialIds\n    ) {\n      ...TaskFields\n    }\n  }\n": typeof types.SetTaskCredentialReferencesDocument,
    "\n  mutation DeleteTask($id: ID!) {\n    deleteTask(id: $id)\n  }\n": typeof types.DeleteTaskDocument,
    "\n  mutation RestoreTask($id: ID!) {\n    restoreTask(id: $id) {\n      ...TaskFields\n    }\n  }\n": typeof types.RestoreTaskDocument,
    "\n  mutation PurgeTask($id: ID!) {\n    purgeTask(id: $id)\n  }\n": typeof types.PurgeTaskDocument,
    "\n  subscription TaskChanged($operationId: ID!) {\n    taskChanged(operationId: $operationId) {\n      action\n      taskId\n      operationId\n      task {\n        ...TaskFields\n      }\n    }\n  }\n": typeof types.TaskChangedDocument,
    "\n  fragment TimelineEventFields on TimelineEvent {\n    id\n    operationId\n    topic\n    subjectKind\n    subjectId\n    subjectName\n    occurredAt\n    metadata\n    actor {\n      id\n      username\n    }\n  }\n": typeof types.TimelineEventFieldsFragmentDoc,
    "\n  query TimelineBuckets(\n    $operationId: ID!\n    $granularity: TimelineGranularity = DAY\n    $timezone: String!\n    $from: String\n    $to: String\n    $types: [String!]\n    $actorIds: [ID!]\n  ) {\n    timelineBuckets(\n      operationId: $operationId\n      granularity: $granularity\n      timezone: $timezone\n      from: $from\n      to: $to\n      types: $types\n      actorIds: $actorIds\n    ) {\n      bucketStart\n      count\n      topicCounts {\n        topic\n        subjectKind\n        count\n        emoji\n        icon\n        color\n      }\n    }\n  }\n": typeof types.TimelineBucketsDocument,
    "\n  query TimelineEventsByDay(\n    $operationId: ID!\n    $date: String!\n    $timezone: String!\n    $granularity: TimelineGranularity = DAY\n    $types: [String!]\n    $actorIds: [ID!]\n    $first: Int = 100\n    $after: String\n  ) {\n    timelineEventsByDay(\n      operationId: $operationId\n      date: $date\n      timezone: $timezone\n      granularity: $granularity\n      types: $types\n      actorIds: $actorIds\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...TimelineEventFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n    }\n  }\n": typeof types.TimelineEventsByDayDocument,
    "\n  subscription TimelineEventAdded($operationId: ID!) {\n    timelineEventAdded(operationId: $operationId) {\n      ...TimelineEventFields\n    }\n  }\n": typeof types.TimelineEventAddedDocument,
    "\n  mutation CreateCustomTimelineEvent(\n    $operationId: ID!\n    $input: CreateCustomTimelineEventInput!\n  ) {\n    createCustomTimelineEvent(operationId: $operationId, input: $input) {\n      ...TimelineEventFields\n    }\n  }\n": typeof types.CreateCustomTimelineEventDocument,
    "\n  mutation UpdateCustomTimelineEvent(\n    $id: ID!\n    $input: UpdateCustomTimelineEventInput!\n  ) {\n    updateCustomTimelineEvent(id: $id, input: $input) {\n      ...TimelineEventFields\n    }\n  }\n": typeof types.UpdateCustomTimelineEventDocument,
    "\n  mutation DeleteCustomTimelineEvent($id: ID!) {\n    deleteCustomTimelineEvent(id: $id)\n  }\n": typeof types.DeleteCustomTimelineEventDocument,
    "\n  fragment UserFields on User {\n    id\n    username\n    roles\n    active\n    createdAt\n    updatedAt\n  }\n": typeof types.UserFieldsFragmentDoc,
    "\n  query Me {\n    me {\n      ...UserFields\n      hiddenIdentities\n    }\n  }\n": typeof types.MeDocument,
    "\n  query User($id: ID!) {\n    user(id: $id) {\n      ...UserFields\n    }\n  }\n": typeof types.UserDocument,
    "\n  query Users(\n    $search: String\n    $sortBy: UserSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    users(\n      search: $search\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...UserFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n": typeof types.UsersDocument,
    "\n  mutation CreateUser($input: CreateUserInput!) {\n    createUser(input: $input) {\n      ...UserFields\n    }\n  }\n": typeof types.CreateUserDocument,
    "\n  mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {\n    updateUser(id: $id, input: $input) {\n      ...UserFields\n    }\n  }\n": typeof types.UpdateUserDocument,
    "\n  mutation DeleteUser($id: ID!) {\n    deleteUser(id: $id)\n  }\n": typeof types.DeleteUserDocument,
    "\n  mutation UpdateOwnProfile($input: UpdateUserInput!) {\n    updateOwnProfile(input: $input) {\n      ...UserFields\n    }\n  }\n": typeof types.UpdateOwnProfileDocument,
    "\n  mutation SetHiddenIdentities($names: [String!]!) {\n    setHiddenIdentities(names: $names) {\n      id\n      hiddenIdentities\n    }\n  }\n": typeof types.SetHiddenIdentitiesDocument,
    "\n  subscription UserChanged {\n    userChanged {\n      action\n      userId\n      username\n      user {\n        ...UserFields\n      }\n    }\n  }\n": typeof types.UserChangedDocument,
    "\n  fragment WikiDocumentTreeFields on WikiDocument {\n    id\n    # operationId is required so per-parent cache writes (revealPath,\n    # ensureWikiTree) can key on the row's *actual* operation rather than\n    # trusting whichever operationId the caller had in scope at fetch time.\n    # Without it, opening a /wiki/<operationDocId> URL while the Public tab\n    # is active silently pollutes the Public children cache with operation\n    # rows — sidebar then renders the wrong tree under Public.\n    operationId\n    parentDocumentId\n    title\n    emoji\n    icon\n    color\n    sortOrder\n    childCount\n    hasContent\n    isTemplate\n    sourceTemplateId\n    checklistTotal\n    checklistRequired\n    checklistAnswered\n    lastUpdatedAt\n    updatedAt\n  }\n": typeof types.WikiDocumentTreeFieldsFragmentDoc,
    "\n  fragment WikiDocumentLiteFields on WikiDocument {\n    id\n    title\n    emoji\n    icon\n    color\n    isTemplate\n    deletedAt\n  }\n": typeof types.WikiDocumentLiteFieldsFragmentDoc,
    "\n  fragment WikiDocumentBacklinkFields on WikiDocument {\n    id\n    title\n    emoji\n    icon\n    color\n    updatedAt\n    ancestors { id title emoji icon color isDeleted }\n  }\n": typeof types.WikiDocumentBacklinkFieldsFragmentDoc,
    "\n  fragment WikiDocumentFields on WikiDocument {\n    id\n    operationId\n    parentDocumentId\n    ancestors { id title emoji icon color isDeleted }\n    title\n    content\n    emoji\n    color\n    icon\n    sortOrder\n    isTemplate\n    sourceTemplateId\n    checklistTotal\n    checklistRequired\n    checklistAnswered\n    createdBy { id username }\n    lastUpdatedBy { id username }\n    lastUpdatedAt\n    lastBackupAt\n    createdAt\n    updatedAt\n  }\n": typeof types.WikiDocumentFieldsFragmentDoc,
    "\n  fragment WikiDocumentBackupListFields on WikiDocumentBackup {\n    id\n    documentId\n    title\n    trigger\n    description\n    contentLength\n    createdBy { id username }\n    createdAt\n  }\n": typeof types.WikiDocumentBackupListFieldsFragmentDoc,
    "\n  fragment WikiDocumentBackupDetailFields on WikiDocumentBackup {\n    id\n    documentId\n    title\n    content\n    contentLength\n    trigger\n    description\n    createdBy { id username }\n    createdAt\n  }\n": typeof types.WikiDocumentBackupDetailFieldsFragmentDoc,
    "\n  fragment WikiDocumentVisitListFields on WikiDocumentVisit {\n    id\n    visitedAt\n    document {\n      id\n      title\n      emoji\n      icon\n      color\n      ancestors { id title emoji icon color isDeleted }\n    }\n  }\n": typeof types.WikiDocumentVisitListFieldsFragmentDoc,
    "\n  query WikiDocumentTree($operationId: ID!) {\n    wikiDocumentTree(operationId: $operationId) {\n      ...WikiDocumentTreeFields\n    }\n  }\n": typeof types.WikiDocumentTreeDocument,
    "\n  query WikiDocumentChildren($operationId: ID!, $parentDocumentId: ID) {\n    wikiDocumentChildren(\n      operationId: $operationId\n      parentDocumentId: $parentDocumentId\n    ) {\n      ...WikiDocumentTreeFields\n    }\n  }\n": typeof types.WikiDocumentChildrenDocument,
    "\n  query WikiDocumentTreeRevealPath($documentId: ID!) {\n    wikiDocumentTreeRevealPath(documentId: $documentId) {\n      ...WikiDocumentTreeFields\n    }\n  }\n": typeof types.WikiDocumentTreeRevealPathDocument,
    "\n  query WikiDocumentTrashCount($operationId: ID!) {\n    wikiDocumentTrashCount(operationId: $operationId)\n  }\n": typeof types.WikiDocumentTrashCountDocument,
    "\n  query WikiDocument($id: ID!) {\n    wikiDocument(id: $id) {\n      ...WikiDocumentFields\n    }\n  }\n": typeof types.WikiDocumentDocument,
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
    "\n  mutation SetWikiDocumentTemplate($id: ID!, $isTemplate: Boolean!) {\n    setWikiDocumentTemplate(id: $id, isTemplate: $isTemplate) {\n      id operationId title emoji icon color sortOrder\n      parentDocumentId\n      isTemplate\n      updatedAt\n    }\n  }\n": typeof types.SetWikiDocumentTemplateDocument,
    "\n  mutation InstantiateTemplate(\n    $templateId: ID!\n    $targetOperationId: ID!\n    $parentDocumentId: ID\n    $title: String\n    $emoji: String\n    $icon: String\n    $color: String\n  ) {\n    instantiateTemplate(\n      templateId: $templateId\n      targetOperationId: $targetOperationId\n      parentDocumentId: $parentDocumentId\n      title: $title\n      emoji: $emoji\n      icon: $icon\n      color: $color\n    ) {\n      id operationId title emoji color icon sortOrder\n      parentDocumentId\n      isTemplate\n      sourceTemplateId\n      checklistTotal\n      checklistRequired\n      checklistAnswered\n      createdAt updatedAt\n    }\n  }\n": typeof types.InstantiateTemplateDocument,
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
    "\n  fragment CredentialFields on Credential {\n    id\n    operationId\n    name\n    type\n    username\n    password\n    keys {\n      name\n      content\n    }\n    properties {\n      name\n      value\n    }\n    isValid\n    tags\n    comments {\n      ...CredentialCommentFields\n    }\n    viewerCanModerateComments\n    createdBy {\n      id\n      username\n    }\n    backlinkCount\n    createdAt\n    updatedAt\n  }\n": types.CredentialFieldsFragmentDoc,
    "\n  fragment CredentialFieldsWithOperation on Credential {\n    ...CredentialFields\n    operation {\n      id\n      name\n    }\n  }\n": types.CredentialFieldsWithOperationFragmentDoc,
    "\n  query Credential($id: ID!) {\n    credential(id: $id) {\n      ...CredentialFields\n    }\n  }\n": types.CredentialDocument,
    "\n  query Credentials(\n    $operationId: ID!\n    $search: String\n    $searchFields: [CredentialSearchField!]\n    $type: CredentialType\n    $tags: [String!]\n    $validOnly: Boolean\n    $sortBy: CredentialSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    credentials(\n      operationId: $operationId\n      search: $search\n      searchFields: $searchFields\n      type: $type\n      tags: $tags\n      validOnly: $validOnly\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...CredentialFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n": types.CredentialsDocument,
    "\n  query CredentialTags($operationId: ID!) {\n    credentialTags(operationId: $operationId)\n  }\n": types.CredentialTagsDocument,
    "\n  query CredentialSourceHashes($id: ID!) {\n    credential(id: $id) {\n      id\n      sourceHashes {\n        id\n        value\n        status\n      }\n    }\n  }\n": types.CredentialSourceHashesDocument,
    "\n  query CredentialBacklinks($credentialId: ID!) {\n    wikiDocumentsReferencingCredential(credentialId: $credentialId) {\n      ...WikiDocumentBacklinkFields\n    }\n  }\n": types.CredentialBacklinksDocument,
    "\n  query MyCredentials(\n    $operationIds: [ID!]\n    $search: String\n    $searchFields: [CredentialSearchField!]\n    $type: CredentialType\n    $tags: [String!]\n    $validOnly: Boolean\n    $sortBy: CredentialSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    myCredentials(\n      operationIds: $operationIds\n      search: $search\n      searchFields: $searchFields\n      type: $type\n      tags: $tags\n      validOnly: $validOnly\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...CredentialFieldsWithOperation\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n": types.MyCredentialsDocument,
    "\n  query MyCredentialTags($operationIds: [ID!]) {\n    myCredentialTags(operationIds: $operationIds)\n  }\n": types.MyCredentialTagsDocument,
    "\n  mutation CreateCredential($operationId: ID!, $input: CreateCredentialInput!) {\n    createCredential(operationId: $operationId, input: $input) {\n      ...CredentialFields\n    }\n  }\n": types.CreateCredentialDocument,
    "\n  mutation UpdateCredential($id: ID!, $input: UpdateCredentialInput!) {\n    updateCredential(id: $id, input: $input) {\n      ...CredentialFields\n    }\n  }\n": types.UpdateCredentialDocument,
    "\n  mutation DeleteCredential($id: ID!) {\n    deleteCredential(id: $id)\n  }\n": types.DeleteCredentialDocument,
    "\n  mutation AddCredentialComment($credentialId: ID!, $text: String!) {\n    addCredentialComment(credentialId: $credentialId, text: $text) {\n      ...CredentialFields\n    }\n  }\n": types.AddCredentialCommentDocument,
    "\n  mutation UpdateCredentialComment(\n    $credentialId: ID!\n    $commentId: ID!\n    $text: String!\n  ) {\n    updateCredentialComment(\n      credentialId: $credentialId\n      commentId: $commentId\n      text: $text\n    ) {\n      ...CredentialFields\n    }\n  }\n": types.UpdateCredentialCommentDocument,
    "\n  mutation DeleteCredentialComment($credentialId: ID!, $commentId: ID!) {\n    deleteCredentialComment(credentialId: $credentialId, commentId: $commentId) {\n      ...CredentialFields\n    }\n  }\n": types.DeleteCredentialCommentDocument,
    "\n  subscription CredentialChanged($operationId: ID!) {\n    credentialChanged(operationId: $operationId) {\n      action\n      credentialId\n      operationId\n      credential {\n        ...CredentialFields\n      }\n    }\n  }\n": types.CredentialChangedDocument,
    "\n  subscription MyCredentialChanged($operationIds: [ID!]) {\n    myCredentialChanged(operationIds: $operationIds) {\n      action\n      credentialId\n      operationId\n      credential {\n        ...CredentialFieldsWithOperation\n      }\n    }\n  }\n": types.MyCredentialChangedDocument,
    "\n  fragment HashFields on Hash {\n    id\n    operationId\n    value\n    status\n    comment\n    tags\n    credentialId\n    createdBy {\n      id\n      username\n    }\n    createdAt\n    updatedAt\n  }\n": types.HashFieldsFragmentDoc,
    "\n  fragment HashFieldsWithCredential on Hash {\n    ...HashFields\n    credential {\n      id\n      name\n      type\n      username\n    }\n  }\n": types.HashFieldsWithCredentialFragmentDoc,
    "\n  fragment HashFieldsWithOperation on Hash {\n    ...HashFields\n    operation {\n      id\n      name\n    }\n  }\n": types.HashFieldsWithOperationFragmentDoc,
    "\n  query Hash($id: ID!) {\n    hash(id: $id) {\n      ...HashFieldsWithCredential\n    }\n  }\n": types.HashDocument,
    "\n  query Hashes(\n    $operationId: ID!\n    $search: String\n    $statuses: [HashStatus!]\n    $tags: [String!]\n    $hasCredential: Boolean\n    $first: Int\n    $after: String\n  ) {\n    hashes(\n      operationId: $operationId\n      search: $search\n      statuses: $statuses\n      tags: $tags\n      hasCredential: $hasCredential\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...HashFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n": types.HashesDocument,
    "\n  query HashTags($operationId: ID!) {\n    hashTags(operationId: $operationId)\n  }\n": types.HashTagsDocument,
    "\n  query HashBacklinks($hashId: ID!) {\n    wikiDocumentsReferencingHash(hashId: $hashId) {\n      ...WikiDocumentBacklinkFields\n    }\n  }\n": types.HashBacklinksDocument,
    "\n  query MyHashes(\n    $operationIds: [ID!]\n    $search: String\n    $statuses: [HashStatus!]\n    $tags: [String!]\n    $hasCredential: Boolean\n    $first: Int\n    $after: String\n  ) {\n    myHashes(\n      operationIds: $operationIds\n      search: $search\n      statuses: $statuses\n      tags: $tags\n      hasCredential: $hasCredential\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...HashFieldsWithOperation\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n": types.MyHashesDocument,
    "\n  query MyHashTags($operationIds: [ID!]) {\n    myHashTags(operationIds: $operationIds)\n  }\n": types.MyHashTagsDocument,
    "\n  mutation CreateHash($operationId: ID!, $input: CreateHashInput!) {\n    createHash(operationId: $operationId, input: $input) {\n      ...HashFields\n    }\n  }\n": types.CreateHashDocument,
    "\n  mutation UpdateHash($id: ID!, $input: UpdateHashInput!) {\n    updateHash(id: $id, input: $input) {\n      ...HashFields\n    }\n  }\n": types.UpdateHashDocument,
    "\n  mutation DeleteHash($id: ID!) {\n    deleteHash(id: $id)\n  }\n": types.DeleteHashDocument,
    "\n  mutation BulkImportHashes($operationId: ID!, $input: BulkImportHashesInput!) {\n    bulkImportHashes(operationId: $operationId, input: $input) {\n      added\n      skipped\n      hashes {\n        ...HashFields\n      }\n    }\n  }\n": types.BulkImportHashesDocument,
    "\n  mutation MarkHashCracked($id: ID!, $input: MarkHashCrackedInput!) {\n    markHashCracked(id: $id, input: $input) {\n      ...HashFieldsWithCredential\n    }\n  }\n": types.MarkHashCrackedDocument,
    "\n  subscription HashChanged($operationId: ID!) {\n    hashChanged(operationId: $operationId) {\n      action\n      hashId\n      operationId\n      hash {\n        ...HashFields\n      }\n    }\n  }\n": types.HashChangedDocument,
    "\n  subscription MyHashChanged($operationIds: [ID!]) {\n    myHashChanged(operationIds: $operationIds) {\n      action\n      hashId\n      operationId\n      hash {\n        ...HashFieldsWithOperation\n      }\n    }\n  }\n": types.MyHashChangedDocument,
    "\n  fragment HostFields on Host {\n    id\n    operationId\n    hostname\n    os\n    emoji\n    icon\n    color\n    interfaces {\n      name\n      mac\n      addresses\n    }\n    routes {\n      destination\n      gateway\n      interface\n    }\n    logins {\n      user\n      from\n      tty\n      lastSeen\n      count\n    }\n    createdBy {\n      id\n      username\n    }\n    createdAt\n    updatedAt\n  }\n": types.HostFieldsFragmentDoc,
    "\n  query Hosts(\n    $operationId: ID!\n    $search: String\n    $sortBy: HostSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    hosts(\n      operationId: $operationId\n      search: $search\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...HostFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n": types.HostsDocument,
    "\n  query Host($id: ID!) {\n    host(id: $id) {\n      ...HostFields\n    }\n  }\n": types.HostDocument,
    "\n  mutation CreateHost($operationId: ID!, $input: CreateHostInput!) {\n    createHost(operationId: $operationId, input: $input) {\n      ...HostFields\n    }\n  }\n": types.CreateHostDocument,
    "\n  mutation UpdateHost($id: ID!, $input: UpdateHostInput!) {\n    updateHost(id: $id, input: $input) {\n      ...HostFields\n    }\n  }\n": types.UpdateHostDocument,
    "\n  mutation DeleteHost($id: ID!) {\n    deleteHost(id: $id)\n  }\n": types.DeleteHostDocument,
    "\n  subscription HostChanged($operationId: ID!) {\n    hostChanged(operationId: $operationId) {\n      action\n      hostId\n    }\n  }\n": types.HostChangedDocument,
    "\n  fragment ModuleFields on Module {\n    instance\n    type\n    version\n    status\n    lastStatus\n    registeredAt\n    lastHeartbeatAt\n    deregisteredAt\n    deregisterReason\n    declaredDeadAt\n  }\n": types.ModuleFieldsFragmentDoc,
    "\n  query Modules($status: [String!]) {\n    modules(status: $status) {\n      ...ModuleFields\n    }\n  }\n": types.ModulesDocument,
    "\n  mutation RemoveModule($instance: ID!) {\n    removeModule(instance: $instance) {\n      ...ModuleFields\n    }\n  }\n": types.RemoveModuleDocument,
    "\n  subscription ModuleChanged {\n    moduleChanged {\n      action\n      instance\n      module {\n        ...ModuleFields\n      }\n    }\n  }\n": types.ModuleChangedDocument,
    "\n  fragment OperationMemberFields on OperationMember {\n    user {\n      id\n      username\n      roles\n      active\n      createdAt\n      updatedAt\n    }\n    role\n  }\n": types.OperationMemberFieldsFragmentDoc,
    "\n  fragment OperationFields on Operation {\n    id\n    name\n    description\n    members {\n      ...OperationMemberFields\n    }\n    createdAt\n    updatedAt\n  }\n": types.OperationFieldsFragmentDoc,
    "\n  query Operation($id: ID!) {\n    operation(id: $id) {\n      ...OperationFields\n    }\n  }\n": types.OperationDocument,
    "\n  query Operations(\n    $search: String\n    $sortBy: OperationSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    operations(\n      search: $search\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...OperationFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n": types.OperationsDocument,
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
    "\n  fragment TaskFields on Task {\n    id\n    operationId\n    name\n    description\n    riskScore\n    riskDescription\n    profitScore\n    profitDescription\n    stage\n    status\n    summary\n    assignees {\n      id\n      username\n    }\n    wikiReferences {\n      id\n      title\n      emoji\n    }\n    credentialReferences {\n      id\n      name\n      type\n    }\n    createdBy {\n      id\n      username\n    }\n    lastUpdatedBy {\n      id\n      username\n    }\n    lastUpdatedAt\n    deletedAt\n    doneAt\n    createdAt\n    updatedAt\n  }\n": types.TaskFieldsFragmentDoc,
    "\n  fragment TaskBacklinkFields on Task {\n    id\n    operationId\n    name\n    stage\n    status\n    riskScore\n    profitScore\n    assignees {\n      id\n      username\n    }\n  }\n": types.TaskBacklinkFieldsFragmentDoc,
    "\n  query Task($id: ID!) {\n    task(id: $id) {\n      ...TaskFields\n    }\n  }\n": types.TaskDocument,
    "\n  query Tasks(\n    $operationId: ID!\n    $stage: TaskStage\n    $excludeStages: [TaskStage!]\n    $riskScoreMin: Int\n    $riskScoreMax: Int\n    $profitScoreMin: Int\n    $profitScoreMax: Int\n    $search: String\n    $first: Int\n    $after: String\n  ) {\n    tasks(\n      operationId: $operationId\n      stage: $stage\n      excludeStages: $excludeStages\n      riskScoreMin: $riskScoreMin\n      riskScoreMax: $riskScoreMax\n      profitScoreMin: $profitScoreMin\n      profitScoreMax: $profitScoreMax\n      search: $search\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...TaskFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n": types.TasksDocument,
    "\n  query TaskTrash(\n    $operationId: ID!\n    $first: Int\n    $after: String\n  ) {\n    taskTrash(operationId: $operationId, first: $first, after: $after) {\n      edges {\n        node {\n          ...TaskFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n": types.TaskTrashDocument,
    "\n  query TasksReferencingWikiDocument($documentId: ID!) {\n    tasksReferencingWikiDocument(documentId: $documentId) {\n      ...TaskBacklinkFields\n    }\n  }\n": types.TasksReferencingWikiDocumentDocument,
    "\n  query TasksReferencingCredential($credentialId: ID!) {\n    tasksReferencingCredential(credentialId: $credentialId) {\n      ...TaskBacklinkFields\n    }\n  }\n": types.TasksReferencingCredentialDocument,
    "\n  mutation CreateTask($input: CreateTaskInput!) {\n    createTask(input: $input) {\n      ...TaskFields\n    }\n  }\n": types.CreateTaskDocument,
    "\n  mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) {\n    updateTask(id: $id, input: $input) {\n      ...TaskFields\n    }\n  }\n": types.UpdateTaskDocument,
    "\n  mutation ChangeTaskStage($input: ChangeTaskStageInput!) {\n    changeTaskStage(input: $input) {\n      ...TaskFields\n    }\n  }\n": types.ChangeTaskStageDocument,
    "\n  mutation SetTaskAssignees($taskId: ID!, $assigneeIds: [ID!]!) {\n    setTaskAssignees(taskId: $taskId, assigneeIds: $assigneeIds) {\n      ...TaskFields\n    }\n  }\n": types.SetTaskAssigneesDocument,
    "\n  mutation SetTaskWikiReferences($taskId: ID!, $wikiIds: [ID!]!) {\n    setTaskWikiReferences(taskId: $taskId, wikiIds: $wikiIds) {\n      ...TaskFields\n    }\n  }\n": types.SetTaskWikiReferencesDocument,
    "\n  mutation AddTaskWikiReference($taskId: ID!, $wikiId: ID!) {\n    addTaskWikiReference(taskId: $taskId, wikiId: $wikiId) {\n      ...TaskFields\n    }\n  }\n": types.AddTaskWikiReferenceDocument,
    "\n  mutation SetTaskCredentialReferences(\n    $taskId: ID!\n    $credentialIds: [ID!]!\n  ) {\n    setTaskCredentialReferences(\n      taskId: $taskId\n      credentialIds: $credentialIds\n    ) {\n      ...TaskFields\n    }\n  }\n": types.SetTaskCredentialReferencesDocument,
    "\n  mutation DeleteTask($id: ID!) {\n    deleteTask(id: $id)\n  }\n": types.DeleteTaskDocument,
    "\n  mutation RestoreTask($id: ID!) {\n    restoreTask(id: $id) {\n      ...TaskFields\n    }\n  }\n": types.RestoreTaskDocument,
    "\n  mutation PurgeTask($id: ID!) {\n    purgeTask(id: $id)\n  }\n": types.PurgeTaskDocument,
    "\n  subscription TaskChanged($operationId: ID!) {\n    taskChanged(operationId: $operationId) {\n      action\n      taskId\n      operationId\n      task {\n        ...TaskFields\n      }\n    }\n  }\n": types.TaskChangedDocument,
    "\n  fragment TimelineEventFields on TimelineEvent {\n    id\n    operationId\n    topic\n    subjectKind\n    subjectId\n    subjectName\n    occurredAt\n    metadata\n    actor {\n      id\n      username\n    }\n  }\n": types.TimelineEventFieldsFragmentDoc,
    "\n  query TimelineBuckets(\n    $operationId: ID!\n    $granularity: TimelineGranularity = DAY\n    $timezone: String!\n    $from: String\n    $to: String\n    $types: [String!]\n    $actorIds: [ID!]\n  ) {\n    timelineBuckets(\n      operationId: $operationId\n      granularity: $granularity\n      timezone: $timezone\n      from: $from\n      to: $to\n      types: $types\n      actorIds: $actorIds\n    ) {\n      bucketStart\n      count\n      topicCounts {\n        topic\n        subjectKind\n        count\n        emoji\n        icon\n        color\n      }\n    }\n  }\n": types.TimelineBucketsDocument,
    "\n  query TimelineEventsByDay(\n    $operationId: ID!\n    $date: String!\n    $timezone: String!\n    $granularity: TimelineGranularity = DAY\n    $types: [String!]\n    $actorIds: [ID!]\n    $first: Int = 100\n    $after: String\n  ) {\n    timelineEventsByDay(\n      operationId: $operationId\n      date: $date\n      timezone: $timezone\n      granularity: $granularity\n      types: $types\n      actorIds: $actorIds\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...TimelineEventFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n    }\n  }\n": types.TimelineEventsByDayDocument,
    "\n  subscription TimelineEventAdded($operationId: ID!) {\n    timelineEventAdded(operationId: $operationId) {\n      ...TimelineEventFields\n    }\n  }\n": types.TimelineEventAddedDocument,
    "\n  mutation CreateCustomTimelineEvent(\n    $operationId: ID!\n    $input: CreateCustomTimelineEventInput!\n  ) {\n    createCustomTimelineEvent(operationId: $operationId, input: $input) {\n      ...TimelineEventFields\n    }\n  }\n": types.CreateCustomTimelineEventDocument,
    "\n  mutation UpdateCustomTimelineEvent(\n    $id: ID!\n    $input: UpdateCustomTimelineEventInput!\n  ) {\n    updateCustomTimelineEvent(id: $id, input: $input) {\n      ...TimelineEventFields\n    }\n  }\n": types.UpdateCustomTimelineEventDocument,
    "\n  mutation DeleteCustomTimelineEvent($id: ID!) {\n    deleteCustomTimelineEvent(id: $id)\n  }\n": types.DeleteCustomTimelineEventDocument,
    "\n  fragment UserFields on User {\n    id\n    username\n    roles\n    active\n    createdAt\n    updatedAt\n  }\n": types.UserFieldsFragmentDoc,
    "\n  query Me {\n    me {\n      ...UserFields\n      hiddenIdentities\n    }\n  }\n": types.MeDocument,
    "\n  query User($id: ID!) {\n    user(id: $id) {\n      ...UserFields\n    }\n  }\n": types.UserDocument,
    "\n  query Users(\n    $search: String\n    $sortBy: UserSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    users(\n      search: $search\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...UserFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n": types.UsersDocument,
    "\n  mutation CreateUser($input: CreateUserInput!) {\n    createUser(input: $input) {\n      ...UserFields\n    }\n  }\n": types.CreateUserDocument,
    "\n  mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {\n    updateUser(id: $id, input: $input) {\n      ...UserFields\n    }\n  }\n": types.UpdateUserDocument,
    "\n  mutation DeleteUser($id: ID!) {\n    deleteUser(id: $id)\n  }\n": types.DeleteUserDocument,
    "\n  mutation UpdateOwnProfile($input: UpdateUserInput!) {\n    updateOwnProfile(input: $input) {\n      ...UserFields\n    }\n  }\n": types.UpdateOwnProfileDocument,
    "\n  mutation SetHiddenIdentities($names: [String!]!) {\n    setHiddenIdentities(names: $names) {\n      id\n      hiddenIdentities\n    }\n  }\n": types.SetHiddenIdentitiesDocument,
    "\n  subscription UserChanged {\n    userChanged {\n      action\n      userId\n      username\n      user {\n        ...UserFields\n      }\n    }\n  }\n": types.UserChangedDocument,
    "\n  fragment WikiDocumentTreeFields on WikiDocument {\n    id\n    # operationId is required so per-parent cache writes (revealPath,\n    # ensureWikiTree) can key on the row's *actual* operation rather than\n    # trusting whichever operationId the caller had in scope at fetch time.\n    # Without it, opening a /wiki/<operationDocId> URL while the Public tab\n    # is active silently pollutes the Public children cache with operation\n    # rows — sidebar then renders the wrong tree under Public.\n    operationId\n    parentDocumentId\n    title\n    emoji\n    icon\n    color\n    sortOrder\n    childCount\n    hasContent\n    isTemplate\n    sourceTemplateId\n    checklistTotal\n    checklistRequired\n    checklistAnswered\n    lastUpdatedAt\n    updatedAt\n  }\n": types.WikiDocumentTreeFieldsFragmentDoc,
    "\n  fragment WikiDocumentLiteFields on WikiDocument {\n    id\n    title\n    emoji\n    icon\n    color\n    isTemplate\n    deletedAt\n  }\n": types.WikiDocumentLiteFieldsFragmentDoc,
    "\n  fragment WikiDocumentBacklinkFields on WikiDocument {\n    id\n    title\n    emoji\n    icon\n    color\n    updatedAt\n    ancestors { id title emoji icon color isDeleted }\n  }\n": types.WikiDocumentBacklinkFieldsFragmentDoc,
    "\n  fragment WikiDocumentFields on WikiDocument {\n    id\n    operationId\n    parentDocumentId\n    ancestors { id title emoji icon color isDeleted }\n    title\n    content\n    emoji\n    color\n    icon\n    sortOrder\n    isTemplate\n    sourceTemplateId\n    checklistTotal\n    checklistRequired\n    checklistAnswered\n    createdBy { id username }\n    lastUpdatedBy { id username }\n    lastUpdatedAt\n    lastBackupAt\n    createdAt\n    updatedAt\n  }\n": types.WikiDocumentFieldsFragmentDoc,
    "\n  fragment WikiDocumentBackupListFields on WikiDocumentBackup {\n    id\n    documentId\n    title\n    trigger\n    description\n    contentLength\n    createdBy { id username }\n    createdAt\n  }\n": types.WikiDocumentBackupListFieldsFragmentDoc,
    "\n  fragment WikiDocumentBackupDetailFields on WikiDocumentBackup {\n    id\n    documentId\n    title\n    content\n    contentLength\n    trigger\n    description\n    createdBy { id username }\n    createdAt\n  }\n": types.WikiDocumentBackupDetailFieldsFragmentDoc,
    "\n  fragment WikiDocumentVisitListFields on WikiDocumentVisit {\n    id\n    visitedAt\n    document {\n      id\n      title\n      emoji\n      icon\n      color\n      ancestors { id title emoji icon color isDeleted }\n    }\n  }\n": types.WikiDocumentVisitListFieldsFragmentDoc,
    "\n  query WikiDocumentTree($operationId: ID!) {\n    wikiDocumentTree(operationId: $operationId) {\n      ...WikiDocumentTreeFields\n    }\n  }\n": types.WikiDocumentTreeDocument,
    "\n  query WikiDocumentChildren($operationId: ID!, $parentDocumentId: ID) {\n    wikiDocumentChildren(\n      operationId: $operationId\n      parentDocumentId: $parentDocumentId\n    ) {\n      ...WikiDocumentTreeFields\n    }\n  }\n": types.WikiDocumentChildrenDocument,
    "\n  query WikiDocumentTreeRevealPath($documentId: ID!) {\n    wikiDocumentTreeRevealPath(documentId: $documentId) {\n      ...WikiDocumentTreeFields\n    }\n  }\n": types.WikiDocumentTreeRevealPathDocument,
    "\n  query WikiDocumentTrashCount($operationId: ID!) {\n    wikiDocumentTrashCount(operationId: $operationId)\n  }\n": types.WikiDocumentTrashCountDocument,
    "\n  query WikiDocument($id: ID!) {\n    wikiDocument(id: $id) {\n      ...WikiDocumentFields\n    }\n  }\n": types.WikiDocumentDocument,
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
    "\n  mutation SetWikiDocumentTemplate($id: ID!, $isTemplate: Boolean!) {\n    setWikiDocumentTemplate(id: $id, isTemplate: $isTemplate) {\n      id operationId title emoji icon color sortOrder\n      parentDocumentId\n      isTemplate\n      updatedAt\n    }\n  }\n": types.SetWikiDocumentTemplateDocument,
    "\n  mutation InstantiateTemplate(\n    $templateId: ID!\n    $targetOperationId: ID!\n    $parentDocumentId: ID\n    $title: String\n    $emoji: String\n    $icon: String\n    $color: String\n  ) {\n    instantiateTemplate(\n      templateId: $templateId\n      targetOperationId: $targetOperationId\n      parentDocumentId: $parentDocumentId\n      title: $title\n      emoji: $emoji\n      icon: $icon\n      color: $color\n    ) {\n      id operationId title emoji color icon sortOrder\n      parentDocumentId\n      isTemplate\n      sourceTemplateId\n      checklistTotal\n      checklistRequired\n      checklistAnswered\n      createdAt updatedAt\n    }\n  }\n": types.InstantiateTemplateDocument,
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
export function graphql(source: "\n  fragment CredentialFields on Credential {\n    id\n    operationId\n    name\n    type\n    username\n    password\n    keys {\n      name\n      content\n    }\n    properties {\n      name\n      value\n    }\n    isValid\n    tags\n    comments {\n      ...CredentialCommentFields\n    }\n    viewerCanModerateComments\n    createdBy {\n      id\n      username\n    }\n    backlinkCount\n    createdAt\n    updatedAt\n  }\n"): (typeof documents)["\n  fragment CredentialFields on Credential {\n    id\n    operationId\n    name\n    type\n    username\n    password\n    keys {\n      name\n      content\n    }\n    properties {\n      name\n      value\n    }\n    isValid\n    tags\n    comments {\n      ...CredentialCommentFields\n    }\n    viewerCanModerateComments\n    createdBy {\n      id\n      username\n    }\n    backlinkCount\n    createdAt\n    updatedAt\n  }\n"];
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
export function graphql(source: "\n  query Credentials(\n    $operationId: ID!\n    $search: String\n    $searchFields: [CredentialSearchField!]\n    $type: CredentialType\n    $tags: [String!]\n    $validOnly: Boolean\n    $sortBy: CredentialSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    credentials(\n      operationId: $operationId\n      search: $search\n      searchFields: $searchFields\n      type: $type\n      tags: $tags\n      validOnly: $validOnly\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...CredentialFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query Credentials(\n    $operationId: ID!\n    $search: String\n    $searchFields: [CredentialSearchField!]\n    $type: CredentialType\n    $tags: [String!]\n    $validOnly: Boolean\n    $sortBy: CredentialSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    credentials(\n      operationId: $operationId\n      search: $search\n      searchFields: $searchFields\n      type: $type\n      tags: $tags\n      validOnly: $validOnly\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...CredentialFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CredentialTags($operationId: ID!) {\n    credentialTags(operationId: $operationId)\n  }\n"): (typeof documents)["\n  query CredentialTags($operationId: ID!) {\n    credentialTags(operationId: $operationId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CredentialSourceHashes($id: ID!) {\n    credential(id: $id) {\n      id\n      sourceHashes {\n        id\n        value\n        status\n      }\n    }\n  }\n"): (typeof documents)["\n  query CredentialSourceHashes($id: ID!) {\n    credential(id: $id) {\n      id\n      sourceHashes {\n        id\n        value\n        status\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CredentialBacklinks($credentialId: ID!) {\n    wikiDocumentsReferencingCredential(credentialId: $credentialId) {\n      ...WikiDocumentBacklinkFields\n    }\n  }\n"): (typeof documents)["\n  query CredentialBacklinks($credentialId: ID!) {\n    wikiDocumentsReferencingCredential(credentialId: $credentialId) {\n      ...WikiDocumentBacklinkFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MyCredentials(\n    $operationIds: [ID!]\n    $search: String\n    $searchFields: [CredentialSearchField!]\n    $type: CredentialType\n    $tags: [String!]\n    $validOnly: Boolean\n    $sortBy: CredentialSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    myCredentials(\n      operationIds: $operationIds\n      search: $search\n      searchFields: $searchFields\n      type: $type\n      tags: $tags\n      validOnly: $validOnly\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...CredentialFieldsWithOperation\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query MyCredentials(\n    $operationIds: [ID!]\n    $search: String\n    $searchFields: [CredentialSearchField!]\n    $type: CredentialType\n    $tags: [String!]\n    $validOnly: Boolean\n    $sortBy: CredentialSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    myCredentials(\n      operationIds: $operationIds\n      search: $search\n      searchFields: $searchFields\n      type: $type\n      tags: $tags\n      validOnly: $validOnly\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...CredentialFieldsWithOperation\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n"];
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
export function graphql(source: "\n  fragment HashFields on Hash {\n    id\n    operationId\n    value\n    status\n    comment\n    tags\n    credentialId\n    createdBy {\n      id\n      username\n    }\n    createdAt\n    updatedAt\n  }\n"): (typeof documents)["\n  fragment HashFields on Hash {\n    id\n    operationId\n    value\n    status\n    comment\n    tags\n    credentialId\n    createdBy {\n      id\n      username\n    }\n    createdAt\n    updatedAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment HashFieldsWithCredential on Hash {\n    ...HashFields\n    credential {\n      id\n      name\n      type\n      username\n    }\n  }\n"): (typeof documents)["\n  fragment HashFieldsWithCredential on Hash {\n    ...HashFields\n    credential {\n      id\n      name\n      type\n      username\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment HashFieldsWithOperation on Hash {\n    ...HashFields\n    operation {\n      id\n      name\n    }\n  }\n"): (typeof documents)["\n  fragment HashFieldsWithOperation on Hash {\n    ...HashFields\n    operation {\n      id\n      name\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Hash($id: ID!) {\n    hash(id: $id) {\n      ...HashFieldsWithCredential\n    }\n  }\n"): (typeof documents)["\n  query Hash($id: ID!) {\n    hash(id: $id) {\n      ...HashFieldsWithCredential\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Hashes(\n    $operationId: ID!\n    $search: String\n    $statuses: [HashStatus!]\n    $tags: [String!]\n    $hasCredential: Boolean\n    $first: Int\n    $after: String\n  ) {\n    hashes(\n      operationId: $operationId\n      search: $search\n      statuses: $statuses\n      tags: $tags\n      hasCredential: $hasCredential\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...HashFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query Hashes(\n    $operationId: ID!\n    $search: String\n    $statuses: [HashStatus!]\n    $tags: [String!]\n    $hasCredential: Boolean\n    $first: Int\n    $after: String\n  ) {\n    hashes(\n      operationId: $operationId\n      search: $search\n      statuses: $statuses\n      tags: $tags\n      hasCredential: $hasCredential\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...HashFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query HashTags($operationId: ID!) {\n    hashTags(operationId: $operationId)\n  }\n"): (typeof documents)["\n  query HashTags($operationId: ID!) {\n    hashTags(operationId: $operationId)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query HashBacklinks($hashId: ID!) {\n    wikiDocumentsReferencingHash(hashId: $hashId) {\n      ...WikiDocumentBacklinkFields\n    }\n  }\n"): (typeof documents)["\n  query HashBacklinks($hashId: ID!) {\n    wikiDocumentsReferencingHash(hashId: $hashId) {\n      ...WikiDocumentBacklinkFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MyHashes(\n    $operationIds: [ID!]\n    $search: String\n    $statuses: [HashStatus!]\n    $tags: [String!]\n    $hasCredential: Boolean\n    $first: Int\n    $after: String\n  ) {\n    myHashes(\n      operationIds: $operationIds\n      search: $search\n      statuses: $statuses\n      tags: $tags\n      hasCredential: $hasCredential\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...HashFieldsWithOperation\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query MyHashes(\n    $operationIds: [ID!]\n    $search: String\n    $statuses: [HashStatus!]\n    $tags: [String!]\n    $hasCredential: Boolean\n    $first: Int\n    $after: String\n  ) {\n    myHashes(\n      operationIds: $operationIds\n      search: $search\n      statuses: $statuses\n      tags: $tags\n      hasCredential: $hasCredential\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...HashFieldsWithOperation\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MyHashTags($operationIds: [ID!]) {\n    myHashTags(operationIds: $operationIds)\n  }\n"): (typeof documents)["\n  query MyHashTags($operationIds: [ID!]) {\n    myHashTags(operationIds: $operationIds)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateHash($operationId: ID!, $input: CreateHashInput!) {\n    createHash(operationId: $operationId, input: $input) {\n      ...HashFields\n    }\n  }\n"): (typeof documents)["\n  mutation CreateHash($operationId: ID!, $input: CreateHashInput!) {\n    createHash(operationId: $operationId, input: $input) {\n      ...HashFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateHash($id: ID!, $input: UpdateHashInput!) {\n    updateHash(id: $id, input: $input) {\n      ...HashFields\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateHash($id: ID!, $input: UpdateHashInput!) {\n    updateHash(id: $id, input: $input) {\n      ...HashFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteHash($id: ID!) {\n    deleteHash(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeleteHash($id: ID!) {\n    deleteHash(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation BulkImportHashes($operationId: ID!, $input: BulkImportHashesInput!) {\n    bulkImportHashes(operationId: $operationId, input: $input) {\n      added\n      skipped\n      hashes {\n        ...HashFields\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation BulkImportHashes($operationId: ID!, $input: BulkImportHashesInput!) {\n    bulkImportHashes(operationId: $operationId, input: $input) {\n      added\n      skipped\n      hashes {\n        ...HashFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation MarkHashCracked($id: ID!, $input: MarkHashCrackedInput!) {\n    markHashCracked(id: $id, input: $input) {\n      ...HashFieldsWithCredential\n    }\n  }\n"): (typeof documents)["\n  mutation MarkHashCracked($id: ID!, $input: MarkHashCrackedInput!) {\n    markHashCracked(id: $id, input: $input) {\n      ...HashFieldsWithCredential\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription HashChanged($operationId: ID!) {\n    hashChanged(operationId: $operationId) {\n      action\n      hashId\n      operationId\n      hash {\n        ...HashFields\n      }\n    }\n  }\n"): (typeof documents)["\n  subscription HashChanged($operationId: ID!) {\n    hashChanged(operationId: $operationId) {\n      action\n      hashId\n      operationId\n      hash {\n        ...HashFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription MyHashChanged($operationIds: [ID!]) {\n    myHashChanged(operationIds: $operationIds) {\n      action\n      hashId\n      operationId\n      hash {\n        ...HashFieldsWithOperation\n      }\n    }\n  }\n"): (typeof documents)["\n  subscription MyHashChanged($operationIds: [ID!]) {\n    myHashChanged(operationIds: $operationIds) {\n      action\n      hashId\n      operationId\n      hash {\n        ...HashFieldsWithOperation\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment HostFields on Host {\n    id\n    operationId\n    hostname\n    os\n    emoji\n    icon\n    color\n    interfaces {\n      name\n      mac\n      addresses\n    }\n    routes {\n      destination\n      gateway\n      interface\n    }\n    logins {\n      user\n      from\n      tty\n      lastSeen\n      count\n    }\n    createdBy {\n      id\n      username\n    }\n    createdAt\n    updatedAt\n  }\n"): (typeof documents)["\n  fragment HostFields on Host {\n    id\n    operationId\n    hostname\n    os\n    emoji\n    icon\n    color\n    interfaces {\n      name\n      mac\n      addresses\n    }\n    routes {\n      destination\n      gateway\n      interface\n    }\n    logins {\n      user\n      from\n      tty\n      lastSeen\n      count\n    }\n    createdBy {\n      id\n      username\n    }\n    createdAt\n    updatedAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Hosts(\n    $operationId: ID!\n    $search: String\n    $sortBy: HostSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    hosts(\n      operationId: $operationId\n      search: $search\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...HostFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query Hosts(\n    $operationId: ID!\n    $search: String\n    $sortBy: HostSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    hosts(\n      operationId: $operationId\n      search: $search\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...HostFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Host($id: ID!) {\n    host(id: $id) {\n      ...HostFields\n    }\n  }\n"): (typeof documents)["\n  query Host($id: ID!) {\n    host(id: $id) {\n      ...HostFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateHost($operationId: ID!, $input: CreateHostInput!) {\n    createHost(operationId: $operationId, input: $input) {\n      ...HostFields\n    }\n  }\n"): (typeof documents)["\n  mutation CreateHost($operationId: ID!, $input: CreateHostInput!) {\n    createHost(operationId: $operationId, input: $input) {\n      ...HostFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateHost($id: ID!, $input: UpdateHostInput!) {\n    updateHost(id: $id, input: $input) {\n      ...HostFields\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateHost($id: ID!, $input: UpdateHostInput!) {\n    updateHost(id: $id, input: $input) {\n      ...HostFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteHost($id: ID!) {\n    deleteHost(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeleteHost($id: ID!) {\n    deleteHost(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription HostChanged($operationId: ID!) {\n    hostChanged(operationId: $operationId) {\n      action\n      hostId\n    }\n  }\n"): (typeof documents)["\n  subscription HostChanged($operationId: ID!) {\n    hostChanged(operationId: $operationId) {\n      action\n      hostId\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment ModuleFields on Module {\n    instance\n    type\n    version\n    status\n    lastStatus\n    registeredAt\n    lastHeartbeatAt\n    deregisteredAt\n    deregisterReason\n    declaredDeadAt\n  }\n"): (typeof documents)["\n  fragment ModuleFields on Module {\n    instance\n    type\n    version\n    status\n    lastStatus\n    registeredAt\n    lastHeartbeatAt\n    deregisteredAt\n    deregisterReason\n    declaredDeadAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Modules($status: [String!]) {\n    modules(status: $status) {\n      ...ModuleFields\n    }\n  }\n"): (typeof documents)["\n  query Modules($status: [String!]) {\n    modules(status: $status) {\n      ...ModuleFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RemoveModule($instance: ID!) {\n    removeModule(instance: $instance) {\n      ...ModuleFields\n    }\n  }\n"): (typeof documents)["\n  mutation RemoveModule($instance: ID!) {\n    removeModule(instance: $instance) {\n      ...ModuleFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription ModuleChanged {\n    moduleChanged {\n      action\n      instance\n      module {\n        ...ModuleFields\n      }\n    }\n  }\n"): (typeof documents)["\n  subscription ModuleChanged {\n    moduleChanged {\n      action\n      instance\n      module {\n        ...ModuleFields\n      }\n    }\n  }\n"];
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
export function graphql(source: "\n  query Operations(\n    $search: String\n    $sortBy: OperationSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    operations(\n      search: $search\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...OperationFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query Operations(\n    $search: String\n    $sortBy: OperationSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    operations(\n      search: $search\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...OperationFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n"];
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
export function graphql(source: "\n  fragment TaskFields on Task {\n    id\n    operationId\n    name\n    description\n    riskScore\n    riskDescription\n    profitScore\n    profitDescription\n    stage\n    status\n    summary\n    assignees {\n      id\n      username\n    }\n    wikiReferences {\n      id\n      title\n      emoji\n    }\n    credentialReferences {\n      id\n      name\n      type\n    }\n    createdBy {\n      id\n      username\n    }\n    lastUpdatedBy {\n      id\n      username\n    }\n    lastUpdatedAt\n    deletedAt\n    doneAt\n    createdAt\n    updatedAt\n  }\n"): (typeof documents)["\n  fragment TaskFields on Task {\n    id\n    operationId\n    name\n    description\n    riskScore\n    riskDescription\n    profitScore\n    profitDescription\n    stage\n    status\n    summary\n    assignees {\n      id\n      username\n    }\n    wikiReferences {\n      id\n      title\n      emoji\n    }\n    credentialReferences {\n      id\n      name\n      type\n    }\n    createdBy {\n      id\n      username\n    }\n    lastUpdatedBy {\n      id\n      username\n    }\n    lastUpdatedAt\n    deletedAt\n    doneAt\n    createdAt\n    updatedAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment TaskBacklinkFields on Task {\n    id\n    operationId\n    name\n    stage\n    status\n    riskScore\n    profitScore\n    assignees {\n      id\n      username\n    }\n  }\n"): (typeof documents)["\n  fragment TaskBacklinkFields on Task {\n    id\n    operationId\n    name\n    stage\n    status\n    riskScore\n    profitScore\n    assignees {\n      id\n      username\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Task($id: ID!) {\n    task(id: $id) {\n      ...TaskFields\n    }\n  }\n"): (typeof documents)["\n  query Task($id: ID!) {\n    task(id: $id) {\n      ...TaskFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Tasks(\n    $operationId: ID!\n    $stage: TaskStage\n    $excludeStages: [TaskStage!]\n    $riskScoreMin: Int\n    $riskScoreMax: Int\n    $profitScoreMin: Int\n    $profitScoreMax: Int\n    $search: String\n    $first: Int\n    $after: String\n  ) {\n    tasks(\n      operationId: $operationId\n      stage: $stage\n      excludeStages: $excludeStages\n      riskScoreMin: $riskScoreMin\n      riskScoreMax: $riskScoreMax\n      profitScoreMin: $profitScoreMin\n      profitScoreMax: $profitScoreMax\n      search: $search\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...TaskFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query Tasks(\n    $operationId: ID!\n    $stage: TaskStage\n    $excludeStages: [TaskStage!]\n    $riskScoreMin: Int\n    $riskScoreMax: Int\n    $profitScoreMin: Int\n    $profitScoreMax: Int\n    $search: String\n    $first: Int\n    $after: String\n  ) {\n    tasks(\n      operationId: $operationId\n      stage: $stage\n      excludeStages: $excludeStages\n      riskScoreMin: $riskScoreMin\n      riskScoreMax: $riskScoreMax\n      profitScoreMin: $profitScoreMin\n      profitScoreMax: $profitScoreMax\n      search: $search\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...TaskFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query TaskTrash(\n    $operationId: ID!\n    $first: Int\n    $after: String\n  ) {\n    taskTrash(operationId: $operationId, first: $first, after: $after) {\n      edges {\n        node {\n          ...TaskFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query TaskTrash(\n    $operationId: ID!\n    $first: Int\n    $after: String\n  ) {\n    taskTrash(operationId: $operationId, first: $first, after: $after) {\n      edges {\n        node {\n          ...TaskFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        endCursor\n      }\n      totalCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query TasksReferencingWikiDocument($documentId: ID!) {\n    tasksReferencingWikiDocument(documentId: $documentId) {\n      ...TaskBacklinkFields\n    }\n  }\n"): (typeof documents)["\n  query TasksReferencingWikiDocument($documentId: ID!) {\n    tasksReferencingWikiDocument(documentId: $documentId) {\n      ...TaskBacklinkFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query TasksReferencingCredential($credentialId: ID!) {\n    tasksReferencingCredential(credentialId: $credentialId) {\n      ...TaskBacklinkFields\n    }\n  }\n"): (typeof documents)["\n  query TasksReferencingCredential($credentialId: ID!) {\n    tasksReferencingCredential(credentialId: $credentialId) {\n      ...TaskBacklinkFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateTask($input: CreateTaskInput!) {\n    createTask(input: $input) {\n      ...TaskFields\n    }\n  }\n"): (typeof documents)["\n  mutation CreateTask($input: CreateTaskInput!) {\n    createTask(input: $input) {\n      ...TaskFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) {\n    updateTask(id: $id, input: $input) {\n      ...TaskFields\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) {\n    updateTask(id: $id, input: $input) {\n      ...TaskFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ChangeTaskStage($input: ChangeTaskStageInput!) {\n    changeTaskStage(input: $input) {\n      ...TaskFields\n    }\n  }\n"): (typeof documents)["\n  mutation ChangeTaskStage($input: ChangeTaskStageInput!) {\n    changeTaskStage(input: $input) {\n      ...TaskFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SetTaskAssignees($taskId: ID!, $assigneeIds: [ID!]!) {\n    setTaskAssignees(taskId: $taskId, assigneeIds: $assigneeIds) {\n      ...TaskFields\n    }\n  }\n"): (typeof documents)["\n  mutation SetTaskAssignees($taskId: ID!, $assigneeIds: [ID!]!) {\n    setTaskAssignees(taskId: $taskId, assigneeIds: $assigneeIds) {\n      ...TaskFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SetTaskWikiReferences($taskId: ID!, $wikiIds: [ID!]!) {\n    setTaskWikiReferences(taskId: $taskId, wikiIds: $wikiIds) {\n      ...TaskFields\n    }\n  }\n"): (typeof documents)["\n  mutation SetTaskWikiReferences($taskId: ID!, $wikiIds: [ID!]!) {\n    setTaskWikiReferences(taskId: $taskId, wikiIds: $wikiIds) {\n      ...TaskFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation AddTaskWikiReference($taskId: ID!, $wikiId: ID!) {\n    addTaskWikiReference(taskId: $taskId, wikiId: $wikiId) {\n      ...TaskFields\n    }\n  }\n"): (typeof documents)["\n  mutation AddTaskWikiReference($taskId: ID!, $wikiId: ID!) {\n    addTaskWikiReference(taskId: $taskId, wikiId: $wikiId) {\n      ...TaskFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SetTaskCredentialReferences(\n    $taskId: ID!\n    $credentialIds: [ID!]!\n  ) {\n    setTaskCredentialReferences(\n      taskId: $taskId\n      credentialIds: $credentialIds\n    ) {\n      ...TaskFields\n    }\n  }\n"): (typeof documents)["\n  mutation SetTaskCredentialReferences(\n    $taskId: ID!\n    $credentialIds: [ID!]!\n  ) {\n    setTaskCredentialReferences(\n      taskId: $taskId\n      credentialIds: $credentialIds\n    ) {\n      ...TaskFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation DeleteTask($id: ID!) {\n    deleteTask(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeleteTask($id: ID!) {\n    deleteTask(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RestoreTask($id: ID!) {\n    restoreTask(id: $id) {\n      ...TaskFields\n    }\n  }\n"): (typeof documents)["\n  mutation RestoreTask($id: ID!) {\n    restoreTask(id: $id) {\n      ...TaskFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation PurgeTask($id: ID!) {\n    purgeTask(id: $id)\n  }\n"): (typeof documents)["\n  mutation PurgeTask($id: ID!) {\n    purgeTask(id: $id)\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription TaskChanged($operationId: ID!) {\n    taskChanged(operationId: $operationId) {\n      action\n      taskId\n      operationId\n      task {\n        ...TaskFields\n      }\n    }\n  }\n"): (typeof documents)["\n  subscription TaskChanged($operationId: ID!) {\n    taskChanged(operationId: $operationId) {\n      action\n      taskId\n      operationId\n      task {\n        ...TaskFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment TimelineEventFields on TimelineEvent {\n    id\n    operationId\n    topic\n    subjectKind\n    subjectId\n    subjectName\n    occurredAt\n    metadata\n    actor {\n      id\n      username\n    }\n  }\n"): (typeof documents)["\n  fragment TimelineEventFields on TimelineEvent {\n    id\n    operationId\n    topic\n    subjectKind\n    subjectId\n    subjectName\n    occurredAt\n    metadata\n    actor {\n      id\n      username\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query TimelineBuckets(\n    $operationId: ID!\n    $granularity: TimelineGranularity = DAY\n    $timezone: String!\n    $from: String\n    $to: String\n    $types: [String!]\n    $actorIds: [ID!]\n  ) {\n    timelineBuckets(\n      operationId: $operationId\n      granularity: $granularity\n      timezone: $timezone\n      from: $from\n      to: $to\n      types: $types\n      actorIds: $actorIds\n    ) {\n      bucketStart\n      count\n      topicCounts {\n        topic\n        subjectKind\n        count\n        emoji\n        icon\n        color\n      }\n    }\n  }\n"): (typeof documents)["\n  query TimelineBuckets(\n    $operationId: ID!\n    $granularity: TimelineGranularity = DAY\n    $timezone: String!\n    $from: String\n    $to: String\n    $types: [String!]\n    $actorIds: [ID!]\n  ) {\n    timelineBuckets(\n      operationId: $operationId\n      granularity: $granularity\n      timezone: $timezone\n      from: $from\n      to: $to\n      types: $types\n      actorIds: $actorIds\n    ) {\n      bucketStart\n      count\n      topicCounts {\n        topic\n        subjectKind\n        count\n        emoji\n        icon\n        color\n      }\n    }\n  }\n"];
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
export function graphql(source: "\n  query Me {\n    me {\n      ...UserFields\n      hiddenIdentities\n    }\n  }\n"): (typeof documents)["\n  query Me {\n    me {\n      ...UserFields\n      hiddenIdentities\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query User($id: ID!) {\n    user(id: $id) {\n      ...UserFields\n    }\n  }\n"): (typeof documents)["\n  query User($id: ID!) {\n    user(id: $id) {\n      ...UserFields\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Users(\n    $search: String\n    $sortBy: UserSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    users(\n      search: $search\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...UserFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n"): (typeof documents)["\n  query Users(\n    $search: String\n    $sortBy: UserSortField\n    $sortDirection: SortDirection\n    $first: Int\n    $after: String\n  ) {\n    users(\n      search: $search\n      sortBy: $sortBy\n      sortDirection: $sortDirection\n      first: $first\n      after: $after\n    ) {\n      edges {\n        node {\n          ...UserFields\n        }\n        cursor\n      }\n      pageInfo {\n        hasNextPage\n        hasPreviousPage\n        startCursor\n        endCursor\n      }\n      totalCount\n    }\n  }\n"];
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
export function graphql(source: "\n  mutation SetHiddenIdentities($names: [String!]!) {\n    setHiddenIdentities(names: $names) {\n      id\n      hiddenIdentities\n    }\n  }\n"): (typeof documents)["\n  mutation SetHiddenIdentities($names: [String!]!) {\n    setHiddenIdentities(names: $names) {\n      id\n      hiddenIdentities\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription UserChanged {\n    userChanged {\n      action\n      userId\n      username\n      user {\n        ...UserFields\n      }\n    }\n  }\n"): (typeof documents)["\n  subscription UserChanged {\n    userChanged {\n      action\n      userId\n      username\n      user {\n        ...UserFields\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment WikiDocumentTreeFields on WikiDocument {\n    id\n    # operationId is required so per-parent cache writes (revealPath,\n    # ensureWikiTree) can key on the row's *actual* operation rather than\n    # trusting whichever operationId the caller had in scope at fetch time.\n    # Without it, opening a /wiki/<operationDocId> URL while the Public tab\n    # is active silently pollutes the Public children cache with operation\n    # rows — sidebar then renders the wrong tree under Public.\n    operationId\n    parentDocumentId\n    title\n    emoji\n    icon\n    color\n    sortOrder\n    childCount\n    hasContent\n    isTemplate\n    sourceTemplateId\n    checklistTotal\n    checklistRequired\n    checklistAnswered\n    lastUpdatedAt\n    updatedAt\n  }\n"): (typeof documents)["\n  fragment WikiDocumentTreeFields on WikiDocument {\n    id\n    # operationId is required so per-parent cache writes (revealPath,\n    # ensureWikiTree) can key on the row's *actual* operation rather than\n    # trusting whichever operationId the caller had in scope at fetch time.\n    # Without it, opening a /wiki/<operationDocId> URL while the Public tab\n    # is active silently pollutes the Public children cache with operation\n    # rows — sidebar then renders the wrong tree under Public.\n    operationId\n    parentDocumentId\n    title\n    emoji\n    icon\n    color\n    sortOrder\n    childCount\n    hasContent\n    isTemplate\n    sourceTemplateId\n    checklistTotal\n    checklistRequired\n    checklistAnswered\n    lastUpdatedAt\n    updatedAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment WikiDocumentLiteFields on WikiDocument {\n    id\n    title\n    emoji\n    icon\n    color\n    isTemplate\n    deletedAt\n  }\n"): (typeof documents)["\n  fragment WikiDocumentLiteFields on WikiDocument {\n    id\n    title\n    emoji\n    icon\n    color\n    isTemplate\n    deletedAt\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment WikiDocumentBacklinkFields on WikiDocument {\n    id\n    title\n    emoji\n    icon\n    color\n    updatedAt\n    ancestors { id title emoji icon color isDeleted }\n  }\n"): (typeof documents)["\n  fragment WikiDocumentBacklinkFields on WikiDocument {\n    id\n    title\n    emoji\n    icon\n    color\n    updatedAt\n    ancestors { id title emoji icon color isDeleted }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment WikiDocumentFields on WikiDocument {\n    id\n    operationId\n    parentDocumentId\n    ancestors { id title emoji icon color isDeleted }\n    title\n    content\n    emoji\n    color\n    icon\n    sortOrder\n    isTemplate\n    sourceTemplateId\n    checklistTotal\n    checklistRequired\n    checklistAnswered\n    createdBy { id username }\n    lastUpdatedBy { id username }\n    lastUpdatedAt\n    lastBackupAt\n    createdAt\n    updatedAt\n  }\n"): (typeof documents)["\n  fragment WikiDocumentFields on WikiDocument {\n    id\n    operationId\n    parentDocumentId\n    ancestors { id title emoji icon color isDeleted }\n    title\n    content\n    emoji\n    color\n    icon\n    sortOrder\n    isTemplate\n    sourceTemplateId\n    checklistTotal\n    checklistRequired\n    checklistAnswered\n    createdBy { id username }\n    lastUpdatedBy { id username }\n    lastUpdatedAt\n    lastBackupAt\n    createdAt\n    updatedAt\n  }\n"];
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
export function graphql(source: "\n  mutation SetWikiDocumentTemplate($id: ID!, $isTemplate: Boolean!) {\n    setWikiDocumentTemplate(id: $id, isTemplate: $isTemplate) {\n      id operationId title emoji icon color sortOrder\n      parentDocumentId\n      isTemplate\n      updatedAt\n    }\n  }\n"): (typeof documents)["\n  mutation SetWikiDocumentTemplate($id: ID!, $isTemplate: Boolean!) {\n    setWikiDocumentTemplate(id: $id, isTemplate: $isTemplate) {\n      id operationId title emoji icon color sortOrder\n      parentDocumentId\n      isTemplate\n      updatedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation InstantiateTemplate(\n    $templateId: ID!\n    $targetOperationId: ID!\n    $parentDocumentId: ID\n    $title: String\n    $emoji: String\n    $icon: String\n    $color: String\n  ) {\n    instantiateTemplate(\n      templateId: $templateId\n      targetOperationId: $targetOperationId\n      parentDocumentId: $parentDocumentId\n      title: $title\n      emoji: $emoji\n      icon: $icon\n      color: $color\n    ) {\n      id operationId title emoji color icon sortOrder\n      parentDocumentId\n      isTemplate\n      sourceTemplateId\n      checklistTotal\n      checklistRequired\n      checklistAnswered\n      createdAt updatedAt\n    }\n  }\n"): (typeof documents)["\n  mutation InstantiateTemplate(\n    $templateId: ID!\n    $targetOperationId: ID!\n    $parentDocumentId: ID\n    $title: String\n    $emoji: String\n    $icon: String\n    $color: String\n  ) {\n    instantiateTemplate(\n      templateId: $templateId\n      targetOperationId: $targetOperationId\n      parentDocumentId: $parentDocumentId\n      title: $title\n      emoji: $emoji\n      icon: $icon\n      color: $color\n    ) {\n      id operationId title emoji color icon sortOrder\n      parentDocumentId\n      isTemplate\n      sourceTemplateId\n      checklistTotal\n      checklistRequired\n      checklistAnswered\n      createdAt updatedAt\n    }\n  }\n"];
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