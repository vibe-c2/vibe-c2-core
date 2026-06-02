/* eslint-disable */
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = T | null | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
};

export type ApiKey = {
  createdAt: Scalars['String']['output'];
  enabled: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  keyId: Scalars['String']['output'];
  lastUsedAt?: Maybe<Scalars['String']['output']>;
  updatedAt: Scalars['String']['output'];
};

export type ApiKeyWithSecret = {
  apiKey: ApiKey;
  token: Scalars['String']['output'];
};

export type BulkImportHashesInput = {
  comment?: InputMaybe<Scalars['String']['input']>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
  text: Scalars['String']['input'];
};

export type BulkImportHashesResult = {
  added: Scalars['Int']['output'];
  hashes: Array<Hash>;
  skipped: Scalars['Int']['output'];
};

export type ChangeTaskStageInput = {
  stage: TaskStage;
  status?: InputMaybe<TaskStatus>;
  taskId: Scalars['ID']['input'];
};

export type CreateCredentialInput = {
  isValid?: InputMaybe<Scalars['Boolean']['input']>;
  keys?: InputMaybe<Array<CredentialKeyInput>>;
  name: Scalars['String']['input'];
  password?: InputMaybe<Scalars['String']['input']>;
  properties?: InputMaybe<Array<CredentialPropertyInput>>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
  type: CredentialType;
  username?: InputMaybe<Scalars['String']['input']>;
};

export type CreateCustomTimelineEventInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  occurredAt: Scalars['String']['input'];
};

export type CreateHashInput = {
  comment?: InputMaybe<Scalars['String']['input']>;
  credentialId?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<HashStatus>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
  value: Scalars['String']['input'];
};

export type CreateOperationInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
};

export type CreateSchemeNetworkPointInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  names: Array<Scalars['String']['input']>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type CreateSchemeNetworkPortInput = {
  notes?: InputMaybe<Scalars['String']['input']>;
  number: Scalars['Int']['input'];
  protocol?: InputMaybe<Scalars['String']['input']>;
  service?: InputMaybe<Scalars['String']['input']>;
};

export type CreateTaskInput = {
  assigneeIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  credentialReferenceIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  description?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  operationId: Scalars['ID']['input'];
  profitDescription?: InputMaybe<Scalars['String']['input']>;
  profitScore: Scalars['Int']['input'];
  riskDescription?: InputMaybe<Scalars['String']['input']>;
  riskScore: Scalars['Int']['input'];
  stage?: InputMaybe<TaskStage>;
  status?: InputMaybe<TaskStatus>;
  wikiReferenceIds?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type CreateUserInput = {
  active?: InputMaybe<Scalars['Boolean']['input']>;
  password: Scalars['String']['input'];
  roles: Array<Scalars['String']['input']>;
  username: Scalars['String']['input'];
};

export type CreateWikiDocumentInput = {
  color?: InputMaybe<Scalars['String']['input']>;
  content?: InputMaybe<Scalars['String']['input']>;
  emoji?: InputMaybe<Scalars['String']['input']>;
  icon?: InputMaybe<Scalars['String']['input']>;
  parentDocumentId?: InputMaybe<Scalars['ID']['input']>;
  sortOrder?: InputMaybe<Scalars['String']['input']>;
  title: Scalars['String']['input'];
};

export type Credential = {
  backlinkCount: Scalars['Int']['output'];
  backlinks: Array<WikiDocument>;
  comments: Array<CredentialComment>;
  createdAt: Scalars['String']['output'];
  createdBy?: Maybe<User>;
  id: Scalars['ID']['output'];
  isValid: Scalars['Boolean']['output'];
  keys: Array<CredentialKey>;
  name: Scalars['String']['output'];
  operation: Operation;
  operationId: Scalars['ID']['output'];
  password: Scalars['String']['output'];
  properties: Array<CredentialProperty>;
  sourceHashes: Array<Hash>;
  tags: Array<Scalars['String']['output']>;
  taskBacklinks: Array<Task>;
  type: CredentialType;
  updatedAt: Scalars['String']['output'];
  username: Scalars['String']['output'];
  viewerCanModerateComments: Scalars['Boolean']['output'];
};

export type CredentialComment = {
  author?: Maybe<User>;
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  text: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
};

export type CredentialConnection = {
  edges: Array<CredentialEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type CredentialEdge = {
  cursor: Scalars['String']['output'];
  node: Credential;
};

export type CredentialEvent = {
  action: EventAction;
  credential?: Maybe<Credential>;
  credentialId: Scalars['ID']['output'];
  operationId: Scalars['ID']['output'];
};

export type CredentialKey = {
  content: Scalars['String']['output'];
  name: Scalars['String']['output'];
};

export type CredentialKeyInput = {
  content: Scalars['String']['input'];
  name: Scalars['String']['input'];
};

export type CredentialProperty = {
  name: Scalars['String']['output'];
  value: Scalars['String']['output'];
};

export type CredentialPropertyInput = {
  name: Scalars['String']['input'];
  value: Scalars['String']['input'];
};

export type CredentialType =
  | 'API_KEY'
  | 'HASH'
  | 'OTHER'
  | 'PASSWORD'
  | 'SSH_KEY'
  | 'TOKEN';

export type EventAction =
  | 'CREATED'
  | 'DELETED'
  | 'UPDATED';

export type Hash = {
  comment: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  createdBy?: Maybe<User>;
  credential?: Maybe<Credential>;
  credentialId?: Maybe<Scalars['ID']['output']>;
  id: Scalars['ID']['output'];
  operation: Operation;
  operationId: Scalars['ID']['output'];
  status: HashStatus;
  tags: Array<Scalars['String']['output']>;
  updatedAt: Scalars['String']['output'];
  value: Scalars['String']['output'];
};

export type HashConnection = {
  edges: Array<HashEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type HashEdge = {
  cursor: Scalars['String']['output'];
  node: Hash;
};

export type HashEvent = {
  action: EventAction;
  hash?: Maybe<Hash>;
  hashId: Scalars['ID']['output'];
  operationId: Scalars['ID']['output'];
};

export type HashStatus =
  | 'CRACKED'
  | 'CRACKING'
  | 'FAILED'
  | 'NOT_PROCESSED'
  | 'QUEUED';

export type MarkHashCrackedInput = {
  credentialId?: InputMaybe<Scalars['ID']['input']>;
  newCredential?: InputMaybe<CreateCredentialInput>;
};

export type Mutation = {
  addCredentialComment: Credential;
  addOperationMember: Operation;
  addSchemeNetworkPort: SchemeNetworkPoint;
  addTaskWikiReference: Task;
  adminRevokeAllUserSessions: Scalars['Int']['output'];
  adminRevokeSession: Scalars['Boolean']['output'];
  bulkImportHashes: BulkImportHashesResult;
  changeTaskStage: Task;
  createCredential: Credential;
  createCustomTimelineEvent: TimelineEvent;
  createHash: Hash;
  createMyAPIKey: ApiKeyWithSecret;
  createOperation: Operation;
  createSchemeNetworkPoint: SchemeNetworkPoint;
  createTask: Task;
  createUser: User;
  createWikiDocument: WikiDocument;
  createWikiDocumentBackup: WikiDocumentBackup;
  deleteCredential: Scalars['Boolean']['output'];
  deleteCredentialComment: Credential;
  deleteCustomTimelineEvent: Scalars['Boolean']['output'];
  deleteHash: Scalars['Boolean']['output'];
  deleteMyAPIKey: Scalars['Boolean']['output'];
  deleteOperation: Scalars['Boolean']['output'];
  deleteSchemeNetworkPoint: Scalars['Boolean']['output'];
  deleteTask: Scalars['Boolean']['output'];
  deleteUser: Scalars['Boolean']['output'];
  deleteWikiDocument: Scalars['Boolean']['output'];
  deleteWikiDocumentBackup: Scalars['Boolean']['output'];
  duplicateWikiDocument: WikiDocument;
  emptyWikiDocumentTrash: Scalars['Boolean']['output'];
  markHashCracked: Hash;
  permanentlyDeleteWikiDocument: Scalars['Boolean']['output'];
  purgeTask: Scalars['Boolean']['output'];
  regenerateMyAPIKey: ApiKeyWithSecret;
  removeOperationMember: Operation;
  removeSchemeNetworkPort: SchemeNetworkPoint;
  reorderWikiDocumentSiblings: Array<WikiDocument>;
  restoreTask: Task;
  restoreWikiDocument: WikiDocument;
  restoreWikiDocumentBackup: WikiDocument;
  revokeAllMySessions: Scalars['Int']['output'];
  revokeSession: Scalars['Boolean']['output'];
  setMyAPIKeyEnabled: ApiKey;
  setTaskAssignees: Task;
  setTaskCredentialReferences: Task;
  setTaskWikiReferences: Task;
  trackWikiDocumentVisit: WikiDocumentVisit;
  updateCredential: Credential;
  updateCredentialComment: Credential;
  updateCustomTimelineEvent: TimelineEvent;
  updateHash: Hash;
  updateOperation: Operation;
  updateOperationMemberRole: Operation;
  updateOwnProfile: User;
  updateSchemeNetworkPoint: SchemeNetworkPoint;
  updateSchemeNetworkPort: SchemeNetworkPoint;
  updateTask: Task;
  updateUser: User;
  updateWikiDocument: WikiDocument;
};


export type MutationAddCredentialCommentArgs = {
  credentialId: Scalars['ID']['input'];
  text: Scalars['String']['input'];
};


export type MutationAddOperationMemberArgs = {
  operationId: Scalars['ID']['input'];
  role: OperationRole;
  userId: Scalars['ID']['input'];
};


export type MutationAddSchemeNetworkPortArgs = {
  input: CreateSchemeNetworkPortInput;
  pointId: Scalars['ID']['input'];
};


export type MutationAddTaskWikiReferenceArgs = {
  taskId: Scalars['ID']['input'];
  wikiId: Scalars['ID']['input'];
};


export type MutationAdminRevokeAllUserSessionsArgs = {
  userId: Scalars['ID']['input'];
};


export type MutationAdminRevokeSessionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationBulkImportHashesArgs = {
  input: BulkImportHashesInput;
  operationId: Scalars['ID']['input'];
};


export type MutationChangeTaskStageArgs = {
  input: ChangeTaskStageInput;
};


export type MutationCreateCredentialArgs = {
  input: CreateCredentialInput;
  operationId: Scalars['ID']['input'];
};


export type MutationCreateCustomTimelineEventArgs = {
  input: CreateCustomTimelineEventInput;
  operationId: Scalars['ID']['input'];
};


export type MutationCreateHashArgs = {
  input: CreateHashInput;
  operationId: Scalars['ID']['input'];
};


export type MutationCreateOperationArgs = {
  input: CreateOperationInput;
};


export type MutationCreateSchemeNetworkPointArgs = {
  input: CreateSchemeNetworkPointInput;
  operationId: Scalars['ID']['input'];
};


export type MutationCreateTaskArgs = {
  input: CreateTaskInput;
};


export type MutationCreateUserArgs = {
  input: CreateUserInput;
};


export type MutationCreateWikiDocumentArgs = {
  input: CreateWikiDocumentInput;
  operationId: Scalars['ID']['input'];
};


export type MutationCreateWikiDocumentBackupArgs = {
  description?: InputMaybe<Scalars['String']['input']>;
  documentId: Scalars['ID']['input'];
};


export type MutationDeleteCredentialArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteCredentialCommentArgs = {
  commentId: Scalars['ID']['input'];
  credentialId: Scalars['ID']['input'];
};


export type MutationDeleteCustomTimelineEventArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteHashArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteOperationArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteSchemeNetworkPointArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteTaskArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteUserArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteWikiDocumentArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDeleteWikiDocumentBackupArgs = {
  id: Scalars['ID']['input'];
};


export type MutationDuplicateWikiDocumentArgs = {
  id: Scalars['ID']['input'];
  withChildren?: InputMaybe<Scalars['Boolean']['input']>;
};


export type MutationEmptyWikiDocumentTrashArgs = {
  operationId: Scalars['ID']['input'];
};


export type MutationMarkHashCrackedArgs = {
  id: Scalars['ID']['input'];
  input: MarkHashCrackedInput;
};


export type MutationPermanentlyDeleteWikiDocumentArgs = {
  id: Scalars['ID']['input'];
};


export type MutationPurgeTaskArgs = {
  id: Scalars['ID']['input'];
};


export type MutationRemoveOperationMemberArgs = {
  operationId: Scalars['ID']['input'];
  userId: Scalars['ID']['input'];
};


export type MutationRemoveSchemeNetworkPortArgs = {
  pointId: Scalars['ID']['input'];
  portId: Scalars['ID']['input'];
};


export type MutationReorderWikiDocumentSiblingsArgs = {
  input: ReorderWikiDocumentSiblingsInput;
};


export type MutationRestoreTaskArgs = {
  id: Scalars['ID']['input'];
};


export type MutationRestoreWikiDocumentArgs = {
  cascade?: InputMaybe<Scalars['Boolean']['input']>;
  id: Scalars['ID']['input'];
};


export type MutationRestoreWikiDocumentBackupArgs = {
  backupId: Scalars['ID']['input'];
  documentId: Scalars['ID']['input'];
};


export type MutationRevokeSessionArgs = {
  id: Scalars['ID']['input'];
};


export type MutationSetMyApiKeyEnabledArgs = {
  enabled: Scalars['Boolean']['input'];
};


export type MutationSetTaskAssigneesArgs = {
  assigneeIds: Array<Scalars['ID']['input']>;
  taskId: Scalars['ID']['input'];
};


export type MutationSetTaskCredentialReferencesArgs = {
  credentialIds: Array<Scalars['ID']['input']>;
  taskId: Scalars['ID']['input'];
};


export type MutationSetTaskWikiReferencesArgs = {
  taskId: Scalars['ID']['input'];
  wikiIds: Array<Scalars['ID']['input']>;
};


export type MutationTrackWikiDocumentVisitArgs = {
  documentId: Scalars['ID']['input'];
};


export type MutationUpdateCredentialArgs = {
  id: Scalars['ID']['input'];
  input: UpdateCredentialInput;
};


export type MutationUpdateCredentialCommentArgs = {
  commentId: Scalars['ID']['input'];
  credentialId: Scalars['ID']['input'];
  text: Scalars['String']['input'];
};


export type MutationUpdateCustomTimelineEventArgs = {
  id: Scalars['ID']['input'];
  input: UpdateCustomTimelineEventInput;
};


export type MutationUpdateHashArgs = {
  id: Scalars['ID']['input'];
  input: UpdateHashInput;
};


export type MutationUpdateOperationArgs = {
  id: Scalars['ID']['input'];
  input: UpdateOperationInput;
};


export type MutationUpdateOperationMemberRoleArgs = {
  operationId: Scalars['ID']['input'];
  role: OperationRole;
  userId: Scalars['ID']['input'];
};


export type MutationUpdateOwnProfileArgs = {
  input: UpdateUserInput;
};


export type MutationUpdateSchemeNetworkPointArgs = {
  id: Scalars['ID']['input'];
  input: UpdateSchemeNetworkPointInput;
};


export type MutationUpdateSchemeNetworkPortArgs = {
  input: UpdateSchemeNetworkPortInput;
  pointId: Scalars['ID']['input'];
  portId: Scalars['ID']['input'];
};


export type MutationUpdateTaskArgs = {
  id: Scalars['ID']['input'];
  input: UpdateTaskInput;
};


export type MutationUpdateUserArgs = {
  id: Scalars['ID']['input'];
  input: UpdateUserInput;
};


export type MutationUpdateWikiDocumentArgs = {
  id: Scalars['ID']['input'];
  input: UpdateWikiDocumentInput;
};

export type Operation = {
  createdAt: Scalars['String']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  members: Array<OperationMember>;
  name: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
};

export type OperationConnection = {
  edges: Array<OperationEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type OperationEdge = {
  cursor: Scalars['String']['output'];
  node: Operation;
};

export type OperationEvent = {
  action: EventAction;
  name?: Maybe<Scalars['String']['output']>;
  operation?: Maybe<Operation>;
  operationId: Scalars['ID']['output'];
};

export type OperationMember = {
  role: OperationRole;
  user: User;
};

export type OperationMemberEvent = {
  action: EventAction;
  operationId: Scalars['ID']['output'];
  userId: Scalars['ID']['output'];
};

export type OperationRole =
  | 'ADMIN'
  | 'OPERATOR'
  | 'VIEWER';

export type PageInfo = {
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
  hasPreviousPage: Scalars['Boolean']['output'];
  startCursor?: Maybe<Scalars['String']['output']>;
};

export type PresenceAction =
  | 'JOINED'
  | 'LEFT';

export type Query = {
  credential: Credential;
  credentialTags: Array<Scalars['String']['output']>;
  credentials: CredentialConnection;
  hash: Hash;
  hashTags: Array<Scalars['String']['output']>;
  hashes: HashConnection;
  me: User;
  myAPIKey?: Maybe<ApiKey>;
  myCredentialTags: Array<Scalars['String']['output']>;
  myCredentials: CredentialConnection;
  myHashTags: Array<Scalars['String']['output']>;
  myHashes: HashConnection;
  myOperationRole?: Maybe<OperationRole>;
  mySessions: SessionConnection;
  operation: Operation;
  operations: OperationConnection;
  schemeNetworkPoint: SchemeNetworkPoint;
  schemeNetworkPoints: SchemeNetworkPointConnection;
  session: Session;
  sessions: SessionConnection;
  task: Task;
  taskTrash: TaskConnection;
  tasks: TaskConnection;
  tasksReferencingCredential: Array<Task>;
  tasksReferencingWikiDocument: Array<Task>;
  timelineBuckets: Array<TimelineBucket>;
  timelineEventsByDay: TimelineEventConnection;
  user: User;
  userSuggestions: Array<UserSuggestion>;
  users: UserConnection;
  wikiDocument: WikiDocument;
  wikiDocumentBacklinks: Array<WikiDocument>;
  wikiDocumentBackup: WikiDocumentBackup;
  wikiDocumentBackups: WikiDocumentBackupConnection;
  wikiDocumentChildren: Array<WikiDocument>;
  wikiDocumentHistory: WikiDocumentVisitConnection;
  wikiDocumentPresence: WikiDocumentPresence;
  wikiDocumentTrash: WikiDocumentConnection;
  wikiDocumentTrashCount: Scalars['Int']['output'];
  wikiDocumentTrashedDescendants: Array<WikiDocument>;
  wikiDocumentTree: Array<WikiDocument>;
  wikiDocumentTreeRevealPath: Array<WikiDocument>;
  wikiDocuments: WikiDocumentConnection;
  wikiDocumentsReferencingCredential: Array<WikiDocument>;
  wikiOperationPresence: Array<WikiDocumentPresence>;
  wikiSearch: WikiSearchConnection;
};


export type QueryCredentialArgs = {
  id: Scalars['ID']['input'];
};


export type QueryCredentialTagsArgs = {
  operationId: Scalars['ID']['input'];
};


export type QueryCredentialsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  operationId: Scalars['ID']['input'];
  search?: InputMaybe<Scalars['String']['input']>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
  type?: InputMaybe<CredentialType>;
  validOnly?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryHashArgs = {
  id: Scalars['ID']['input'];
};


export type QueryHashTagsArgs = {
  operationId: Scalars['ID']['input'];
};


export type QueryHashesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  hasCredential?: InputMaybe<Scalars['Boolean']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  operationId: Scalars['ID']['input'];
  search?: InputMaybe<Scalars['String']['input']>;
  statuses?: InputMaybe<Array<HashStatus>>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type QueryMyCredentialTagsArgs = {
  operationIds?: InputMaybe<Array<Scalars['ID']['input']>>;
};


export type QueryMyCredentialsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  operationIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  search?: InputMaybe<Scalars['String']['input']>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
  type?: InputMaybe<CredentialType>;
  validOnly?: InputMaybe<Scalars['Boolean']['input']>;
};


export type QueryMyHashTagsArgs = {
  operationIds?: InputMaybe<Array<Scalars['ID']['input']>>;
};


export type QueryMyHashesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  hasCredential?: InputMaybe<Scalars['Boolean']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  operationIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  search?: InputMaybe<Scalars['String']['input']>;
  statuses?: InputMaybe<Array<HashStatus>>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type QueryMyOperationRoleArgs = {
  operationId: Scalars['ID']['input'];
};


export type QueryMySessionsArgs = {
  activeOnly?: InputMaybe<Scalars['Boolean']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryOperationArgs = {
  id: Scalars['ID']['input'];
};


export type QueryOperationsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};


export type QuerySchemeNetworkPointArgs = {
  id: Scalars['ID']['input'];
};


export type QuerySchemeNetworkPointsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  operationId: Scalars['ID']['input'];
  search?: InputMaybe<Scalars['String']['input']>;
};


export type QuerySessionArgs = {
  id: Scalars['ID']['input'];
};


export type QuerySessionsArgs = {
  activeOnly?: InputMaybe<Scalars['Boolean']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  userId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryTaskArgs = {
  id: Scalars['ID']['input'];
};


export type QueryTaskTrashArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  operationId: Scalars['ID']['input'];
};


export type QueryTasksArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  excludeStages?: InputMaybe<Array<TaskStage>>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  operationId: Scalars['ID']['input'];
  profitScoreMax?: InputMaybe<Scalars['Int']['input']>;
  profitScoreMin?: InputMaybe<Scalars['Int']['input']>;
  riskScoreMax?: InputMaybe<Scalars['Int']['input']>;
  riskScoreMin?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  stage?: InputMaybe<TaskStage>;
};


export type QueryTasksReferencingCredentialArgs = {
  credentialId: Scalars['ID']['input'];
};


export type QueryTasksReferencingWikiDocumentArgs = {
  documentId: Scalars['ID']['input'];
};


export type QueryTimelineBucketsArgs = {
  actorIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  from?: InputMaybe<Scalars['String']['input']>;
  granularity?: InputMaybe<TimelineGranularity>;
  operationId: Scalars['ID']['input'];
  timezone: Scalars['String']['input'];
  to?: InputMaybe<Scalars['String']['input']>;
  types?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type QueryTimelineEventsByDayArgs = {
  actorIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  after?: InputMaybe<Scalars['String']['input']>;
  date: Scalars['String']['input'];
  first?: InputMaybe<Scalars['Int']['input']>;
  granularity?: InputMaybe<TimelineGranularity>;
  operationId: Scalars['ID']['input'];
  timezone: Scalars['String']['input'];
  types?: InputMaybe<Array<Scalars['String']['input']>>;
};


export type QueryUserArgs = {
  id: Scalars['ID']['input'];
};


export type QueryUserSuggestionsArgs = {
  first?: InputMaybe<Scalars['Int']['input']>;
  search: Scalars['String']['input'];
};


export type QueryUsersArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};


export type QueryWikiDocumentArgs = {
  id: Scalars['ID']['input'];
};


export type QueryWikiDocumentBacklinksArgs = {
  documentId: Scalars['ID']['input'];
};


export type QueryWikiDocumentBackupArgs = {
  id: Scalars['ID']['input'];
};


export type QueryWikiDocumentBackupsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  documentId: Scalars['ID']['input'];
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  trigger?: InputMaybe<WikiDocumentBackupTrigger>;
};


export type QueryWikiDocumentChildrenArgs = {
  operationId: Scalars['ID']['input'];
  parentDocumentId?: InputMaybe<Scalars['ID']['input']>;
};


export type QueryWikiDocumentHistoryArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  operationId: Scalars['ID']['input'];
};


export type QueryWikiDocumentPresenceArgs = {
  documentId: Scalars['ID']['input'];
};


export type QueryWikiDocumentTrashArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  operationId: Scalars['ID']['input'];
};


export type QueryWikiDocumentTrashCountArgs = {
  operationId: Scalars['ID']['input'];
};


export type QueryWikiDocumentTrashedDescendantsArgs = {
  documentId: Scalars['ID']['input'];
};


export type QueryWikiDocumentTreeArgs = {
  operationId: Scalars['ID']['input'];
};


export type QueryWikiDocumentTreeRevealPathArgs = {
  documentId: Scalars['ID']['input'];
};


export type QueryWikiDocumentsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  operationId: Scalars['ID']['input'];
  parentDocumentId?: InputMaybe<Scalars['ID']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  sort?: InputMaybe<WikiDocumentSort>;
};


export type QueryWikiDocumentsReferencingCredentialArgs = {
  credentialId: Scalars['ID']['input'];
};


export type QueryWikiOperationPresenceArgs = {
  operationId: Scalars['ID']['input'];
};


export type QueryWikiSearchArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  offset?: InputMaybe<Scalars['Int']['input']>;
  operationId: Scalars['ID']['input'];
  query: Scalars['String']['input'];
  scope?: InputMaybe<Scalars['ID']['input']>;
};

export type ReorderWikiDocumentSiblingsInput = {
  operationId: Scalars['ID']['input'];
  orderedIds: Array<Scalars['ID']['input']>;
  parentDocumentId?: InputMaybe<Scalars['ID']['input']>;
};

export type SchemeNetworkPoint = {
  createdAt: Scalars['String']['output'];
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  names: Array<Scalars['String']['output']>;
  operationId: Scalars['ID']['output'];
  ports: Array<SchemeNetworkPort>;
  tags: Array<Scalars['String']['output']>;
  updatedAt: Scalars['String']['output'];
};

export type SchemeNetworkPointConnection = {
  edges: Array<SchemeNetworkPointEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type SchemeNetworkPointEdge = {
  cursor: Scalars['String']['output'];
  node: SchemeNetworkPoint;
};

export type SchemeNetworkPort = {
  id: Scalars['ID']['output'];
  notes: Scalars['String']['output'];
  number: Scalars['Int']['output'];
  protocol: Scalars['String']['output'];
  service: Scalars['String']['output'];
};

export type Session = {
  browser: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  device: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  ipAddress: Scalars['String']['output'];
  isCurrent: Scalars['Boolean']['output'];
  lastActivityAt?: Maybe<Scalars['String']['output']>;
  os: Scalars['String']['output'];
  status: SessionStatus;
  updatedAt: Scalars['String']['output'];
  user: User;
  userAgent: Scalars['String']['output'];
  userId: Scalars['ID']['output'];
};

export type SessionConnection = {
  edges: Array<SessionEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type SessionEdge = {
  cursor: Scalars['String']['output'];
  node: Session;
};

export type SessionEvent = {
  action: EventAction;
  session?: Maybe<Session>;
  sessionId: Scalars['ID']['output'];
  userId: Scalars['ID']['output'];
};

export type SessionStatus =
  | 'ACTIVE'
  | 'INACTIVE';

export type Subscription = {
  credentialChanged: CredentialEvent;
  hashChanged: HashEvent;
  myCredentialChanged: CredentialEvent;
  myHashChanged: HashEvent;
  mySessionChanged: SessionEvent;
  operationChanged: OperationEvent;
  operationMemberChanged: OperationMemberEvent;
  sessionChanged: SessionEvent;
  taskChanged: TaskEvent;
  timelineEventAdded: TimelineEvent;
  userChanged: UserEvent;
  wikiDocumentChanged: WikiDocumentEvent;
  wikiDocumentPresenceChanged: WikiDocumentPresenceEvent;
};


export type SubscriptionCredentialChangedArgs = {
  operationId: Scalars['ID']['input'];
};


export type SubscriptionHashChangedArgs = {
  operationId: Scalars['ID']['input'];
};


export type SubscriptionMyCredentialChangedArgs = {
  operationIds?: InputMaybe<Array<Scalars['ID']['input']>>;
};


export type SubscriptionMyHashChangedArgs = {
  operationIds?: InputMaybe<Array<Scalars['ID']['input']>>;
};


export type SubscriptionOperationChangedArgs = {
  operationId?: InputMaybe<Scalars['ID']['input']>;
};


export type SubscriptionOperationMemberChangedArgs = {
  operationId?: InputMaybe<Scalars['ID']['input']>;
};


export type SubscriptionSessionChangedArgs = {
  userId?: InputMaybe<Scalars['ID']['input']>;
};


export type SubscriptionTaskChangedArgs = {
  operationId: Scalars['ID']['input'];
};


export type SubscriptionTimelineEventAddedArgs = {
  operationId: Scalars['ID']['input'];
};


export type SubscriptionWikiDocumentChangedArgs = {
  operationId: Scalars['ID']['input'];
};


export type SubscriptionWikiDocumentPresenceChangedArgs = {
  operationId: Scalars['ID']['input'];
};

export type Task = {
  assignees: Array<User>;
  createdAt: Scalars['String']['output'];
  createdBy?: Maybe<User>;
  credentialReferences: Array<Credential>;
  deletedAt?: Maybe<Scalars['String']['output']>;
  description: Scalars['String']['output'];
  doneAt?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  lastUpdatedAt?: Maybe<Scalars['String']['output']>;
  lastUpdatedBy?: Maybe<User>;
  name: Scalars['String']['output'];
  operation: Operation;
  operationId: Scalars['ID']['output'];
  profitDescription: Scalars['String']['output'];
  profitScore: Scalars['Int']['output'];
  riskDescription: Scalars['String']['output'];
  riskScore: Scalars['Int']['output'];
  stage: TaskStage;
  status: TaskStatus;
  updatedAt: Scalars['String']['output'];
  wikiReferences: Array<WikiDocument>;
};

export type TaskConnection = {
  edges: Array<TaskEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type TaskEdge = {
  cursor: Scalars['String']['output'];
  node: Task;
};

export type TaskEvent = {
  action: EventAction;
  operationId: Scalars['ID']['output'];
  task?: Maybe<Task>;
  taskId: Scalars['ID']['output'];
};

export type TaskStage =
  | 'BACKLOG'
  | 'DONE'
  | 'IN_PROCESS'
  | 'TODO';

export type TaskStatus =
  | 'FAIL'
  | 'SUCCESS'
  | 'UNDEFINED';

export type TimelineBucket = {
  bucketStart: Scalars['String']['output'];
  count: Scalars['Int']['output'];
  topicCounts: Array<TimelineTopicCount>;
};

export type TimelineEvent = {
  actor?: Maybe<User>;
  id: Scalars['ID']['output'];
  metadata: Scalars['String']['output'];
  occurredAt: Scalars['String']['output'];
  operationId: Scalars['ID']['output'];
  subjectId: Scalars['ID']['output'];
  subjectKind: Scalars['String']['output'];
  subjectName: Scalars['String']['output'];
  topic: Scalars['String']['output'];
};

export type TimelineEventConnection = {
  edges: Array<TimelineEventEdge>;
  pageInfo: PageInfo;
};

export type TimelineEventEdge = {
  cursor: Scalars['String']['output'];
  node: TimelineEvent;
};

export type TimelineGranularity =
  | 'DAY'
  | 'MONTH'
  | 'WEEK';

export type TimelineTopicCount = {
  count: Scalars['Int']['output'];
  subjectKind: Scalars['String']['output'];
  topic: Scalars['String']['output'];
};

export type UpdateCredentialInput = {
  isValid?: InputMaybe<Scalars['Boolean']['input']>;
  keys?: InputMaybe<Array<CredentialKeyInput>>;
  name?: InputMaybe<Scalars['String']['input']>;
  password?: InputMaybe<Scalars['String']['input']>;
  properties?: InputMaybe<Array<CredentialPropertyInput>>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
  type?: InputMaybe<CredentialType>;
  username?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateCustomTimelineEventInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  occurredAt?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateHashInput = {
  comment?: InputMaybe<Scalars['String']['input']>;
  credentialId?: InputMaybe<Scalars['ID']['input']>;
  status?: InputMaybe<HashStatus>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
  value?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateOperationInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateSchemeNetworkPointInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  names?: InputMaybe<Array<Scalars['String']['input']>>;
  tags?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type UpdateSchemeNetworkPortInput = {
  notes?: InputMaybe<Scalars['String']['input']>;
  number?: InputMaybe<Scalars['Int']['input']>;
  protocol?: InputMaybe<Scalars['String']['input']>;
  service?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateTaskInput = {
  description?: InputMaybe<Scalars['String']['input']>;
  name?: InputMaybe<Scalars['String']['input']>;
  profitDescription?: InputMaybe<Scalars['String']['input']>;
  profitScore?: InputMaybe<Scalars['Int']['input']>;
  riskDescription?: InputMaybe<Scalars['String']['input']>;
  riskScore?: InputMaybe<Scalars['Int']['input']>;
};

export type UpdateUserInput = {
  active?: InputMaybe<Scalars['Boolean']['input']>;
  password?: InputMaybe<Scalars['String']['input']>;
  roles?: InputMaybe<Array<InputMaybe<Scalars['String']['input']>>>;
  username?: InputMaybe<Scalars['String']['input']>;
};

export type UpdateWikiDocumentInput = {
  color?: InputMaybe<Scalars['String']['input']>;
  emoji?: InputMaybe<Scalars['String']['input']>;
  icon?: InputMaybe<Scalars['String']['input']>;
  parentDocumentId?: InputMaybe<Scalars['ID']['input']>;
  sortOrder?: InputMaybe<Scalars['String']['input']>;
  title?: InputMaybe<Scalars['String']['input']>;
};

export type User = {
  active: Scalars['Boolean']['output'];
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  roles: Array<Scalars['String']['output']>;
  updatedAt: Scalars['String']['output'];
  username: Scalars['String']['output'];
};

export type UserConnection = {
  edges: Array<UserEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type UserEdge = {
  cursor: Scalars['String']['output'];
  node: User;
};

export type UserEvent = {
  action: EventAction;
  user?: Maybe<User>;
  userId: Scalars['ID']['output'];
  username?: Maybe<Scalars['String']['output']>;
};

export type UserSuggestion = {
  id: Scalars['ID']['output'];
  username: Scalars['String']['output'];
};

export type WikiDocument = {
  ancestors: Array<WikiDocumentAncestor>;
  backlinks: Array<WikiDocument>;
  childCount: Scalars['Int']['output'];
  childDocuments: Array<WikiDocument>;
  color: Scalars['String']['output'];
  content: Scalars['String']['output'];
  createdAt: Scalars['String']['output'];
  createdBy: User;
  deletedAt?: Maybe<Scalars['String']['output']>;
  deletedBy?: Maybe<User>;
  emoji: Scalars['String']['output'];
  icon: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  lastBackupAt?: Maybe<Scalars['String']['output']>;
  lastUpdatedAt?: Maybe<Scalars['String']['output']>;
  lastUpdatedBy?: Maybe<User>;
  operationId: Scalars['ID']['output'];
  parentDocument?: Maybe<WikiDocument>;
  parentDocumentId?: Maybe<Scalars['ID']['output']>;
  sortOrder: Scalars['String']['output'];
  taskBacklinks: Array<Task>;
  title: Scalars['String']['output'];
  updatedAt: Scalars['String']['output'];
};

export type WikiDocumentAncestor = {
  color: Scalars['String']['output'];
  emoji: Scalars['String']['output'];
  icon: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  isDeleted: Scalars['Boolean']['output'];
  title: Scalars['String']['output'];
};

export type WikiDocumentBackup = {
  content: Scalars['String']['output'];
  contentLength: Scalars['Int']['output'];
  createdAt: Scalars['String']['output'];
  createdBy?: Maybe<User>;
  description: Scalars['String']['output'];
  documentId: Scalars['ID']['output'];
  id: Scalars['ID']['output'];
  title: Scalars['String']['output'];
  trigger: WikiDocumentBackupTrigger;
};

export type WikiDocumentBackupConnection = {
  edges: Array<WikiDocumentBackupEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type WikiDocumentBackupEdge = {
  cursor: Scalars['String']['output'];
  node: WikiDocumentBackup;
};

export type WikiDocumentBackupTrigger =
  | 'AUTO'
  | 'MANUAL';

export type WikiDocumentConnection = {
  edges: Array<WikiDocumentEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type WikiDocumentEdge = {
  cursor: Scalars['String']['output'];
  node: WikiDocument;
};

export type WikiDocumentEditor = {
  connectedAt: Scalars['String']['output'];
  userId: Scalars['ID']['output'];
  username: Scalars['String']['output'];
};

export type WikiDocumentEvent = {
  action: EventAction;
  document?: Maybe<WikiDocument>;
  documentId: Scalars['ID']['output'];
  operationId: Scalars['ID']['output'];
  parentDocumentId?: Maybe<Scalars['ID']['output']>;
  previousParentDocumentId?: Maybe<Scalars['ID']['output']>;
};

export type WikiDocumentPresence = {
  activeEditors: Array<WikiDocumentEditor>;
  documentId: Scalars['ID']['output'];
};

export type WikiDocumentPresenceEvent = {
  action: PresenceAction;
  documentId: Scalars['ID']['output'];
  operationId: Scalars['ID']['output'];
  userId: Scalars['ID']['output'];
  username: Scalars['String']['output'];
};

export type WikiDocumentSort =
  | 'RECENTLY_CREATED'
  | 'RECENTLY_UPDATED';

export type WikiDocumentVisit = {
  document: WikiDocument;
  id: Scalars['ID']['output'];
  visitedAt: Scalars['String']['output'];
};

export type WikiDocumentVisitConnection = {
  edges: Array<WikiDocumentVisitEdge>;
  pageInfo: PageInfo;
  totalCount: Scalars['Int']['output'];
};

export type WikiDocumentVisitEdge = {
  cursor: Scalars['String']['output'];
  node: WikiDocumentVisit;
};

export type WikiSearchConnection = {
  hasMore: Scalars['Boolean']['output'];
  hits: Array<WikiSearchHit>;
  total: Scalars['Int']['output'];
};

export type WikiSearchHit = {
  document: WikiDocument;
  matchRanges: Array<WikiSearchMatchRange>;
  score?: Maybe<Scalars['Float']['output']>;
  snippet: Scalars['String']['output'];
};

export type WikiSearchMatchRange = {
  end: Scalars['Int']['output'];
  start: Scalars['Int']['output'];
};

export type ApiKeyFieldsFragment = { id: string, keyId: string, enabled: boolean, lastUsedAt?: string | null, createdAt: string, updatedAt: string };

export type MyApiKeyQueryVariables = Exact<{ [key: string]: never; }>;


export type MyApiKeyQuery = { myAPIKey?: { id: string, keyId: string, enabled: boolean, lastUsedAt?: string | null, createdAt: string, updatedAt: string } | null };

export type CreateMyApiKeyMutationVariables = Exact<{ [key: string]: never; }>;


export type CreateMyApiKeyMutation = { createMyAPIKey: { token: string, apiKey: { id: string, keyId: string, enabled: boolean, lastUsedAt?: string | null, createdAt: string, updatedAt: string } } };

export type RegenerateMyApiKeyMutationVariables = Exact<{ [key: string]: never; }>;


export type RegenerateMyApiKeyMutation = { regenerateMyAPIKey: { token: string, apiKey: { id: string, keyId: string, enabled: boolean, lastUsedAt?: string | null, createdAt: string, updatedAt: string } } };

export type SetMyApiKeyEnabledMutationVariables = Exact<{
  enabled: Scalars['Boolean']['input'];
}>;


export type SetMyApiKeyEnabledMutation = { setMyAPIKeyEnabled: { id: string, keyId: string, enabled: boolean, lastUsedAt?: string | null, createdAt: string, updatedAt: string } };

export type DeleteMyApiKeyMutationVariables = Exact<{ [key: string]: never; }>;


export type DeleteMyApiKeyMutation = { deleteMyAPIKey: boolean };

export type CredentialCommentFieldsFragment = { id: string, text: string, createdAt: string, updatedAt: string, author?: { id: string, username: string } | null };

export type CredentialFieldsFragment = { id: string, operationId: string, name: string, type: CredentialType, username: string, password: string, isValid: boolean, tags: Array<string>, viewerCanModerateComments: boolean, backlinkCount: number, createdAt: string, updatedAt: string, keys: Array<{ name: string, content: string }>, properties: Array<{ name: string, value: string }>, comments: Array<{ id: string, text: string, createdAt: string, updatedAt: string, author?: { id: string, username: string } | null }>, createdBy?: { id: string, username: string } | null };

export type CredentialFieldsWithOperationFragment = { id: string, operationId: string, name: string, type: CredentialType, username: string, password: string, isValid: boolean, tags: Array<string>, viewerCanModerateComments: boolean, backlinkCount: number, createdAt: string, updatedAt: string, operation: { id: string, name: string }, keys: Array<{ name: string, content: string }>, properties: Array<{ name: string, value: string }>, comments: Array<{ id: string, text: string, createdAt: string, updatedAt: string, author?: { id: string, username: string } | null }>, createdBy?: { id: string, username: string } | null };

export type CredentialQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type CredentialQuery = { credential: { id: string, operationId: string, name: string, type: CredentialType, username: string, password: string, isValid: boolean, tags: Array<string>, viewerCanModerateComments: boolean, backlinkCount: number, createdAt: string, updatedAt: string, keys: Array<{ name: string, content: string }>, properties: Array<{ name: string, value: string }>, comments: Array<{ id: string, text: string, createdAt: string, updatedAt: string, author?: { id: string, username: string } | null }>, createdBy?: { id: string, username: string } | null } };

export type CredentialsQueryVariables = Exact<{
  operationId: Scalars['ID']['input'];
  search?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<CredentialType>;
  tags?: InputMaybe<Array<Scalars['String']['input']> | Scalars['String']['input']>;
  validOnly?: InputMaybe<Scalars['Boolean']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
}>;


export type CredentialsQuery = { credentials: { totalCount: number, edges: Array<{ cursor: string, node: { id: string, operationId: string, name: string, type: CredentialType, username: string, password: string, isValid: boolean, tags: Array<string>, viewerCanModerateComments: boolean, backlinkCount: number, createdAt: string, updatedAt: string, keys: Array<{ name: string, content: string }>, properties: Array<{ name: string, value: string }>, comments: Array<{ id: string, text: string, createdAt: string, updatedAt: string, author?: { id: string, username: string } | null }>, createdBy?: { id: string, username: string } | null } }>, pageInfo: { hasNextPage: boolean, endCursor?: string | null } } };

export type CredentialTagsQueryVariables = Exact<{
  operationId: Scalars['ID']['input'];
}>;


export type CredentialTagsQuery = { credentialTags: Array<string> };

export type CredentialSourceHashesQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type CredentialSourceHashesQuery = { credential: { id: string, sourceHashes: Array<{ id: string, value: string, status: HashStatus }> } };

export type CredentialBacklinksQueryVariables = Exact<{
  credentialId: Scalars['ID']['input'];
}>;


export type CredentialBacklinksQuery = { wikiDocumentsReferencingCredential: Array<{ id: string, title: string, emoji: string, icon: string, color: string, updatedAt: string, ancestors: Array<{ id: string, title: string, emoji: string, icon: string, color: string, isDeleted: boolean }> }> };

export type MyCredentialsQueryVariables = Exact<{
  operationIds?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  type?: InputMaybe<CredentialType>;
  tags?: InputMaybe<Array<Scalars['String']['input']> | Scalars['String']['input']>;
  validOnly?: InputMaybe<Scalars['Boolean']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
}>;


export type MyCredentialsQuery = { myCredentials: { totalCount: number, edges: Array<{ cursor: string, node: { id: string, operationId: string, name: string, type: CredentialType, username: string, password: string, isValid: boolean, tags: Array<string>, viewerCanModerateComments: boolean, backlinkCount: number, createdAt: string, updatedAt: string, operation: { id: string, name: string }, keys: Array<{ name: string, content: string }>, properties: Array<{ name: string, value: string }>, comments: Array<{ id: string, text: string, createdAt: string, updatedAt: string, author?: { id: string, username: string } | null }>, createdBy?: { id: string, username: string } | null } }>, pageInfo: { hasNextPage: boolean, endCursor?: string | null } } };

export type MyCredentialTagsQueryVariables = Exact<{
  operationIds?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
}>;


export type MyCredentialTagsQuery = { myCredentialTags: Array<string> };

export type CreateCredentialMutationVariables = Exact<{
  operationId: Scalars['ID']['input'];
  input: CreateCredentialInput;
}>;


export type CreateCredentialMutation = { createCredential: { id: string, operationId: string, name: string, type: CredentialType, username: string, password: string, isValid: boolean, tags: Array<string>, viewerCanModerateComments: boolean, backlinkCount: number, createdAt: string, updatedAt: string, keys: Array<{ name: string, content: string }>, properties: Array<{ name: string, value: string }>, comments: Array<{ id: string, text: string, createdAt: string, updatedAt: string, author?: { id: string, username: string } | null }>, createdBy?: { id: string, username: string } | null } };

export type UpdateCredentialMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateCredentialInput;
}>;


export type UpdateCredentialMutation = { updateCredential: { id: string, operationId: string, name: string, type: CredentialType, username: string, password: string, isValid: boolean, tags: Array<string>, viewerCanModerateComments: boolean, backlinkCount: number, createdAt: string, updatedAt: string, keys: Array<{ name: string, content: string }>, properties: Array<{ name: string, value: string }>, comments: Array<{ id: string, text: string, createdAt: string, updatedAt: string, author?: { id: string, username: string } | null }>, createdBy?: { id: string, username: string } | null } };

export type DeleteCredentialMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteCredentialMutation = { deleteCredential: boolean };

export type AddCredentialCommentMutationVariables = Exact<{
  credentialId: Scalars['ID']['input'];
  text: Scalars['String']['input'];
}>;


export type AddCredentialCommentMutation = { addCredentialComment: { id: string, operationId: string, name: string, type: CredentialType, username: string, password: string, isValid: boolean, tags: Array<string>, viewerCanModerateComments: boolean, backlinkCount: number, createdAt: string, updatedAt: string, keys: Array<{ name: string, content: string }>, properties: Array<{ name: string, value: string }>, comments: Array<{ id: string, text: string, createdAt: string, updatedAt: string, author?: { id: string, username: string } | null }>, createdBy?: { id: string, username: string } | null } };

export type UpdateCredentialCommentMutationVariables = Exact<{
  credentialId: Scalars['ID']['input'];
  commentId: Scalars['ID']['input'];
  text: Scalars['String']['input'];
}>;


export type UpdateCredentialCommentMutation = { updateCredentialComment: { id: string, operationId: string, name: string, type: CredentialType, username: string, password: string, isValid: boolean, tags: Array<string>, viewerCanModerateComments: boolean, backlinkCount: number, createdAt: string, updatedAt: string, keys: Array<{ name: string, content: string }>, properties: Array<{ name: string, value: string }>, comments: Array<{ id: string, text: string, createdAt: string, updatedAt: string, author?: { id: string, username: string } | null }>, createdBy?: { id: string, username: string } | null } };

export type DeleteCredentialCommentMutationVariables = Exact<{
  credentialId: Scalars['ID']['input'];
  commentId: Scalars['ID']['input'];
}>;


export type DeleteCredentialCommentMutation = { deleteCredentialComment: { id: string, operationId: string, name: string, type: CredentialType, username: string, password: string, isValid: boolean, tags: Array<string>, viewerCanModerateComments: boolean, backlinkCount: number, createdAt: string, updatedAt: string, keys: Array<{ name: string, content: string }>, properties: Array<{ name: string, value: string }>, comments: Array<{ id: string, text: string, createdAt: string, updatedAt: string, author?: { id: string, username: string } | null }>, createdBy?: { id: string, username: string } | null } };

export type CredentialChangedSubscriptionVariables = Exact<{
  operationId: Scalars['ID']['input'];
}>;


export type CredentialChangedSubscription = { credentialChanged: { action: EventAction, credentialId: string, operationId: string, credential?: { id: string, operationId: string, name: string, type: CredentialType, username: string, password: string, isValid: boolean, tags: Array<string>, viewerCanModerateComments: boolean, backlinkCount: number, createdAt: string, updatedAt: string, keys: Array<{ name: string, content: string }>, properties: Array<{ name: string, value: string }>, comments: Array<{ id: string, text: string, createdAt: string, updatedAt: string, author?: { id: string, username: string } | null }>, createdBy?: { id: string, username: string } | null } | null } };

export type MyCredentialChangedSubscriptionVariables = Exact<{
  operationIds?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
}>;


export type MyCredentialChangedSubscription = { myCredentialChanged: { action: EventAction, credentialId: string, operationId: string, credential?: { id: string, operationId: string, name: string, type: CredentialType, username: string, password: string, isValid: boolean, tags: Array<string>, viewerCanModerateComments: boolean, backlinkCount: number, createdAt: string, updatedAt: string, operation: { id: string, name: string }, keys: Array<{ name: string, content: string }>, properties: Array<{ name: string, value: string }>, comments: Array<{ id: string, text: string, createdAt: string, updatedAt: string, author?: { id: string, username: string } | null }>, createdBy?: { id: string, username: string } | null } | null } };

export type HashFieldsFragment = { id: string, operationId: string, value: string, status: HashStatus, comment: string, tags: Array<string>, credentialId?: string | null, createdAt: string, updatedAt: string, createdBy?: { id: string, username: string } | null };

export type HashFieldsWithCredentialFragment = { id: string, operationId: string, value: string, status: HashStatus, comment: string, tags: Array<string>, credentialId?: string | null, createdAt: string, updatedAt: string, credential?: { id: string, name: string, type: CredentialType, username: string } | null, createdBy?: { id: string, username: string } | null };

export type HashFieldsWithOperationFragment = { id: string, operationId: string, value: string, status: HashStatus, comment: string, tags: Array<string>, credentialId?: string | null, createdAt: string, updatedAt: string, operation: { id: string, name: string }, createdBy?: { id: string, username: string } | null };

export type HashQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type HashQuery = { hash: { id: string, operationId: string, value: string, status: HashStatus, comment: string, tags: Array<string>, credentialId?: string | null, createdAt: string, updatedAt: string, credential?: { id: string, name: string, type: CredentialType, username: string } | null, createdBy?: { id: string, username: string } | null } };

export type HashesQueryVariables = Exact<{
  operationId: Scalars['ID']['input'];
  search?: InputMaybe<Scalars['String']['input']>;
  statuses?: InputMaybe<Array<HashStatus> | HashStatus>;
  tags?: InputMaybe<Array<Scalars['String']['input']> | Scalars['String']['input']>;
  hasCredential?: InputMaybe<Scalars['Boolean']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
}>;


export type HashesQuery = { hashes: { totalCount: number, edges: Array<{ cursor: string, node: { id: string, operationId: string, value: string, status: HashStatus, comment: string, tags: Array<string>, credentialId?: string | null, createdAt: string, updatedAt: string, createdBy?: { id: string, username: string } | null } }>, pageInfo: { hasNextPage: boolean, endCursor?: string | null } } };

export type HashTagsQueryVariables = Exact<{
  operationId: Scalars['ID']['input'];
}>;


export type HashTagsQuery = { hashTags: Array<string> };

export type MyHashesQueryVariables = Exact<{
  operationIds?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  statuses?: InputMaybe<Array<HashStatus> | HashStatus>;
  tags?: InputMaybe<Array<Scalars['String']['input']> | Scalars['String']['input']>;
  hasCredential?: InputMaybe<Scalars['Boolean']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
}>;


export type MyHashesQuery = { myHashes: { totalCount: number, edges: Array<{ cursor: string, node: { id: string, operationId: string, value: string, status: HashStatus, comment: string, tags: Array<string>, credentialId?: string | null, createdAt: string, updatedAt: string, operation: { id: string, name: string }, createdBy?: { id: string, username: string } | null } }>, pageInfo: { hasNextPage: boolean, endCursor?: string | null } } };

export type MyHashTagsQueryVariables = Exact<{
  operationIds?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
}>;


export type MyHashTagsQuery = { myHashTags: Array<string> };

export type CreateHashMutationVariables = Exact<{
  operationId: Scalars['ID']['input'];
  input: CreateHashInput;
}>;


export type CreateHashMutation = { createHash: { id: string, operationId: string, value: string, status: HashStatus, comment: string, tags: Array<string>, credentialId?: string | null, createdAt: string, updatedAt: string, createdBy?: { id: string, username: string } | null } };

export type UpdateHashMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateHashInput;
}>;


export type UpdateHashMutation = { updateHash: { id: string, operationId: string, value: string, status: HashStatus, comment: string, tags: Array<string>, credentialId?: string | null, createdAt: string, updatedAt: string, createdBy?: { id: string, username: string } | null } };

export type DeleteHashMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteHashMutation = { deleteHash: boolean };

export type BulkImportHashesMutationVariables = Exact<{
  operationId: Scalars['ID']['input'];
  input: BulkImportHashesInput;
}>;


export type BulkImportHashesMutation = { bulkImportHashes: { added: number, skipped: number, hashes: Array<{ id: string, operationId: string, value: string, status: HashStatus, comment: string, tags: Array<string>, credentialId?: string | null, createdAt: string, updatedAt: string, createdBy?: { id: string, username: string } | null }> } };

export type MarkHashCrackedMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: MarkHashCrackedInput;
}>;


export type MarkHashCrackedMutation = { markHashCracked: { id: string, operationId: string, value: string, status: HashStatus, comment: string, tags: Array<string>, credentialId?: string | null, createdAt: string, updatedAt: string, credential?: { id: string, name: string, type: CredentialType, username: string } | null, createdBy?: { id: string, username: string } | null } };

export type HashChangedSubscriptionVariables = Exact<{
  operationId: Scalars['ID']['input'];
}>;


export type HashChangedSubscription = { hashChanged: { action: EventAction, hashId: string, operationId: string, hash?: { id: string, operationId: string, value: string, status: HashStatus, comment: string, tags: Array<string>, credentialId?: string | null, createdAt: string, updatedAt: string, createdBy?: { id: string, username: string } | null } | null } };

export type MyHashChangedSubscriptionVariables = Exact<{
  operationIds?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
}>;


export type MyHashChangedSubscription = { myHashChanged: { action: EventAction, hashId: string, operationId: string, hash?: { id: string, operationId: string, value: string, status: HashStatus, comment: string, tags: Array<string>, credentialId?: string | null, createdAt: string, updatedAt: string, operation: { id: string, name: string }, createdBy?: { id: string, username: string } | null } | null } };

export type OperationMemberFieldsFragment = { role: OperationRole, user: { id: string, username: string, roles: Array<string>, active: boolean, createdAt: string, updatedAt: string } };

export type OperationFieldsFragment = { id: string, name: string, description: string, createdAt: string, updatedAt: string, members: Array<{ role: OperationRole, user: { id: string, username: string, roles: Array<string>, active: boolean, createdAt: string, updatedAt: string } }> };

export type OperationQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type OperationQuery = { operation: { id: string, name: string, description: string, createdAt: string, updatedAt: string, members: Array<{ role: OperationRole, user: { id: string, username: string, roles: Array<string>, active: boolean, createdAt: string, updatedAt: string } }> } };

export type OperationsQueryVariables = Exact<{
  search?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
}>;


export type OperationsQuery = { operations: { totalCount: number, edges: Array<{ cursor: string, node: { id: string, name: string, description: string, createdAt: string, updatedAt: string, members: Array<{ role: OperationRole, user: { id: string, username: string, roles: Array<string>, active: boolean, createdAt: string, updatedAt: string } }> } }>, pageInfo: { hasNextPage: boolean, hasPreviousPage: boolean, startCursor?: string | null, endCursor?: string | null } } };

export type MyOperationRoleQueryVariables = Exact<{
  operationId: Scalars['ID']['input'];
}>;


export type MyOperationRoleQuery = { myOperationRole?: OperationRole | null };

export type CreateOperationMutationVariables = Exact<{
  input: CreateOperationInput;
}>;


export type CreateOperationMutation = { createOperation: { id: string, name: string, description: string, createdAt: string, updatedAt: string, members: Array<{ role: OperationRole, user: { id: string, username: string, roles: Array<string>, active: boolean, createdAt: string, updatedAt: string } }> } };

export type UpdateOperationMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateOperationInput;
}>;


export type UpdateOperationMutation = { updateOperation: { id: string, name: string, description: string, createdAt: string, updatedAt: string, members: Array<{ role: OperationRole, user: { id: string, username: string, roles: Array<string>, active: boolean, createdAt: string, updatedAt: string } }> } };

export type DeleteOperationMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteOperationMutation = { deleteOperation: boolean };

export type AddOperationMemberMutationVariables = Exact<{
  operationId: Scalars['ID']['input'];
  userId: Scalars['ID']['input'];
  role: OperationRole;
}>;


export type AddOperationMemberMutation = { addOperationMember: { id: string, name: string, description: string, createdAt: string, updatedAt: string, members: Array<{ role: OperationRole, user: { id: string, username: string, roles: Array<string>, active: boolean, createdAt: string, updatedAt: string } }> } };

export type RemoveOperationMemberMutationVariables = Exact<{
  operationId: Scalars['ID']['input'];
  userId: Scalars['ID']['input'];
}>;


export type RemoveOperationMemberMutation = { removeOperationMember: { id: string, name: string, description: string, createdAt: string, updatedAt: string, members: Array<{ role: OperationRole, user: { id: string, username: string, roles: Array<string>, active: boolean, createdAt: string, updatedAt: string } }> } };

export type UpdateOperationMemberRoleMutationVariables = Exact<{
  operationId: Scalars['ID']['input'];
  userId: Scalars['ID']['input'];
  role: OperationRole;
}>;


export type UpdateOperationMemberRoleMutation = { updateOperationMemberRole: { id: string, name: string, description: string, createdAt: string, updatedAt: string, members: Array<{ role: OperationRole, user: { id: string, username: string, roles: Array<string>, active: boolean, createdAt: string, updatedAt: string } }> } };

export type UserSuggestionsQueryVariables = Exact<{
  search: Scalars['String']['input'];
  first?: InputMaybe<Scalars['Int']['input']>;
}>;


export type UserSuggestionsQuery = { userSuggestions: Array<{ id: string, username: string }> };

export type OperationChangedSubscriptionVariables = Exact<{
  operationId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type OperationChangedSubscription = { operationChanged: { action: EventAction, operationId: string, name?: string | null, operation?: { id: string, name: string, description: string, createdAt: string, updatedAt: string, members: Array<{ role: OperationRole, user: { id: string, username: string, roles: Array<string>, active: boolean, createdAt: string, updatedAt: string } }> } | null } };

export type OperationMemberChangedSubscriptionVariables = Exact<{
  operationId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type OperationMemberChangedSubscription = { operationMemberChanged: { action: EventAction, operationId: string, userId: string } };

export type SessionFieldsFragment = { id: string, userId: string, ipAddress: string, userAgent: string, browser: string, os: string, device: string, status: SessionStatus, lastActivityAt?: string | null, isCurrent: boolean, createdAt: string, updatedAt: string, user: { id: string, username: string } };

export type MySessionsQueryVariables = Exact<{
  activeOnly?: InputMaybe<Scalars['Boolean']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
}>;


export type MySessionsQuery = { mySessions: { totalCount: number, edges: Array<{ cursor: string, node: { id: string, userId: string, ipAddress: string, userAgent: string, browser: string, os: string, device: string, status: SessionStatus, lastActivityAt?: string | null, isCurrent: boolean, createdAt: string, updatedAt: string, user: { id: string, username: string } } }>, pageInfo: { hasNextPage: boolean, hasPreviousPage: boolean, startCursor?: string | null, endCursor?: string | null } } };

export type SessionsQueryVariables = Exact<{
  userId?: InputMaybe<Scalars['ID']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  activeOnly?: InputMaybe<Scalars['Boolean']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
}>;


export type SessionsQuery = { sessions: { totalCount: number, edges: Array<{ cursor: string, node: { id: string, userId: string, ipAddress: string, userAgent: string, browser: string, os: string, device: string, status: SessionStatus, lastActivityAt?: string | null, isCurrent: boolean, createdAt: string, updatedAt: string, user: { id: string, username: string } } }>, pageInfo: { hasNextPage: boolean, hasPreviousPage: boolean, startCursor?: string | null, endCursor?: string | null } } };

export type SessionQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type SessionQuery = { session: { id: string, userId: string, ipAddress: string, userAgent: string, browser: string, os: string, device: string, status: SessionStatus, lastActivityAt?: string | null, isCurrent: boolean, createdAt: string, updatedAt: string, user: { id: string, username: string } } };

export type RevokeSessionMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type RevokeSessionMutation = { revokeSession: boolean };

export type RevokeAllMySessionsMutationVariables = Exact<{ [key: string]: never; }>;


export type RevokeAllMySessionsMutation = { revokeAllMySessions: number };

export type AdminRevokeSessionMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type AdminRevokeSessionMutation = { adminRevokeSession: boolean };

export type AdminRevokeAllUserSessionsMutationVariables = Exact<{
  userId: Scalars['ID']['input'];
}>;


export type AdminRevokeAllUserSessionsMutation = { adminRevokeAllUserSessions: number };

export type MySessionChangedSubscriptionVariables = Exact<{ [key: string]: never; }>;


export type MySessionChangedSubscription = { mySessionChanged: { action: EventAction, sessionId: string, userId: string, session?: { id: string, userId: string, ipAddress: string, userAgent: string, browser: string, os: string, device: string, status: SessionStatus, lastActivityAt?: string | null, isCurrent: boolean, createdAt: string, updatedAt: string, user: { id: string, username: string } } | null } };

export type SessionChangedSubscriptionVariables = Exact<{
  userId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type SessionChangedSubscription = { sessionChanged: { action: EventAction, sessionId: string, userId: string, session?: { id: string, userId: string, ipAddress: string, userAgent: string, browser: string, os: string, device: string, status: SessionStatus, lastActivityAt?: string | null, isCurrent: boolean, createdAt: string, updatedAt: string, user: { id: string, username: string } } | null } };

export type TaskFieldsFragment = { id: string, operationId: string, name: string, description: string, riskScore: number, riskDescription: string, profitScore: number, profitDescription: string, stage: TaskStage, status: TaskStatus, lastUpdatedAt?: string | null, deletedAt?: string | null, doneAt?: string | null, createdAt: string, updatedAt: string, assignees: Array<{ id: string, username: string }>, wikiReferences: Array<{ id: string, title: string, emoji: string }>, credentialReferences: Array<{ id: string, name: string, type: CredentialType }>, createdBy?: { id: string, username: string } | null, lastUpdatedBy?: { id: string, username: string } | null };

export type TaskBacklinkFieldsFragment = { id: string, operationId: string, name: string, stage: TaskStage, status: TaskStatus, riskScore: number, profitScore: number, assignees: Array<{ id: string, username: string }> };

export type TaskQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type TaskQuery = { task: { id: string, operationId: string, name: string, description: string, riskScore: number, riskDescription: string, profitScore: number, profitDescription: string, stage: TaskStage, status: TaskStatus, lastUpdatedAt?: string | null, deletedAt?: string | null, doneAt?: string | null, createdAt: string, updatedAt: string, assignees: Array<{ id: string, username: string }>, wikiReferences: Array<{ id: string, title: string, emoji: string }>, credentialReferences: Array<{ id: string, name: string, type: CredentialType }>, createdBy?: { id: string, username: string } | null, lastUpdatedBy?: { id: string, username: string } | null } };

export type TasksQueryVariables = Exact<{
  operationId: Scalars['ID']['input'];
  stage?: InputMaybe<TaskStage>;
  excludeStages?: InputMaybe<Array<TaskStage> | TaskStage>;
  riskScoreMin?: InputMaybe<Scalars['Int']['input']>;
  riskScoreMax?: InputMaybe<Scalars['Int']['input']>;
  profitScoreMin?: InputMaybe<Scalars['Int']['input']>;
  profitScoreMax?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
}>;


export type TasksQuery = { tasks: { totalCount: number, edges: Array<{ cursor: string, node: { id: string, operationId: string, name: string, description: string, riskScore: number, riskDescription: string, profitScore: number, profitDescription: string, stage: TaskStage, status: TaskStatus, lastUpdatedAt?: string | null, deletedAt?: string | null, doneAt?: string | null, createdAt: string, updatedAt: string, assignees: Array<{ id: string, username: string }>, wikiReferences: Array<{ id: string, title: string, emoji: string }>, credentialReferences: Array<{ id: string, name: string, type: CredentialType }>, createdBy?: { id: string, username: string } | null, lastUpdatedBy?: { id: string, username: string } | null } }>, pageInfo: { hasNextPage: boolean, endCursor?: string | null } } };

export type TaskTrashQueryVariables = Exact<{
  operationId: Scalars['ID']['input'];
  first?: InputMaybe<Scalars['Int']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
}>;


export type TaskTrashQuery = { taskTrash: { totalCount: number, edges: Array<{ cursor: string, node: { id: string, operationId: string, name: string, description: string, riskScore: number, riskDescription: string, profitScore: number, profitDescription: string, stage: TaskStage, status: TaskStatus, lastUpdatedAt?: string | null, deletedAt?: string | null, doneAt?: string | null, createdAt: string, updatedAt: string, assignees: Array<{ id: string, username: string }>, wikiReferences: Array<{ id: string, title: string, emoji: string }>, credentialReferences: Array<{ id: string, name: string, type: CredentialType }>, createdBy?: { id: string, username: string } | null, lastUpdatedBy?: { id: string, username: string } | null } }>, pageInfo: { hasNextPage: boolean, endCursor?: string | null } } };

export type TasksReferencingWikiDocumentQueryVariables = Exact<{
  documentId: Scalars['ID']['input'];
}>;


export type TasksReferencingWikiDocumentQuery = { tasksReferencingWikiDocument: Array<{ id: string, operationId: string, name: string, stage: TaskStage, status: TaskStatus, riskScore: number, profitScore: number, assignees: Array<{ id: string, username: string }> }> };

export type TasksReferencingCredentialQueryVariables = Exact<{
  credentialId: Scalars['ID']['input'];
}>;


export type TasksReferencingCredentialQuery = { tasksReferencingCredential: Array<{ id: string, operationId: string, name: string, stage: TaskStage, status: TaskStatus, riskScore: number, profitScore: number, assignees: Array<{ id: string, username: string }> }> };

export type CreateTaskMutationVariables = Exact<{
  input: CreateTaskInput;
}>;


export type CreateTaskMutation = { createTask: { id: string, operationId: string, name: string, description: string, riskScore: number, riskDescription: string, profitScore: number, profitDescription: string, stage: TaskStage, status: TaskStatus, lastUpdatedAt?: string | null, deletedAt?: string | null, doneAt?: string | null, createdAt: string, updatedAt: string, assignees: Array<{ id: string, username: string }>, wikiReferences: Array<{ id: string, title: string, emoji: string }>, credentialReferences: Array<{ id: string, name: string, type: CredentialType }>, createdBy?: { id: string, username: string } | null, lastUpdatedBy?: { id: string, username: string } | null } };

export type UpdateTaskMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateTaskInput;
}>;


export type UpdateTaskMutation = { updateTask: { id: string, operationId: string, name: string, description: string, riskScore: number, riskDescription: string, profitScore: number, profitDescription: string, stage: TaskStage, status: TaskStatus, lastUpdatedAt?: string | null, deletedAt?: string | null, doneAt?: string | null, createdAt: string, updatedAt: string, assignees: Array<{ id: string, username: string }>, wikiReferences: Array<{ id: string, title: string, emoji: string }>, credentialReferences: Array<{ id: string, name: string, type: CredentialType }>, createdBy?: { id: string, username: string } | null, lastUpdatedBy?: { id: string, username: string } | null } };

export type ChangeTaskStageMutationVariables = Exact<{
  input: ChangeTaskStageInput;
}>;


export type ChangeTaskStageMutation = { changeTaskStage: { id: string, operationId: string, name: string, description: string, riskScore: number, riskDescription: string, profitScore: number, profitDescription: string, stage: TaskStage, status: TaskStatus, lastUpdatedAt?: string | null, deletedAt?: string | null, doneAt?: string | null, createdAt: string, updatedAt: string, assignees: Array<{ id: string, username: string }>, wikiReferences: Array<{ id: string, title: string, emoji: string }>, credentialReferences: Array<{ id: string, name: string, type: CredentialType }>, createdBy?: { id: string, username: string } | null, lastUpdatedBy?: { id: string, username: string } | null } };

export type SetTaskAssigneesMutationVariables = Exact<{
  taskId: Scalars['ID']['input'];
  assigneeIds: Array<Scalars['ID']['input']> | Scalars['ID']['input'];
}>;


export type SetTaskAssigneesMutation = { setTaskAssignees: { id: string, operationId: string, name: string, description: string, riskScore: number, riskDescription: string, profitScore: number, profitDescription: string, stage: TaskStage, status: TaskStatus, lastUpdatedAt?: string | null, deletedAt?: string | null, doneAt?: string | null, createdAt: string, updatedAt: string, assignees: Array<{ id: string, username: string }>, wikiReferences: Array<{ id: string, title: string, emoji: string }>, credentialReferences: Array<{ id: string, name: string, type: CredentialType }>, createdBy?: { id: string, username: string } | null, lastUpdatedBy?: { id: string, username: string } | null } };

export type SetTaskWikiReferencesMutationVariables = Exact<{
  taskId: Scalars['ID']['input'];
  wikiIds: Array<Scalars['ID']['input']> | Scalars['ID']['input'];
}>;


export type SetTaskWikiReferencesMutation = { setTaskWikiReferences: { id: string, operationId: string, name: string, description: string, riskScore: number, riskDescription: string, profitScore: number, profitDescription: string, stage: TaskStage, status: TaskStatus, lastUpdatedAt?: string | null, deletedAt?: string | null, doneAt?: string | null, createdAt: string, updatedAt: string, assignees: Array<{ id: string, username: string }>, wikiReferences: Array<{ id: string, title: string, emoji: string }>, credentialReferences: Array<{ id: string, name: string, type: CredentialType }>, createdBy?: { id: string, username: string } | null, lastUpdatedBy?: { id: string, username: string } | null } };

export type AddTaskWikiReferenceMutationVariables = Exact<{
  taskId: Scalars['ID']['input'];
  wikiId: Scalars['ID']['input'];
}>;


export type AddTaskWikiReferenceMutation = { addTaskWikiReference: { id: string, operationId: string, name: string, description: string, riskScore: number, riskDescription: string, profitScore: number, profitDescription: string, stage: TaskStage, status: TaskStatus, lastUpdatedAt?: string | null, deletedAt?: string | null, doneAt?: string | null, createdAt: string, updatedAt: string, assignees: Array<{ id: string, username: string }>, wikiReferences: Array<{ id: string, title: string, emoji: string }>, credentialReferences: Array<{ id: string, name: string, type: CredentialType }>, createdBy?: { id: string, username: string } | null, lastUpdatedBy?: { id: string, username: string } | null } };

export type SetTaskCredentialReferencesMutationVariables = Exact<{
  taskId: Scalars['ID']['input'];
  credentialIds: Array<Scalars['ID']['input']> | Scalars['ID']['input'];
}>;


export type SetTaskCredentialReferencesMutation = { setTaskCredentialReferences: { id: string, operationId: string, name: string, description: string, riskScore: number, riskDescription: string, profitScore: number, profitDescription: string, stage: TaskStage, status: TaskStatus, lastUpdatedAt?: string | null, deletedAt?: string | null, doneAt?: string | null, createdAt: string, updatedAt: string, assignees: Array<{ id: string, username: string }>, wikiReferences: Array<{ id: string, title: string, emoji: string }>, credentialReferences: Array<{ id: string, name: string, type: CredentialType }>, createdBy?: { id: string, username: string } | null, lastUpdatedBy?: { id: string, username: string } | null } };

export type DeleteTaskMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteTaskMutation = { deleteTask: boolean };

export type RestoreTaskMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type RestoreTaskMutation = { restoreTask: { id: string, operationId: string, name: string, description: string, riskScore: number, riskDescription: string, profitScore: number, profitDescription: string, stage: TaskStage, status: TaskStatus, lastUpdatedAt?: string | null, deletedAt?: string | null, doneAt?: string | null, createdAt: string, updatedAt: string, assignees: Array<{ id: string, username: string }>, wikiReferences: Array<{ id: string, title: string, emoji: string }>, credentialReferences: Array<{ id: string, name: string, type: CredentialType }>, createdBy?: { id: string, username: string } | null, lastUpdatedBy?: { id: string, username: string } | null } };

export type PurgeTaskMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type PurgeTaskMutation = { purgeTask: boolean };

export type TaskChangedSubscriptionVariables = Exact<{
  operationId: Scalars['ID']['input'];
}>;


export type TaskChangedSubscription = { taskChanged: { action: EventAction, taskId: string, operationId: string, task?: { id: string, operationId: string, name: string, description: string, riskScore: number, riskDescription: string, profitScore: number, profitDescription: string, stage: TaskStage, status: TaskStatus, lastUpdatedAt?: string | null, deletedAt?: string | null, doneAt?: string | null, createdAt: string, updatedAt: string, assignees: Array<{ id: string, username: string }>, wikiReferences: Array<{ id: string, title: string, emoji: string }>, credentialReferences: Array<{ id: string, name: string, type: CredentialType }>, createdBy?: { id: string, username: string } | null, lastUpdatedBy?: { id: string, username: string } | null } | null } };

export type TimelineEventFieldsFragment = { id: string, operationId: string, topic: string, subjectKind: string, subjectId: string, subjectName: string, occurredAt: string, metadata: string, actor?: { id: string, username: string } | null };

export type TimelineBucketsQueryVariables = Exact<{
  operationId: Scalars['ID']['input'];
  granularity?: InputMaybe<TimelineGranularity>;
  timezone: Scalars['String']['input'];
  from?: InputMaybe<Scalars['String']['input']>;
  to?: InputMaybe<Scalars['String']['input']>;
  types?: InputMaybe<Array<Scalars['String']['input']> | Scalars['String']['input']>;
  actorIds?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
}>;


export type TimelineBucketsQuery = { timelineBuckets: Array<{ bucketStart: string, count: number, topicCounts: Array<{ topic: string, subjectKind: string, count: number }> }> };

export type TimelineEventsByDayQueryVariables = Exact<{
  operationId: Scalars['ID']['input'];
  date: Scalars['String']['input'];
  timezone: Scalars['String']['input'];
  granularity?: InputMaybe<TimelineGranularity>;
  types?: InputMaybe<Array<Scalars['String']['input']> | Scalars['String']['input']>;
  actorIds?: InputMaybe<Array<Scalars['ID']['input']> | Scalars['ID']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
}>;


export type TimelineEventsByDayQuery = { timelineEventsByDay: { edges: Array<{ cursor: string, node: { id: string, operationId: string, topic: string, subjectKind: string, subjectId: string, subjectName: string, occurredAt: string, metadata: string, actor?: { id: string, username: string } | null } }>, pageInfo: { hasNextPage: boolean, hasPreviousPage: boolean, startCursor?: string | null, endCursor?: string | null } } };

export type TimelineEventAddedSubscriptionVariables = Exact<{
  operationId: Scalars['ID']['input'];
}>;


export type TimelineEventAddedSubscription = { timelineEventAdded: { id: string, operationId: string, topic: string, subjectKind: string, subjectId: string, subjectName: string, occurredAt: string, metadata: string, actor?: { id: string, username: string } | null } };

export type CreateCustomTimelineEventMutationVariables = Exact<{
  operationId: Scalars['ID']['input'];
  input: CreateCustomTimelineEventInput;
}>;


export type CreateCustomTimelineEventMutation = { createCustomTimelineEvent: { id: string, operationId: string, topic: string, subjectKind: string, subjectId: string, subjectName: string, occurredAt: string, metadata: string, actor?: { id: string, username: string } | null } };

export type UpdateCustomTimelineEventMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateCustomTimelineEventInput;
}>;


export type UpdateCustomTimelineEventMutation = { updateCustomTimelineEvent: { id: string, operationId: string, topic: string, subjectKind: string, subjectId: string, subjectName: string, occurredAt: string, metadata: string, actor?: { id: string, username: string } | null } };

export type DeleteCustomTimelineEventMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteCustomTimelineEventMutation = { deleteCustomTimelineEvent: boolean };

export type UserFieldsFragment = { id: string, username: string, roles: Array<string>, active: boolean, createdAt: string, updatedAt: string };

export type MeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeQuery = { me: { id: string, username: string, roles: Array<string>, active: boolean, createdAt: string, updatedAt: string } };

export type UserQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type UserQuery = { user: { id: string, username: string, roles: Array<string>, active: boolean, createdAt: string, updatedAt: string } };

export type UsersQueryVariables = Exact<{
  search?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
}>;


export type UsersQuery = { users: { totalCount: number, edges: Array<{ cursor: string, node: { id: string, username: string, roles: Array<string>, active: boolean, createdAt: string, updatedAt: string } }>, pageInfo: { hasNextPage: boolean, hasPreviousPage: boolean, startCursor?: string | null, endCursor?: string | null } } };

export type CreateUserMutationVariables = Exact<{
  input: CreateUserInput;
}>;


export type CreateUserMutation = { createUser: { id: string, username: string, roles: Array<string>, active: boolean, createdAt: string, updatedAt: string } };

export type UpdateUserMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateUserInput;
}>;


export type UpdateUserMutation = { updateUser: { id: string, username: string, roles: Array<string>, active: boolean, createdAt: string, updatedAt: string } };

export type DeleteUserMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteUserMutation = { deleteUser: boolean };

export type UpdateOwnProfileMutationVariables = Exact<{
  input: UpdateUserInput;
}>;


export type UpdateOwnProfileMutation = { updateOwnProfile: { id: string, username: string, roles: Array<string>, active: boolean, createdAt: string, updatedAt: string } };

export type UserChangedSubscriptionVariables = Exact<{ [key: string]: never; }>;


export type UserChangedSubscription = { userChanged: { action: EventAction, userId: string, username?: string | null, user?: { id: string, username: string, roles: Array<string>, active: boolean, createdAt: string, updatedAt: string } | null } };

export type WikiDocumentTreeFieldsFragment = { id: string, operationId: string, parentDocumentId?: string | null, title: string, emoji: string, icon: string, color: string, sortOrder: string, childCount: number, lastUpdatedAt?: string | null, updatedAt: string };

export type WikiDocumentLiteFieldsFragment = { id: string, title: string, emoji: string, icon: string, color: string, deletedAt?: string | null };

export type WikiDocumentBacklinkFieldsFragment = { id: string, title: string, emoji: string, icon: string, color: string, updatedAt: string, ancestors: Array<{ id: string, title: string, emoji: string, icon: string, color: string, isDeleted: boolean }> };

export type WikiDocumentFieldsFragment = { id: string, operationId: string, parentDocumentId?: string | null, title: string, content: string, emoji: string, color: string, icon: string, sortOrder: string, lastUpdatedAt?: string | null, lastBackupAt?: string | null, createdAt: string, updatedAt: string, ancestors: Array<{ id: string, title: string, emoji: string, icon: string, color: string, isDeleted: boolean }>, createdBy: { id: string, username: string }, lastUpdatedBy?: { id: string, username: string } | null };

export type WikiDocumentBackupListFieldsFragment = { id: string, documentId: string, title: string, trigger: WikiDocumentBackupTrigger, description: string, contentLength: number, createdAt: string, createdBy?: { id: string, username: string } | null };

export type WikiDocumentBackupDetailFieldsFragment = { id: string, documentId: string, title: string, content: string, contentLength: number, trigger: WikiDocumentBackupTrigger, description: string, createdAt: string, createdBy?: { id: string, username: string } | null };

export type WikiDocumentVisitListFieldsFragment = { id: string, visitedAt: string, document: { id: string, title: string, emoji: string, icon: string, color: string, ancestors: Array<{ id: string, title: string, emoji: string, icon: string, color: string, isDeleted: boolean }> } };

export type WikiDocumentTreeQueryVariables = Exact<{
  operationId: Scalars['ID']['input'];
}>;


export type WikiDocumentTreeQuery = { wikiDocumentTree: Array<{ id: string, operationId: string, parentDocumentId?: string | null, title: string, emoji: string, icon: string, color: string, sortOrder: string, childCount: number, lastUpdatedAt?: string | null, updatedAt: string }> };

export type WikiDocumentChildrenQueryVariables = Exact<{
  operationId: Scalars['ID']['input'];
  parentDocumentId?: InputMaybe<Scalars['ID']['input']>;
}>;


export type WikiDocumentChildrenQuery = { wikiDocumentChildren: Array<{ id: string, operationId: string, parentDocumentId?: string | null, title: string, emoji: string, icon: string, color: string, sortOrder: string, childCount: number, lastUpdatedAt?: string | null, updatedAt: string }> };

export type WikiDocumentTreeRevealPathQueryVariables = Exact<{
  documentId: Scalars['ID']['input'];
}>;


export type WikiDocumentTreeRevealPathQuery = { wikiDocumentTreeRevealPath: Array<{ id: string, operationId: string, parentDocumentId?: string | null, title: string, emoji: string, icon: string, color: string, sortOrder: string, childCount: number, lastUpdatedAt?: string | null, updatedAt: string }> };

export type WikiDocumentTrashCountQueryVariables = Exact<{
  operationId: Scalars['ID']['input'];
}>;


export type WikiDocumentTrashCountQuery = { wikiDocumentTrashCount: number };

export type WikiDocumentQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type WikiDocumentQuery = { wikiDocument: { id: string, operationId: string, parentDocumentId?: string | null, title: string, content: string, emoji: string, color: string, icon: string, sortOrder: string, lastUpdatedAt?: string | null, lastBackupAt?: string | null, createdAt: string, updatedAt: string, ancestors: Array<{ id: string, title: string, emoji: string, icon: string, color: string, isDeleted: boolean }>, createdBy: { id: string, username: string }, lastUpdatedBy?: { id: string, username: string } | null } };

export type WikiDocumentsQueryVariables = Exact<{
  operationId: Scalars['ID']['input'];
  parentDocumentId?: InputMaybe<Scalars['ID']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
}>;


export type WikiDocumentsQuery = { wikiDocuments: { totalCount: number, edges: Array<{ cursor: string, node: { id: string, operationId: string, parentDocumentId?: string | null, title: string, emoji: string, icon: string, color: string, sortOrder: string, createdAt: string, updatedAt: string, ancestors: Array<{ id: string, title: string, emoji: string, icon: string, color: string, isDeleted: boolean }>, createdBy: { id: string, username: string } } }>, pageInfo: { hasNextPage: boolean, endCursor?: string | null } } };

export type WikiRecentDocumentsQueryVariables = Exact<{
  operationId: Scalars['ID']['input'];
  sort?: InputMaybe<WikiDocumentSort>;
  first?: InputMaybe<Scalars['Int']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
}>;


export type WikiRecentDocumentsQuery = { wikiDocuments: { totalCount: number, edges: Array<{ cursor: string, node: { id: string, title: string, emoji: string, icon: string, color: string, parentDocumentId?: string | null, createdAt: string, updatedAt: string, lastUpdatedAt?: string | null, ancestors: Array<{ id: string, title: string, emoji: string, icon: string, color: string, isDeleted: boolean }>, createdBy: { id: string, username: string }, lastUpdatedBy?: { id: string, username: string } | null } }>, pageInfo: { hasNextPage: boolean, endCursor?: string | null } } };

export type WikiSearchQueryVariables = Exact<{
  operationId: Scalars['ID']['input'];
  scope?: InputMaybe<Scalars['ID']['input']>;
  query: Scalars['String']['input'];
  offset?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;


export type WikiSearchQuery = { wikiSearch: { total: number, hasMore: boolean, hits: Array<{ snippet: string, score?: number | null, document: { id: string, title: string, emoji: string, icon: string, color: string, parentDocumentId?: string | null, ancestors: Array<{ id: string, title: string, emoji: string, icon: string, color: string, isDeleted: boolean }>, createdBy: { id: string, username: string } }, matchRanges: Array<{ start: number, end: number }> }> } };

export type WikiDocumentLiteQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type WikiDocumentLiteQuery = { wikiDocument: { id: string, title: string, emoji: string, icon: string, color: string, deletedAt?: string | null } };

export type WikiDocumentBacklinksQueryVariables = Exact<{
  documentId: Scalars['ID']['input'];
}>;


export type WikiDocumentBacklinksQuery = { wikiDocumentBacklinks: Array<{ id: string, title: string, emoji: string, icon: string, color: string, updatedAt: string, ancestors: Array<{ id: string, title: string, emoji: string, icon: string, color: string, isDeleted: boolean }> }> };

export type WikiDocumentTrashQueryVariables = Exact<{
  operationId: Scalars['ID']['input'];
  first?: InputMaybe<Scalars['Int']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
}>;


export type WikiDocumentTrashQuery = { wikiDocumentTrash: { totalCount: number, edges: Array<{ cursor: string, node: { id: string, title: string, emoji: string, icon: string, color: string, deletedAt?: string | null, createdAt: string, deletedBy?: { id: string, username: string } | null, ancestors: Array<{ id: string, title: string, emoji: string, icon: string, color: string, isDeleted: boolean }> } }>, pageInfo: { hasNextPage: boolean, endCursor?: string | null } } };

export type WikiDocumentBackupsQueryVariables = Exact<{
  documentId: Scalars['ID']['input'];
  first?: InputMaybe<Scalars['Int']['input']>;
  after?: InputMaybe<Scalars['String']['input']>;
}>;


export type WikiDocumentBackupsQuery = { wikiDocumentBackups: { totalCount: number, edges: Array<{ cursor: string, node: { id: string, documentId: string, title: string, trigger: WikiDocumentBackupTrigger, description: string, contentLength: number, createdAt: string, createdBy?: { id: string, username: string } | null } }>, pageInfo: { hasNextPage: boolean, endCursor?: string | null } } };

export type WikiDocumentBackupDetailQueryVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type WikiDocumentBackupDetailQuery = { wikiDocumentBackup: { id: string, documentId: string, title: string, content: string, contentLength: number, trigger: WikiDocumentBackupTrigger, description: string, createdAt: string, createdBy?: { id: string, username: string } | null } };

export type WikiDocumentPresenceQueryVariables = Exact<{
  documentId: Scalars['ID']['input'];
}>;


export type WikiDocumentPresenceQuery = { wikiDocumentPresence: { documentId: string, activeEditors: Array<{ userId: string, username: string, connectedAt: string }> } };

export type WikiOperationPresenceQueryVariables = Exact<{
  operationId: Scalars['ID']['input'];
}>;


export type WikiOperationPresenceQuery = { wikiOperationPresence: Array<{ documentId: string, activeEditors: Array<{ userId: string, username: string, connectedAt: string }> }> };

export type WikiDocumentHistoryQueryVariables = Exact<{
  operationId: Scalars['ID']['input'];
  offset?: InputMaybe<Scalars['Int']['input']>;
  limit?: InputMaybe<Scalars['Int']['input']>;
}>;


export type WikiDocumentHistoryQuery = { wikiDocumentHistory: { totalCount: number, edges: Array<{ node: { id: string, visitedAt: string, document: { id: string, title: string, emoji: string, icon: string, color: string, ancestors: Array<{ id: string, title: string, emoji: string, icon: string, color: string, isDeleted: boolean }> } } }> } };

export type CreateWikiDocumentMutationVariables = Exact<{
  operationId: Scalars['ID']['input'];
  input: CreateWikiDocumentInput;
}>;


export type CreateWikiDocumentMutation = { createWikiDocument: { id: string, operationId: string, title: string, emoji: string, color: string, icon: string, sortOrder: string, parentDocumentId?: string | null, createdAt: string, updatedAt: string, createdBy: { id: string, username: string } } };

export type UpdateWikiDocumentMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  input: UpdateWikiDocumentInput;
}>;


export type UpdateWikiDocumentMutation = { updateWikiDocument: { id: string, title: string, emoji: string, color: string, icon: string, sortOrder: string, parentDocumentId?: string | null, updatedAt: string } };

export type ReorderWikiDocumentSiblingsMutationVariables = Exact<{
  input: ReorderWikiDocumentSiblingsInput;
}>;


export type ReorderWikiDocumentSiblingsMutation = { reorderWikiDocumentSiblings: Array<{ id: string, sortOrder: string, parentDocumentId?: string | null, updatedAt: string }> };

export type DeleteWikiDocumentMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteWikiDocumentMutation = { deleteWikiDocument: boolean };

export type DuplicateWikiDocumentMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  withChildren?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type DuplicateWikiDocumentMutation = { duplicateWikiDocument: { id: string, operationId: string, title: string, emoji: string, color: string, icon: string, sortOrder: string, parentDocumentId?: string | null, createdAt: string, updatedAt: string } };

export type RestoreWikiDocumentMutationVariables = Exact<{
  id: Scalars['ID']['input'];
  cascade?: InputMaybe<Scalars['Boolean']['input']>;
}>;


export type RestoreWikiDocumentMutation = { restoreWikiDocument: { id: string, operationId: string, title: string, emoji: string, icon: string, color: string, sortOrder: string, parentDocumentId?: string | null } };

export type WikiDocumentTrashedDescendantsQueryVariables = Exact<{
  documentId: Scalars['ID']['input'];
}>;


export type WikiDocumentTrashedDescendantsQuery = { wikiDocumentTrashedDescendants: Array<{ id: string, title: string, emoji: string, icon: string, color: string }> };

export type PermanentlyDeleteWikiDocumentMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type PermanentlyDeleteWikiDocumentMutation = { permanentlyDeleteWikiDocument: boolean };

export type EmptyWikiDocumentTrashMutationVariables = Exact<{
  operationId: Scalars['ID']['input'];
}>;


export type EmptyWikiDocumentTrashMutation = { emptyWikiDocumentTrash: boolean };

export type CreateWikiDocumentBackupMutationVariables = Exact<{
  documentId: Scalars['ID']['input'];
  description?: InputMaybe<Scalars['String']['input']>;
}>;


export type CreateWikiDocumentBackupMutation = { createWikiDocumentBackup: { id: string, documentId: string, title: string, trigger: WikiDocumentBackupTrigger, description: string, createdAt: string, createdBy?: { id: string, username: string } | null } };

export type RestoreWikiDocumentBackupMutationVariables = Exact<{
  documentId: Scalars['ID']['input'];
  backupId: Scalars['ID']['input'];
}>;


export type RestoreWikiDocumentBackupMutation = { restoreWikiDocumentBackup: { id: string, title: string, content: string } };

export type DeleteWikiDocumentBackupMutationVariables = Exact<{
  id: Scalars['ID']['input'];
}>;


export type DeleteWikiDocumentBackupMutation = { deleteWikiDocumentBackup: boolean };

export type TrackWikiDocumentVisitMutationVariables = Exact<{
  documentId: Scalars['ID']['input'];
}>;


export type TrackWikiDocumentVisitMutation = { trackWikiDocumentVisit: { id: string, visitedAt: string } };

export type WikiDocumentChangedSubscriptionVariables = Exact<{
  operationId: Scalars['ID']['input'];
}>;


export type WikiDocumentChangedSubscription = { wikiDocumentChanged: { action: EventAction, documentId: string, operationId: string, parentDocumentId?: string | null, previousParentDocumentId?: string | null, document?: { id: string, title: string, emoji: string, icon: string, color: string, sortOrder: string, parentDocument?: { id: string } | null } | null } };

export type WikiDocumentPresenceChangedSubscriptionVariables = Exact<{
  operationId: Scalars['ID']['input'];
}>;


export type WikiDocumentPresenceChangedSubscription = { wikiDocumentPresenceChanged: { documentId: string, operationId: string, userId: string, username: string, action: PresenceAction } };

export const ApiKeyFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"APIKeyFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"APIKey"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"keyId"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}},{"kind":"Field","name":{"kind":"Name","value":"lastUsedAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<ApiKeyFieldsFragment, unknown>;
export const CredentialCommentFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialCommentFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CredentialComment"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"author"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}}]} as unknown as DocumentNode<CredentialCommentFieldsFragment, unknown>;
export const CredentialFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Credential"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"password"}},{"kind":"Field","name":{"kind":"Name","value":"keys"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"content"}}]}},{"kind":"Field","name":{"kind":"Name","value":"properties"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}},{"kind":"Field","name":{"kind":"Name","value":"isValid"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"comments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialCommentFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"viewerCanModerateComments"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"backlinkCount"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialCommentFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CredentialComment"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"author"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}}]} as unknown as DocumentNode<CredentialFieldsFragment, unknown>;
export const CredentialFieldsWithOperationFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialFieldsWithOperation"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Credential"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialFields"}},{"kind":"Field","name":{"kind":"Name","value":"operation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialCommentFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CredentialComment"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"author"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Credential"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"password"}},{"kind":"Field","name":{"kind":"Name","value":"keys"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"content"}}]}},{"kind":"Field","name":{"kind":"Name","value":"properties"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}},{"kind":"Field","name":{"kind":"Name","value":"isValid"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"comments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialCommentFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"viewerCanModerateComments"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"backlinkCount"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<CredentialFieldsWithOperationFragment, unknown>;
export const HashFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HashFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hash"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"credentialId"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<HashFieldsFragment, unknown>;
export const HashFieldsWithCredentialFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HashFieldsWithCredential"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hash"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"HashFields"}},{"kind":"Field","name":{"kind":"Name","value":"credential"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HashFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hash"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"credentialId"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<HashFieldsWithCredentialFragment, unknown>;
export const HashFieldsWithOperationFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HashFieldsWithOperation"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hash"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"HashFields"}},{"kind":"Field","name":{"kind":"Name","value":"operation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HashFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hash"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"credentialId"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<HashFieldsWithOperationFragment, unknown>;
export const OperationMemberFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"OperationMemberFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"OperationMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"roles"}},{"kind":"Field","name":{"kind":"Name","value":"active"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"role"}}]}}]} as unknown as DocumentNode<OperationMemberFieldsFragment, unknown>;
export const OperationFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"OperationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Operation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"members"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"OperationMemberFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"OperationMemberFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"OperationMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"roles"}},{"kind":"Field","name":{"kind":"Name","value":"active"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"role"}}]}}]} as unknown as DocumentNode<OperationFieldsFragment, unknown>;
export const SessionFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"SessionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Session"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"ipAddress"}},{"kind":"Field","name":{"kind":"Name","value":"userAgent"}},{"kind":"Field","name":{"kind":"Name","value":"browser"}},{"kind":"Field","name":{"kind":"Name","value":"os"}},{"kind":"Field","name":{"kind":"Name","value":"device"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"lastActivityAt"}},{"kind":"Field","name":{"kind":"Name","value":"isCurrent"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<SessionFieldsFragment, unknown>;
export const TaskFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"riskScore"}},{"kind":"Field","name":{"kind":"Name","value":"riskDescription"}},{"kind":"Field","name":{"kind":"Name","value":"profitScore"}},{"kind":"Field","name":{"kind":"Name","value":"profitDescription"}},{"kind":"Field","name":{"kind":"Name","value":"stage"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"assignees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"wikiReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}}]}},{"kind":"Field","name":{"kind":"Name","value":"credentialReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"doneAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<TaskFieldsFragment, unknown>;
export const TaskBacklinkFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskBacklinkFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"stage"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"riskScore"}},{"kind":"Field","name":{"kind":"Name","value":"profitScore"}},{"kind":"Field","name":{"kind":"Name","value":"assignees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}}]} as unknown as DocumentNode<TaskBacklinkFieldsFragment, unknown>;
export const TimelineEventFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TimelineEventFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineEvent"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"topic"}},{"kind":"Field","name":{"kind":"Name","value":"subjectKind"}},{"kind":"Field","name":{"kind":"Name","value":"subjectId"}},{"kind":"Field","name":{"kind":"Name","value":"subjectName"}},{"kind":"Field","name":{"kind":"Name","value":"occurredAt"}},{"kind":"Field","name":{"kind":"Name","value":"metadata"}},{"kind":"Field","name":{"kind":"Name","value":"actor"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}}]} as unknown as DocumentNode<TimelineEventFieldsFragment, unknown>;
export const UserFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"roles"}},{"kind":"Field","name":{"kind":"Name","value":"active"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<UserFieldsFragment, unknown>;
export const WikiDocumentTreeFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WikiDocumentTreeFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WikiDocument"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"parentDocumentId"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"sortOrder"}},{"kind":"Field","name":{"kind":"Name","value":"childCount"}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<WikiDocumentTreeFieldsFragment, unknown>;
export const WikiDocumentLiteFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WikiDocumentLiteFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WikiDocument"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}}]}}]} as unknown as DocumentNode<WikiDocumentLiteFieldsFragment, unknown>;
export const WikiDocumentBacklinkFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WikiDocumentBacklinkFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WikiDocument"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"ancestors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}}]}}]}}]} as unknown as DocumentNode<WikiDocumentBacklinkFieldsFragment, unknown>;
export const WikiDocumentFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WikiDocumentFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WikiDocument"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"parentDocumentId"}},{"kind":"Field","name":{"kind":"Name","value":"ancestors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}}]}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"content"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"sortOrder"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"lastBackupAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<WikiDocumentFieldsFragment, unknown>;
export const WikiDocumentBackupListFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WikiDocumentBackupListFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WikiDocumentBackup"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"documentId"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"trigger"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"contentLength"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]} as unknown as DocumentNode<WikiDocumentBackupListFieldsFragment, unknown>;
export const WikiDocumentBackupDetailFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WikiDocumentBackupDetailFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WikiDocumentBackup"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"documentId"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"content"}},{"kind":"Field","name":{"kind":"Name","value":"contentLength"}},{"kind":"Field","name":{"kind":"Name","value":"trigger"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]} as unknown as DocumentNode<WikiDocumentBackupDetailFieldsFragment, unknown>;
export const WikiDocumentVisitListFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WikiDocumentVisitListFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WikiDocumentVisit"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"visitedAt"}},{"kind":"Field","name":{"kind":"Name","value":"document"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"ancestors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}}]}}]}}]}}]} as unknown as DocumentNode<WikiDocumentVisitListFieldsFragment, unknown>;
export const MyApiKeyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyAPIKey"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myAPIKey"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"APIKeyFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"APIKeyFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"APIKey"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"keyId"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}},{"kind":"Field","name":{"kind":"Name","value":"lastUsedAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<MyApiKeyQuery, MyApiKeyQueryVariables>;
export const CreateMyApiKeyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateMyAPIKey"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createMyAPIKey"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"apiKey"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"APIKeyFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"token"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"APIKeyFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"APIKey"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"keyId"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}},{"kind":"Field","name":{"kind":"Name","value":"lastUsedAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<CreateMyApiKeyMutation, CreateMyApiKeyMutationVariables>;
export const RegenerateMyApiKeyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RegenerateMyAPIKey"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"regenerateMyAPIKey"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"apiKey"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"APIKeyFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"token"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"APIKeyFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"APIKey"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"keyId"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}},{"kind":"Field","name":{"kind":"Name","value":"lastUsedAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<RegenerateMyApiKeyMutation, RegenerateMyApiKeyMutationVariables>;
export const SetMyApiKeyEnabledDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetMyAPIKeyEnabled"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"enabled"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setMyAPIKeyEnabled"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"enabled"},"value":{"kind":"Variable","name":{"kind":"Name","value":"enabled"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"APIKeyFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"APIKeyFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"APIKey"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"keyId"}},{"kind":"Field","name":{"kind":"Name","value":"enabled"}},{"kind":"Field","name":{"kind":"Name","value":"lastUsedAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<SetMyApiKeyEnabledMutation, SetMyApiKeyEnabledMutationVariables>;
export const DeleteMyApiKeyDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteMyAPIKey"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteMyAPIKey"}}]}}]} as unknown as DocumentNode<DeleteMyApiKeyMutation, DeleteMyApiKeyMutationVariables>;
export const CredentialDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Credential"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"credential"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialCommentFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CredentialComment"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"author"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Credential"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"password"}},{"kind":"Field","name":{"kind":"Name","value":"keys"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"content"}}]}},{"kind":"Field","name":{"kind":"Name","value":"properties"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}},{"kind":"Field","name":{"kind":"Name","value":"isValid"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"comments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialCommentFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"viewerCanModerateComments"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"backlinkCount"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<CredentialQuery, CredentialQueryVariables>;
export const CredentialsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Credentials"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"search"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"type"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"CredentialType"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"tags"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"validOnly"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"credentials"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"search"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}},{"kind":"Argument","name":{"kind":"Name","value":"type"},"value":{"kind":"Variable","name":{"kind":"Name","value":"type"}}},{"kind":"Argument","name":{"kind":"Name","value":"tags"},"value":{"kind":"Variable","name":{"kind":"Name","value":"tags"}}},{"kind":"Argument","name":{"kind":"Name","value":"validOnly"},"value":{"kind":"Variable","name":{"kind":"Name","value":"validOnly"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialCommentFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CredentialComment"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"author"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Credential"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"password"}},{"kind":"Field","name":{"kind":"Name","value":"keys"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"content"}}]}},{"kind":"Field","name":{"kind":"Name","value":"properties"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}},{"kind":"Field","name":{"kind":"Name","value":"isValid"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"comments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialCommentFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"viewerCanModerateComments"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"backlinkCount"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<CredentialsQuery, CredentialsQueryVariables>;
export const CredentialTagsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"CredentialTags"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"credentialTags"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}}]}]}}]} as unknown as DocumentNode<CredentialTagsQuery, CredentialTagsQueryVariables>;
export const CredentialSourceHashesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"CredentialSourceHashes"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"credential"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"sourceHashes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"status"}}]}}]}}]}}]} as unknown as DocumentNode<CredentialSourceHashesQuery, CredentialSourceHashesQueryVariables>;
export const CredentialBacklinksDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"CredentialBacklinks"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"credentialId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiDocumentsReferencingCredential"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"credentialId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"credentialId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"WikiDocumentBacklinkFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WikiDocumentBacklinkFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WikiDocument"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"ancestors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}}]}}]}}]} as unknown as DocumentNode<CredentialBacklinksQuery, CredentialBacklinksQueryVariables>;
export const MyCredentialsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyCredentials"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationIds"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"search"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"type"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"CredentialType"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"tags"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"validOnly"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myCredentials"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationIds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationIds"}}},{"kind":"Argument","name":{"kind":"Name","value":"search"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}},{"kind":"Argument","name":{"kind":"Name","value":"type"},"value":{"kind":"Variable","name":{"kind":"Name","value":"type"}}},{"kind":"Argument","name":{"kind":"Name","value":"tags"},"value":{"kind":"Variable","name":{"kind":"Name","value":"tags"}}},{"kind":"Argument","name":{"kind":"Name","value":"validOnly"},"value":{"kind":"Variable","name":{"kind":"Name","value":"validOnly"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialFieldsWithOperation"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialCommentFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CredentialComment"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"author"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Credential"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"password"}},{"kind":"Field","name":{"kind":"Name","value":"keys"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"content"}}]}},{"kind":"Field","name":{"kind":"Name","value":"properties"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}},{"kind":"Field","name":{"kind":"Name","value":"isValid"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"comments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialCommentFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"viewerCanModerateComments"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"backlinkCount"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialFieldsWithOperation"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Credential"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialFields"}},{"kind":"Field","name":{"kind":"Name","value":"operation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<MyCredentialsQuery, MyCredentialsQueryVariables>;
export const MyCredentialTagsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyCredentialTags"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationIds"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myCredentialTags"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationIds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationIds"}}}]}]}}]} as unknown as DocumentNode<MyCredentialTagsQuery, MyCredentialTagsQueryVariables>;
export const CreateCredentialDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateCredential"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateCredentialInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createCredential"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialCommentFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CredentialComment"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"author"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Credential"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"password"}},{"kind":"Field","name":{"kind":"Name","value":"keys"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"content"}}]}},{"kind":"Field","name":{"kind":"Name","value":"properties"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}},{"kind":"Field","name":{"kind":"Name","value":"isValid"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"comments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialCommentFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"viewerCanModerateComments"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"backlinkCount"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<CreateCredentialMutation, CreateCredentialMutationVariables>;
export const UpdateCredentialDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateCredential"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateCredentialInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateCredential"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialCommentFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CredentialComment"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"author"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Credential"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"password"}},{"kind":"Field","name":{"kind":"Name","value":"keys"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"content"}}]}},{"kind":"Field","name":{"kind":"Name","value":"properties"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}},{"kind":"Field","name":{"kind":"Name","value":"isValid"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"comments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialCommentFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"viewerCanModerateComments"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"backlinkCount"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<UpdateCredentialMutation, UpdateCredentialMutationVariables>;
export const DeleteCredentialDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteCredential"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteCredential"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<DeleteCredentialMutation, DeleteCredentialMutationVariables>;
export const AddCredentialCommentDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddCredentialComment"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"credentialId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"text"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"addCredentialComment"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"credentialId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"credentialId"}}},{"kind":"Argument","name":{"kind":"Name","value":"text"},"value":{"kind":"Variable","name":{"kind":"Name","value":"text"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialCommentFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CredentialComment"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"author"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Credential"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"password"}},{"kind":"Field","name":{"kind":"Name","value":"keys"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"content"}}]}},{"kind":"Field","name":{"kind":"Name","value":"properties"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}},{"kind":"Field","name":{"kind":"Name","value":"isValid"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"comments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialCommentFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"viewerCanModerateComments"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"backlinkCount"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<AddCredentialCommentMutation, AddCredentialCommentMutationVariables>;
export const UpdateCredentialCommentDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateCredentialComment"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"credentialId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"commentId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"text"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateCredentialComment"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"credentialId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"credentialId"}}},{"kind":"Argument","name":{"kind":"Name","value":"commentId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"commentId"}}},{"kind":"Argument","name":{"kind":"Name","value":"text"},"value":{"kind":"Variable","name":{"kind":"Name","value":"text"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialCommentFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CredentialComment"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"author"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Credential"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"password"}},{"kind":"Field","name":{"kind":"Name","value":"keys"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"content"}}]}},{"kind":"Field","name":{"kind":"Name","value":"properties"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}},{"kind":"Field","name":{"kind":"Name","value":"isValid"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"comments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialCommentFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"viewerCanModerateComments"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"backlinkCount"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<UpdateCredentialCommentMutation, UpdateCredentialCommentMutationVariables>;
export const DeleteCredentialCommentDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteCredentialComment"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"credentialId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"commentId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteCredentialComment"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"credentialId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"credentialId"}}},{"kind":"Argument","name":{"kind":"Name","value":"commentId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"commentId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialCommentFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CredentialComment"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"author"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Credential"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"password"}},{"kind":"Field","name":{"kind":"Name","value":"keys"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"content"}}]}},{"kind":"Field","name":{"kind":"Name","value":"properties"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}},{"kind":"Field","name":{"kind":"Name","value":"isValid"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"comments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialCommentFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"viewerCanModerateComments"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"backlinkCount"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<DeleteCredentialCommentMutation, DeleteCredentialCommentMutationVariables>;
export const CredentialChangedDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"CredentialChanged"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"credentialChanged"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"action"}},{"kind":"Field","name":{"kind":"Name","value":"credentialId"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"credential"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialCommentFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CredentialComment"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"author"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Credential"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"password"}},{"kind":"Field","name":{"kind":"Name","value":"keys"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"content"}}]}},{"kind":"Field","name":{"kind":"Name","value":"properties"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}},{"kind":"Field","name":{"kind":"Name","value":"isValid"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"comments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialCommentFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"viewerCanModerateComments"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"backlinkCount"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<CredentialChangedSubscription, CredentialChangedSubscriptionVariables>;
export const MyCredentialChangedDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"MyCredentialChanged"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationIds"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myCredentialChanged"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationIds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationIds"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"action"}},{"kind":"Field","name":{"kind":"Name","value":"credentialId"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"credential"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialFieldsWithOperation"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialCommentFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"CredentialComment"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"text"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"author"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Credential"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"password"}},{"kind":"Field","name":{"kind":"Name","value":"keys"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"content"}}]}},{"kind":"Field","name":{"kind":"Name","value":"properties"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"value"}}]}},{"kind":"Field","name":{"kind":"Name","value":"isValid"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"comments"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialCommentFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"viewerCanModerateComments"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"backlinkCount"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"CredentialFieldsWithOperation"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Credential"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"CredentialFields"}},{"kind":"Field","name":{"kind":"Name","value":"operation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<MyCredentialChangedSubscription, MyCredentialChangedSubscriptionVariables>;
export const HashDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Hash"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hash"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"HashFieldsWithCredential"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HashFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hash"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"credentialId"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HashFieldsWithCredential"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hash"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"HashFields"}},{"kind":"Field","name":{"kind":"Name","value":"credential"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}}]} as unknown as DocumentNode<HashQuery, HashQueryVariables>;
export const HashesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Hashes"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"search"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"statuses"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"HashStatus"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"tags"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"hasCredential"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hashes"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"search"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}},{"kind":"Argument","name":{"kind":"Name","value":"statuses"},"value":{"kind":"Variable","name":{"kind":"Name","value":"statuses"}}},{"kind":"Argument","name":{"kind":"Name","value":"tags"},"value":{"kind":"Variable","name":{"kind":"Name","value":"tags"}}},{"kind":"Argument","name":{"kind":"Name","value":"hasCredential"},"value":{"kind":"Variable","name":{"kind":"Name","value":"hasCredential"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"HashFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HashFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hash"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"credentialId"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<HashesQuery, HashesQueryVariables>;
export const HashTagsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"HashTags"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hashTags"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}}]}]}}]} as unknown as DocumentNode<HashTagsQuery, HashTagsQueryVariables>;
export const MyHashesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyHashes"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationIds"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"search"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"statuses"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"HashStatus"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"tags"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"hasCredential"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myHashes"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationIds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationIds"}}},{"kind":"Argument","name":{"kind":"Name","value":"search"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}},{"kind":"Argument","name":{"kind":"Name","value":"statuses"},"value":{"kind":"Variable","name":{"kind":"Name","value":"statuses"}}},{"kind":"Argument","name":{"kind":"Name","value":"tags"},"value":{"kind":"Variable","name":{"kind":"Name","value":"tags"}}},{"kind":"Argument","name":{"kind":"Name","value":"hasCredential"},"value":{"kind":"Variable","name":{"kind":"Name","value":"hasCredential"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"HashFieldsWithOperation"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HashFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hash"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"credentialId"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HashFieldsWithOperation"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hash"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"HashFields"}},{"kind":"Field","name":{"kind":"Name","value":"operation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<MyHashesQuery, MyHashesQueryVariables>;
export const MyHashTagsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyHashTags"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationIds"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myHashTags"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationIds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationIds"}}}]}]}}]} as unknown as DocumentNode<MyHashTagsQuery, MyHashTagsQueryVariables>;
export const CreateHashDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateHash"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateHashInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createHash"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"HashFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HashFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hash"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"credentialId"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<CreateHashMutation, CreateHashMutationVariables>;
export const UpdateHashDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateHash"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateHashInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateHash"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"HashFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HashFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hash"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"credentialId"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<UpdateHashMutation, UpdateHashMutationVariables>;
export const DeleteHashDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteHash"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteHash"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<DeleteHashMutation, DeleteHashMutationVariables>;
export const BulkImportHashesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"BulkImportHashes"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"BulkImportHashesInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"bulkImportHashes"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"added"}},{"kind":"Field","name":{"kind":"Name","value":"skipped"}},{"kind":"Field","name":{"kind":"Name","value":"hashes"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"HashFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HashFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hash"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"credentialId"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<BulkImportHashesMutation, BulkImportHashesMutationVariables>;
export const MarkHashCrackedDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"MarkHashCracked"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"MarkHashCrackedInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"markHashCracked"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"HashFieldsWithCredential"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HashFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hash"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"credentialId"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HashFieldsWithCredential"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hash"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"HashFields"}},{"kind":"Field","name":{"kind":"Name","value":"credential"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}}]} as unknown as DocumentNode<MarkHashCrackedMutation, MarkHashCrackedMutationVariables>;
export const HashChangedDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"HashChanged"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hashChanged"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"action"}},{"kind":"Field","name":{"kind":"Name","value":"hashId"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"hash"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"HashFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HashFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hash"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"credentialId"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<HashChangedSubscription, HashChangedSubscriptionVariables>;
export const MyHashChangedDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"MyHashChanged"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationIds"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myHashChanged"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationIds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationIds"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"action"}},{"kind":"Field","name":{"kind":"Name","value":"hashId"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"hash"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"HashFieldsWithOperation"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HashFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hash"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"value"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"comment"}},{"kind":"Field","name":{"kind":"Name","value":"tags"}},{"kind":"Field","name":{"kind":"Name","value":"credentialId"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"HashFieldsWithOperation"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Hash"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"HashFields"}},{"kind":"Field","name":{"kind":"Name","value":"operation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}}]}}]}}]} as unknown as DocumentNode<MyHashChangedSubscription, MyHashChangedSubscriptionVariables>;
export const OperationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Operation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"operation"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"OperationFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"OperationMemberFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"OperationMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"roles"}},{"kind":"Field","name":{"kind":"Name","value":"active"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"role"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"OperationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Operation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"members"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"OperationMemberFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<OperationQuery, OperationQueryVariables>;
export const OperationsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Operations"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"search"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"operations"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"search"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"OperationFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"hasPreviousPage"}},{"kind":"Field","name":{"kind":"Name","value":"startCursor"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"OperationMemberFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"OperationMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"roles"}},{"kind":"Field","name":{"kind":"Name","value":"active"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"role"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"OperationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Operation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"members"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"OperationMemberFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<OperationsQuery, OperationsQueryVariables>;
export const MyOperationRoleDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyOperationRole"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myOperationRole"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}}]}]}}]} as unknown as DocumentNode<MyOperationRoleQuery, MyOperationRoleQueryVariables>;
export const CreateOperationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateOperation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateOperationInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createOperation"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"OperationFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"OperationMemberFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"OperationMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"roles"}},{"kind":"Field","name":{"kind":"Name","value":"active"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"role"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"OperationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Operation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"members"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"OperationMemberFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<CreateOperationMutation, CreateOperationMutationVariables>;
export const UpdateOperationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateOperation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateOperationInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateOperation"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"OperationFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"OperationMemberFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"OperationMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"roles"}},{"kind":"Field","name":{"kind":"Name","value":"active"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"role"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"OperationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Operation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"members"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"OperationMemberFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<UpdateOperationMutation, UpdateOperationMutationVariables>;
export const DeleteOperationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteOperation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteOperation"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<DeleteOperationMutation, DeleteOperationMutationVariables>;
export const AddOperationMemberDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddOperationMember"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"role"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"OperationRole"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"addOperationMember"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}},{"kind":"Argument","name":{"kind":"Name","value":"role"},"value":{"kind":"Variable","name":{"kind":"Name","value":"role"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"OperationFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"OperationMemberFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"OperationMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"roles"}},{"kind":"Field","name":{"kind":"Name","value":"active"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"role"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"OperationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Operation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"members"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"OperationMemberFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<AddOperationMemberMutation, AddOperationMemberMutationVariables>;
export const RemoveOperationMemberDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RemoveOperationMember"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"removeOperationMember"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"OperationFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"OperationMemberFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"OperationMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"roles"}},{"kind":"Field","name":{"kind":"Name","value":"active"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"role"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"OperationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Operation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"members"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"OperationMemberFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<RemoveOperationMemberMutation, RemoveOperationMemberMutationVariables>;
export const UpdateOperationMemberRoleDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateOperationMemberRole"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"role"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"OperationRole"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateOperationMemberRole"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}},{"kind":"Argument","name":{"kind":"Name","value":"role"},"value":{"kind":"Variable","name":{"kind":"Name","value":"role"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"OperationFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"OperationMemberFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"OperationMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"roles"}},{"kind":"Field","name":{"kind":"Name","value":"active"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"role"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"OperationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Operation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"members"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"OperationMemberFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<UpdateOperationMemberRoleMutation, UpdateOperationMemberRoleMutationVariables>;
export const UserSuggestionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"UserSuggestions"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"search"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userSuggestions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"search"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}}]} as unknown as DocumentNode<UserSuggestionsQuery, UserSuggestionsQueryVariables>;
export const OperationChangedDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"OperationChanged"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"operationChanged"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"action"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"operation"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"OperationFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"OperationMemberFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"OperationMember"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"roles"}},{"kind":"Field","name":{"kind":"Name","value":"active"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"role"}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"OperationFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Operation"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"members"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"OperationMemberFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<OperationChangedSubscription, OperationChangedSubscriptionVariables>;
export const OperationMemberChangedDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"OperationMemberChanged"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"operationMemberChanged"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"action"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}}]}}]}}]} as unknown as DocumentNode<OperationMemberChangedSubscription, OperationMemberChangedSubscriptionVariables>;
export const MySessionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MySessions"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"activeOnly"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"mySessions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"activeOnly"},"value":{"kind":"Variable","name":{"kind":"Name","value":"activeOnly"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"SessionFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"hasPreviousPage"}},{"kind":"Field","name":{"kind":"Name","value":"startCursor"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"SessionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Session"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"ipAddress"}},{"kind":"Field","name":{"kind":"Name","value":"userAgent"}},{"kind":"Field","name":{"kind":"Name","value":"browser"}},{"kind":"Field","name":{"kind":"Name","value":"os"}},{"kind":"Field","name":{"kind":"Name","value":"device"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"lastActivityAt"}},{"kind":"Field","name":{"kind":"Name","value":"isCurrent"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<MySessionsQuery, MySessionsQueryVariables>;
export const SessionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Sessions"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"search"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"activeOnly"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sessions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}},{"kind":"Argument","name":{"kind":"Name","value":"search"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}},{"kind":"Argument","name":{"kind":"Name","value":"activeOnly"},"value":{"kind":"Variable","name":{"kind":"Name","value":"activeOnly"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"SessionFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"hasPreviousPage"}},{"kind":"Field","name":{"kind":"Name","value":"startCursor"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"SessionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Session"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"ipAddress"}},{"kind":"Field","name":{"kind":"Name","value":"userAgent"}},{"kind":"Field","name":{"kind":"Name","value":"browser"}},{"kind":"Field","name":{"kind":"Name","value":"os"}},{"kind":"Field","name":{"kind":"Name","value":"device"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"lastActivityAt"}},{"kind":"Field","name":{"kind":"Name","value":"isCurrent"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<SessionsQuery, SessionsQueryVariables>;
export const SessionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Session"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"session"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"SessionFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"SessionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Session"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"ipAddress"}},{"kind":"Field","name":{"kind":"Name","value":"userAgent"}},{"kind":"Field","name":{"kind":"Name","value":"browser"}},{"kind":"Field","name":{"kind":"Name","value":"os"}},{"kind":"Field","name":{"kind":"Name","value":"device"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"lastActivityAt"}},{"kind":"Field","name":{"kind":"Name","value":"isCurrent"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<SessionQuery, SessionQueryVariables>;
export const RevokeSessionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RevokeSession"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"revokeSession"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<RevokeSessionMutation, RevokeSessionMutationVariables>;
export const RevokeAllMySessionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RevokeAllMySessions"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"revokeAllMySessions"}}]}}]} as unknown as DocumentNode<RevokeAllMySessionsMutation, RevokeAllMySessionsMutationVariables>;
export const AdminRevokeSessionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AdminRevokeSession"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"adminRevokeSession"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<AdminRevokeSessionMutation, AdminRevokeSessionMutationVariables>;
export const AdminRevokeAllUserSessionsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AdminRevokeAllUserSessions"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"adminRevokeAllUserSessions"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}]}]}}]} as unknown as DocumentNode<AdminRevokeAllUserSessionsMutation, AdminRevokeAllUserSessionsMutationVariables>;
export const MySessionChangedDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"MySessionChanged"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"mySessionChanged"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"action"}},{"kind":"Field","name":{"kind":"Name","value":"sessionId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"session"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"SessionFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"SessionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Session"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"ipAddress"}},{"kind":"Field","name":{"kind":"Name","value":"userAgent"}},{"kind":"Field","name":{"kind":"Name","value":"browser"}},{"kind":"Field","name":{"kind":"Name","value":"os"}},{"kind":"Field","name":{"kind":"Name","value":"device"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"lastActivityAt"}},{"kind":"Field","name":{"kind":"Name","value":"isCurrent"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<MySessionChangedSubscription, MySessionChangedSubscriptionVariables>;
export const SessionChangedDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"SessionChanged"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"userId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"sessionChanged"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"userId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"userId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"action"}},{"kind":"Field","name":{"kind":"Name","value":"sessionId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"session"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"SessionFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"SessionFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Session"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"ipAddress"}},{"kind":"Field","name":{"kind":"Name","value":"userAgent"}},{"kind":"Field","name":{"kind":"Name","value":"browser"}},{"kind":"Field","name":{"kind":"Name","value":"os"}},{"kind":"Field","name":{"kind":"Name","value":"device"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"lastActivityAt"}},{"kind":"Field","name":{"kind":"Name","value":"isCurrent"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<SessionChangedSubscription, SessionChangedSubscriptionVariables>;
export const TaskDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Task"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"task"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"riskScore"}},{"kind":"Field","name":{"kind":"Name","value":"riskDescription"}},{"kind":"Field","name":{"kind":"Name","value":"profitScore"}},{"kind":"Field","name":{"kind":"Name","value":"profitDescription"}},{"kind":"Field","name":{"kind":"Name","value":"stage"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"assignees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"wikiReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}}]}},{"kind":"Field","name":{"kind":"Name","value":"credentialReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"doneAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<TaskQuery, TaskQueryVariables>;
export const TasksDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Tasks"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"stage"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"TaskStage"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"excludeStages"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"TaskStage"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"riskScoreMin"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"riskScoreMax"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"profitScoreMin"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"profitScoreMax"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"search"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"tasks"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"stage"},"value":{"kind":"Variable","name":{"kind":"Name","value":"stage"}}},{"kind":"Argument","name":{"kind":"Name","value":"excludeStages"},"value":{"kind":"Variable","name":{"kind":"Name","value":"excludeStages"}}},{"kind":"Argument","name":{"kind":"Name","value":"riskScoreMin"},"value":{"kind":"Variable","name":{"kind":"Name","value":"riskScoreMin"}}},{"kind":"Argument","name":{"kind":"Name","value":"riskScoreMax"},"value":{"kind":"Variable","name":{"kind":"Name","value":"riskScoreMax"}}},{"kind":"Argument","name":{"kind":"Name","value":"profitScoreMin"},"value":{"kind":"Variable","name":{"kind":"Name","value":"profitScoreMin"}}},{"kind":"Argument","name":{"kind":"Name","value":"profitScoreMax"},"value":{"kind":"Variable","name":{"kind":"Name","value":"profitScoreMax"}}},{"kind":"Argument","name":{"kind":"Name","value":"search"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"riskScore"}},{"kind":"Field","name":{"kind":"Name","value":"riskDescription"}},{"kind":"Field","name":{"kind":"Name","value":"profitScore"}},{"kind":"Field","name":{"kind":"Name","value":"profitDescription"}},{"kind":"Field","name":{"kind":"Name","value":"stage"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"assignees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"wikiReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}}]}},{"kind":"Field","name":{"kind":"Name","value":"credentialReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"doneAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<TasksQuery, TasksQueryVariables>;
export const TaskTrashDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"TaskTrash"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"taskTrash"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"riskScore"}},{"kind":"Field","name":{"kind":"Name","value":"riskDescription"}},{"kind":"Field","name":{"kind":"Name","value":"profitScore"}},{"kind":"Field","name":{"kind":"Name","value":"profitDescription"}},{"kind":"Field","name":{"kind":"Name","value":"stage"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"assignees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"wikiReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}}]}},{"kind":"Field","name":{"kind":"Name","value":"credentialReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"doneAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<TaskTrashQuery, TaskTrashQueryVariables>;
export const TasksReferencingWikiDocumentDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"TasksReferencingWikiDocument"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"documentId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"tasksReferencingWikiDocument"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"documentId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"documentId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskBacklinkFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskBacklinkFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"stage"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"riskScore"}},{"kind":"Field","name":{"kind":"Name","value":"profitScore"}},{"kind":"Field","name":{"kind":"Name","value":"assignees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}}]} as unknown as DocumentNode<TasksReferencingWikiDocumentQuery, TasksReferencingWikiDocumentQueryVariables>;
export const TasksReferencingCredentialDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"TasksReferencingCredential"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"credentialId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"tasksReferencingCredential"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"credentialId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"credentialId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskBacklinkFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskBacklinkFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"stage"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"riskScore"}},{"kind":"Field","name":{"kind":"Name","value":"profitScore"}},{"kind":"Field","name":{"kind":"Name","value":"assignees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}}]} as unknown as DocumentNode<TasksReferencingCredentialQuery, TasksReferencingCredentialQueryVariables>;
export const CreateTaskDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateTask"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateTaskInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createTask"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"riskScore"}},{"kind":"Field","name":{"kind":"Name","value":"riskDescription"}},{"kind":"Field","name":{"kind":"Name","value":"profitScore"}},{"kind":"Field","name":{"kind":"Name","value":"profitDescription"}},{"kind":"Field","name":{"kind":"Name","value":"stage"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"assignees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"wikiReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}}]}},{"kind":"Field","name":{"kind":"Name","value":"credentialReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"doneAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<CreateTaskMutation, CreateTaskMutationVariables>;
export const UpdateTaskDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateTask"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateTaskInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateTask"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"riskScore"}},{"kind":"Field","name":{"kind":"Name","value":"riskDescription"}},{"kind":"Field","name":{"kind":"Name","value":"profitScore"}},{"kind":"Field","name":{"kind":"Name","value":"profitDescription"}},{"kind":"Field","name":{"kind":"Name","value":"stage"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"assignees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"wikiReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}}]}},{"kind":"Field","name":{"kind":"Name","value":"credentialReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"doneAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<UpdateTaskMutation, UpdateTaskMutationVariables>;
export const ChangeTaskStageDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ChangeTaskStage"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ChangeTaskStageInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"changeTaskStage"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"riskScore"}},{"kind":"Field","name":{"kind":"Name","value":"riskDescription"}},{"kind":"Field","name":{"kind":"Name","value":"profitScore"}},{"kind":"Field","name":{"kind":"Name","value":"profitDescription"}},{"kind":"Field","name":{"kind":"Name","value":"stage"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"assignees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"wikiReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}}]}},{"kind":"Field","name":{"kind":"Name","value":"credentialReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"doneAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<ChangeTaskStageMutation, ChangeTaskStageMutationVariables>;
export const SetTaskAssigneesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetTaskAssignees"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"taskId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"assigneeIds"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setTaskAssignees"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"taskId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"taskId"}}},{"kind":"Argument","name":{"kind":"Name","value":"assigneeIds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"assigneeIds"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"riskScore"}},{"kind":"Field","name":{"kind":"Name","value":"riskDescription"}},{"kind":"Field","name":{"kind":"Name","value":"profitScore"}},{"kind":"Field","name":{"kind":"Name","value":"profitDescription"}},{"kind":"Field","name":{"kind":"Name","value":"stage"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"assignees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"wikiReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}}]}},{"kind":"Field","name":{"kind":"Name","value":"credentialReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"doneAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<SetTaskAssigneesMutation, SetTaskAssigneesMutationVariables>;
export const SetTaskWikiReferencesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetTaskWikiReferences"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"taskId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"wikiIds"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setTaskWikiReferences"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"taskId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"taskId"}}},{"kind":"Argument","name":{"kind":"Name","value":"wikiIds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"wikiIds"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"riskScore"}},{"kind":"Field","name":{"kind":"Name","value":"riskDescription"}},{"kind":"Field","name":{"kind":"Name","value":"profitScore"}},{"kind":"Field","name":{"kind":"Name","value":"profitDescription"}},{"kind":"Field","name":{"kind":"Name","value":"stage"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"assignees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"wikiReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}}]}},{"kind":"Field","name":{"kind":"Name","value":"credentialReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"doneAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<SetTaskWikiReferencesMutation, SetTaskWikiReferencesMutationVariables>;
export const AddTaskWikiReferenceDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AddTaskWikiReference"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"taskId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"wikiId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"addTaskWikiReference"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"taskId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"taskId"}}},{"kind":"Argument","name":{"kind":"Name","value":"wikiId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"wikiId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"riskScore"}},{"kind":"Field","name":{"kind":"Name","value":"riskDescription"}},{"kind":"Field","name":{"kind":"Name","value":"profitScore"}},{"kind":"Field","name":{"kind":"Name","value":"profitDescription"}},{"kind":"Field","name":{"kind":"Name","value":"stage"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"assignees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"wikiReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}}]}},{"kind":"Field","name":{"kind":"Name","value":"credentialReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"doneAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<AddTaskWikiReferenceMutation, AddTaskWikiReferenceMutationVariables>;
export const SetTaskCredentialReferencesDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetTaskCredentialReferences"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"taskId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"credentialIds"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setTaskCredentialReferences"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"taskId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"taskId"}}},{"kind":"Argument","name":{"kind":"Name","value":"credentialIds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"credentialIds"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"riskScore"}},{"kind":"Field","name":{"kind":"Name","value":"riskDescription"}},{"kind":"Field","name":{"kind":"Name","value":"profitScore"}},{"kind":"Field","name":{"kind":"Name","value":"profitDescription"}},{"kind":"Field","name":{"kind":"Name","value":"stage"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"assignees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"wikiReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}}]}},{"kind":"Field","name":{"kind":"Name","value":"credentialReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"doneAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<SetTaskCredentialReferencesMutation, SetTaskCredentialReferencesMutationVariables>;
export const DeleteTaskDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteTask"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteTask"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<DeleteTaskMutation, DeleteTaskMutationVariables>;
export const RestoreTaskDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RestoreTask"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"restoreTask"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"riskScore"}},{"kind":"Field","name":{"kind":"Name","value":"riskDescription"}},{"kind":"Field","name":{"kind":"Name","value":"profitScore"}},{"kind":"Field","name":{"kind":"Name","value":"profitDescription"}},{"kind":"Field","name":{"kind":"Name","value":"stage"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"assignees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"wikiReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}}]}},{"kind":"Field","name":{"kind":"Name","value":"credentialReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"doneAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<RestoreTaskMutation, RestoreTaskMutationVariables>;
export const PurgeTaskDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"PurgeTask"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"purgeTask"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<PurgeTaskMutation, PurgeTaskMutationVariables>;
export const TaskChangedDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"TaskChanged"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"taskChanged"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"action"}},{"kind":"Field","name":{"kind":"Name","value":"taskId"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"task"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TaskFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TaskFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"Task"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"riskScore"}},{"kind":"Field","name":{"kind":"Name","value":"riskDescription"}},{"kind":"Field","name":{"kind":"Name","value":"profitScore"}},{"kind":"Field","name":{"kind":"Name","value":"profitDescription"}},{"kind":"Field","name":{"kind":"Name","value":"stage"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"assignees"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"wikiReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}}]}},{"kind":"Field","name":{"kind":"Name","value":"credentialReferences"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"name"}},{"kind":"Field","name":{"kind":"Name","value":"type"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"doneAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<TaskChangedSubscription, TaskChangedSubscriptionVariables>;
export const TimelineBucketsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"TimelineBuckets"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"granularity"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineGranularity"}},"defaultValue":{"kind":"EnumValue","value":"DAY"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"timezone"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"from"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"to"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"types"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"actorIds"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"timelineBuckets"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"granularity"},"value":{"kind":"Variable","name":{"kind":"Name","value":"granularity"}}},{"kind":"Argument","name":{"kind":"Name","value":"timezone"},"value":{"kind":"Variable","name":{"kind":"Name","value":"timezone"}}},{"kind":"Argument","name":{"kind":"Name","value":"from"},"value":{"kind":"Variable","name":{"kind":"Name","value":"from"}}},{"kind":"Argument","name":{"kind":"Name","value":"to"},"value":{"kind":"Variable","name":{"kind":"Name","value":"to"}}},{"kind":"Argument","name":{"kind":"Name","value":"types"},"value":{"kind":"Variable","name":{"kind":"Name","value":"types"}}},{"kind":"Argument","name":{"kind":"Name","value":"actorIds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"actorIds"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"bucketStart"}},{"kind":"Field","name":{"kind":"Name","value":"count"}},{"kind":"Field","name":{"kind":"Name","value":"topicCounts"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"topic"}},{"kind":"Field","name":{"kind":"Name","value":"subjectKind"}},{"kind":"Field","name":{"kind":"Name","value":"count"}}]}}]}}]}}]} as unknown as DocumentNode<TimelineBucketsQuery, TimelineBucketsQueryVariables>;
export const TimelineEventsByDayDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"TimelineEventsByDay"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"date"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"timezone"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"granularity"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineGranularity"}},"defaultValue":{"kind":"EnumValue","value":"DAY"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"types"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"actorIds"}},"type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}},"defaultValue":{"kind":"IntValue","value":"100"}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"timelineEventsByDay"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"date"},"value":{"kind":"Variable","name":{"kind":"Name","value":"date"}}},{"kind":"Argument","name":{"kind":"Name","value":"timezone"},"value":{"kind":"Variable","name":{"kind":"Name","value":"timezone"}}},{"kind":"Argument","name":{"kind":"Name","value":"granularity"},"value":{"kind":"Variable","name":{"kind":"Name","value":"granularity"}}},{"kind":"Argument","name":{"kind":"Name","value":"types"},"value":{"kind":"Variable","name":{"kind":"Name","value":"types"}}},{"kind":"Argument","name":{"kind":"Name","value":"actorIds"},"value":{"kind":"Variable","name":{"kind":"Name","value":"actorIds"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TimelineEventFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"hasPreviousPage"}},{"kind":"Field","name":{"kind":"Name","value":"startCursor"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TimelineEventFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineEvent"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"topic"}},{"kind":"Field","name":{"kind":"Name","value":"subjectKind"}},{"kind":"Field","name":{"kind":"Name","value":"subjectId"}},{"kind":"Field","name":{"kind":"Name","value":"subjectName"}},{"kind":"Field","name":{"kind":"Name","value":"occurredAt"}},{"kind":"Field","name":{"kind":"Name","value":"metadata"}},{"kind":"Field","name":{"kind":"Name","value":"actor"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}}]} as unknown as DocumentNode<TimelineEventsByDayQuery, TimelineEventsByDayQueryVariables>;
export const TimelineEventAddedDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"TimelineEventAdded"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"timelineEventAdded"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TimelineEventFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TimelineEventFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineEvent"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"topic"}},{"kind":"Field","name":{"kind":"Name","value":"subjectKind"}},{"kind":"Field","name":{"kind":"Name","value":"subjectId"}},{"kind":"Field","name":{"kind":"Name","value":"subjectName"}},{"kind":"Field","name":{"kind":"Name","value":"occurredAt"}},{"kind":"Field","name":{"kind":"Name","value":"metadata"}},{"kind":"Field","name":{"kind":"Name","value":"actor"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}}]} as unknown as DocumentNode<TimelineEventAddedSubscription, TimelineEventAddedSubscriptionVariables>;
export const CreateCustomTimelineEventDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateCustomTimelineEvent"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateCustomTimelineEventInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createCustomTimelineEvent"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TimelineEventFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TimelineEventFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineEvent"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"topic"}},{"kind":"Field","name":{"kind":"Name","value":"subjectKind"}},{"kind":"Field","name":{"kind":"Name","value":"subjectId"}},{"kind":"Field","name":{"kind":"Name","value":"subjectName"}},{"kind":"Field","name":{"kind":"Name","value":"occurredAt"}},{"kind":"Field","name":{"kind":"Name","value":"metadata"}},{"kind":"Field","name":{"kind":"Name","value":"actor"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}}]} as unknown as DocumentNode<CreateCustomTimelineEventMutation, CreateCustomTimelineEventMutationVariables>;
export const UpdateCustomTimelineEventDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateCustomTimelineEvent"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateCustomTimelineEventInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateCustomTimelineEvent"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"TimelineEventFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"TimelineEventFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"TimelineEvent"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"topic"}},{"kind":"Field","name":{"kind":"Name","value":"subjectKind"}},{"kind":"Field","name":{"kind":"Name","value":"subjectId"}},{"kind":"Field","name":{"kind":"Name","value":"subjectName"}},{"kind":"Field","name":{"kind":"Name","value":"occurredAt"}},{"kind":"Field","name":{"kind":"Name","value":"metadata"}},{"kind":"Field","name":{"kind":"Name","value":"actor"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}}]} as unknown as DocumentNode<UpdateCustomTimelineEventMutation, UpdateCustomTimelineEventMutationVariables>;
export const DeleteCustomTimelineEventDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteCustomTimelineEvent"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteCustomTimelineEvent"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<DeleteCustomTimelineEventMutation, DeleteCustomTimelineEventMutationVariables>;
export const MeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"UserFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"roles"}},{"kind":"Field","name":{"kind":"Name","value":"active"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<MeQuery, MeQueryVariables>;
export const UserDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"User"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"UserFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"roles"}},{"kind":"Field","name":{"kind":"Name","value":"active"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<UserQuery, UserQueryVariables>;
export const UsersDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Users"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"search"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"users"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"search"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"UserFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"hasPreviousPage"}},{"kind":"Field","name":{"kind":"Name","value":"startCursor"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"roles"}},{"kind":"Field","name":{"kind":"Name","value":"active"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<UsersQuery, UsersQueryVariables>;
export const CreateUserDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateUser"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateUserInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createUser"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"UserFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"roles"}},{"kind":"Field","name":{"kind":"Name","value":"active"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<CreateUserMutation, CreateUserMutationVariables>;
export const UpdateUserDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateUser"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateUserInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateUser"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"UserFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"roles"}},{"kind":"Field","name":{"kind":"Name","value":"active"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<UpdateUserMutation, UpdateUserMutationVariables>;
export const DeleteUserDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteUser"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteUser"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<DeleteUserMutation, DeleteUserMutationVariables>;
export const UpdateOwnProfileDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateOwnProfile"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateUserInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateOwnProfile"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"UserFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"roles"}},{"kind":"Field","name":{"kind":"Name","value":"active"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<UpdateOwnProfileMutation, UpdateOwnProfileMutationVariables>;
export const UserChangedDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"UserChanged"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userChanged"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"action"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"UserFields"}}]}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"UserFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"User"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"roles"}},{"kind":"Field","name":{"kind":"Name","value":"active"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<UserChangedSubscription, UserChangedSubscriptionVariables>;
export const WikiDocumentTreeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WikiDocumentTree"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiDocumentTree"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"WikiDocumentTreeFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WikiDocumentTreeFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WikiDocument"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"parentDocumentId"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"sortOrder"}},{"kind":"Field","name":{"kind":"Name","value":"childCount"}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<WikiDocumentTreeQuery, WikiDocumentTreeQueryVariables>;
export const WikiDocumentChildrenDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WikiDocumentChildren"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"parentDocumentId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiDocumentChildren"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"parentDocumentId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"parentDocumentId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"WikiDocumentTreeFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WikiDocumentTreeFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WikiDocument"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"parentDocumentId"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"sortOrder"}},{"kind":"Field","name":{"kind":"Name","value":"childCount"}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<WikiDocumentChildrenQuery, WikiDocumentChildrenQueryVariables>;
export const WikiDocumentTreeRevealPathDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WikiDocumentTreeRevealPath"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"documentId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiDocumentTreeRevealPath"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"documentId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"documentId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"WikiDocumentTreeFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WikiDocumentTreeFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WikiDocument"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"parentDocumentId"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"sortOrder"}},{"kind":"Field","name":{"kind":"Name","value":"childCount"}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<WikiDocumentTreeRevealPathQuery, WikiDocumentTreeRevealPathQueryVariables>;
export const WikiDocumentTrashCountDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WikiDocumentTrashCount"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiDocumentTrashCount"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}}]}]}}]} as unknown as DocumentNode<WikiDocumentTrashCountQuery, WikiDocumentTrashCountQueryVariables>;
export const WikiDocumentDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WikiDocument"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiDocument"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"WikiDocumentFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WikiDocumentFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WikiDocument"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"parentDocumentId"}},{"kind":"Field","name":{"kind":"Name","value":"ancestors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}}]}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"content"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"sortOrder"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"lastBackupAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]} as unknown as DocumentNode<WikiDocumentQuery, WikiDocumentQueryVariables>;
export const WikiDocumentsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WikiDocuments"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"parentDocumentId"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"search"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiDocuments"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"parentDocumentId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"parentDocumentId"}}},{"kind":"Argument","name":{"kind":"Name","value":"search"},"value":{"kind":"Variable","name":{"kind":"Name","value":"search"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"parentDocumentId"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"sortOrder"}},{"kind":"Field","name":{"kind":"Name","value":"ancestors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}}]} as unknown as DocumentNode<WikiDocumentsQuery, WikiDocumentsQueryVariables>;
export const WikiRecentDocumentsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WikiRecentDocuments"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"sort"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"WikiDocumentSort"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiDocuments"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"sort"},"value":{"kind":"Variable","name":{"kind":"Name","value":"sort"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"parentDocumentId"}},{"kind":"Field","name":{"kind":"Name","value":"ancestors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"lastUpdatedBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"cursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}}]} as unknown as DocumentNode<WikiRecentDocumentsQuery, WikiRecentDocumentsQueryVariables>;
export const WikiSearchDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WikiSearch"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"scope"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"query"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiSearch"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"scope"},"value":{"kind":"Variable","name":{"kind":"Name","value":"scope"}}},{"kind":"Argument","name":{"kind":"Name","value":"query"},"value":{"kind":"Variable","name":{"kind":"Name","value":"query"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hits"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"document"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"parentDocumentId"}},{"kind":"Field","name":{"kind":"Name","value":"ancestors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"snippet"}},{"kind":"Field","name":{"kind":"Name","value":"matchRanges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"start"}},{"kind":"Field","name":{"kind":"Name","value":"end"}}]}},{"kind":"Field","name":{"kind":"Name","value":"score"}}]}},{"kind":"Field","name":{"kind":"Name","value":"total"}},{"kind":"Field","name":{"kind":"Name","value":"hasMore"}}]}}]}}]} as unknown as DocumentNode<WikiSearchQuery, WikiSearchQueryVariables>;
export const WikiDocumentLiteDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WikiDocumentLite"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiDocument"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"WikiDocumentLiteFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WikiDocumentLiteFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WikiDocument"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}}]}}]} as unknown as DocumentNode<WikiDocumentLiteQuery, WikiDocumentLiteQueryVariables>;
export const WikiDocumentBacklinksDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WikiDocumentBacklinks"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"documentId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiDocumentBacklinks"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"documentId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"documentId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"WikiDocumentBacklinkFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WikiDocumentBacklinkFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WikiDocument"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"ancestors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}}]}}]}}]} as unknown as DocumentNode<WikiDocumentBacklinksQuery, WikiDocumentBacklinksQueryVariables>;
export const WikiDocumentTrashDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WikiDocumentTrash"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiDocumentTrash"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"deletedBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"ancestors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"cursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}}]} as unknown as DocumentNode<WikiDocumentTrashQuery, WikiDocumentTrashQueryVariables>;
export const WikiDocumentBackupsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WikiDocumentBackups"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"documentId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"first"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"after"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiDocumentBackups"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"documentId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"documentId"}}},{"kind":"Argument","name":{"kind":"Name","value":"first"},"value":{"kind":"Variable","name":{"kind":"Name","value":"first"}}},{"kind":"Argument","name":{"kind":"Name","value":"after"},"value":{"kind":"Variable","name":{"kind":"Name","value":"after"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"WikiDocumentBackupListFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"cursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"pageInfo"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"hasNextPage"}},{"kind":"Field","name":{"kind":"Name","value":"endCursor"}}]}},{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WikiDocumentBackupListFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WikiDocumentBackup"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"documentId"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"trigger"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"contentLength"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]} as unknown as DocumentNode<WikiDocumentBackupsQuery, WikiDocumentBackupsQueryVariables>;
export const WikiDocumentBackupDetailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WikiDocumentBackupDetail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiDocumentBackup"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"WikiDocumentBackupDetailFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WikiDocumentBackupDetailFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WikiDocumentBackup"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"documentId"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"content"}},{"kind":"Field","name":{"kind":"Name","value":"contentLength"}},{"kind":"Field","name":{"kind":"Name","value":"trigger"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]} as unknown as DocumentNode<WikiDocumentBackupDetailQuery, WikiDocumentBackupDetailQueryVariables>;
export const WikiDocumentPresenceDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WikiDocumentPresence"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"documentId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiDocumentPresence"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"documentId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"documentId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"documentId"}},{"kind":"Field","name":{"kind":"Name","value":"activeEditors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"connectedAt"}}]}}]}}]}}]} as unknown as DocumentNode<WikiDocumentPresenceQuery, WikiDocumentPresenceQueryVariables>;
export const WikiOperationPresenceDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WikiOperationPresence"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiOperationPresence"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"documentId"}},{"kind":"Field","name":{"kind":"Name","value":"activeEditors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"connectedAt"}}]}}]}}]}}]} as unknown as DocumentNode<WikiOperationPresenceQuery, WikiOperationPresenceQueryVariables>;
export const WikiDocumentHistoryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WikiDocumentHistory"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"offset"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"limit"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiDocumentHistory"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"offset"},"value":{"kind":"Variable","name":{"kind":"Name","value":"offset"}}},{"kind":"Argument","name":{"kind":"Name","value":"limit"},"value":{"kind":"Variable","name":{"kind":"Name","value":"limit"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"edges"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"node"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"WikiDocumentVisitListFields"}}]}}]}},{"kind":"Field","name":{"kind":"Name","value":"totalCount"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"WikiDocumentVisitListFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"WikiDocumentVisit"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"visitedAt"}},{"kind":"Field","name":{"kind":"Name","value":"document"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"ancestors"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}}]}}]}}]}}]} as unknown as DocumentNode<WikiDocumentHistoryQuery, WikiDocumentHistoryQueryVariables>;
export const CreateWikiDocumentDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateWikiDocument"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"CreateWikiDocumentInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createWikiDocument"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"sortOrder"}},{"kind":"Field","name":{"kind":"Name","value":"parentDocumentId"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<CreateWikiDocumentMutation, CreateWikiDocumentMutationVariables>;
export const UpdateWikiDocumentDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"UpdateWikiDocument"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"UpdateWikiDocumentInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"updateWikiDocument"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"sortOrder"}},{"kind":"Field","name":{"kind":"Name","value":"parentDocumentId"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<UpdateWikiDocumentMutation, UpdateWikiDocumentMutationVariables>;
export const ReorderWikiDocumentSiblingsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"ReorderWikiDocumentSiblings"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ReorderWikiDocumentSiblingsInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"reorderWikiDocumentSiblings"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"sortOrder"}},{"kind":"Field","name":{"kind":"Name","value":"parentDocumentId"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<ReorderWikiDocumentSiblingsMutation, ReorderWikiDocumentSiblingsMutationVariables>;
export const DeleteWikiDocumentDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteWikiDocument"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteWikiDocument"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<DeleteWikiDocumentMutation, DeleteWikiDocumentMutationVariables>;
export const DuplicateWikiDocumentDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DuplicateWikiDocument"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"withChildren"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"duplicateWikiDocument"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"withChildren"},"value":{"kind":"Variable","name":{"kind":"Name","value":"withChildren"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"sortOrder"}},{"kind":"Field","name":{"kind":"Name","value":"parentDocumentId"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}}]}}]}}]} as unknown as DocumentNode<DuplicateWikiDocumentMutation, DuplicateWikiDocumentMutationVariables>;
export const RestoreWikiDocumentDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RestoreWikiDocument"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"cascade"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"restoreWikiDocument"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"cascade"},"value":{"kind":"Variable","name":{"kind":"Name","value":"cascade"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"sortOrder"}},{"kind":"Field","name":{"kind":"Name","value":"parentDocumentId"}}]}}]}}]} as unknown as DocumentNode<RestoreWikiDocumentMutation, RestoreWikiDocumentMutationVariables>;
export const WikiDocumentTrashedDescendantsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"WikiDocumentTrashedDescendants"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"documentId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiDocumentTrashedDescendants"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"documentId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"documentId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}}]}}]}}]} as unknown as DocumentNode<WikiDocumentTrashedDescendantsQuery, WikiDocumentTrashedDescendantsQueryVariables>;
export const PermanentlyDeleteWikiDocumentDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"PermanentlyDeleteWikiDocument"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"permanentlyDeleteWikiDocument"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<PermanentlyDeleteWikiDocumentMutation, PermanentlyDeleteWikiDocumentMutationVariables>;
export const EmptyWikiDocumentTrashDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"EmptyWikiDocumentTrash"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"emptyWikiDocumentTrash"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}}]}]}}]} as unknown as DocumentNode<EmptyWikiDocumentTrashMutation, EmptyWikiDocumentTrashMutationVariables>;
export const CreateWikiDocumentBackupDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"CreateWikiDocumentBackup"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"documentId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"description"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"createWikiDocumentBackup"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"documentId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"documentId"}}},{"kind":"Argument","name":{"kind":"Name","value":"description"},"value":{"kind":"Variable","name":{"kind":"Name","value":"description"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"documentId"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"trigger"}},{"kind":"Field","name":{"kind":"Name","value":"description"}},{"kind":"Field","name":{"kind":"Name","value":"createdBy"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"username"}}]}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}}]}}]}}]} as unknown as DocumentNode<CreateWikiDocumentBackupMutation, CreateWikiDocumentBackupMutationVariables>;
export const RestoreWikiDocumentBackupDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RestoreWikiDocumentBackup"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"documentId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"backupId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"restoreWikiDocumentBackup"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"documentId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"documentId"}}},{"kind":"Argument","name":{"kind":"Name","value":"backupId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"backupId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"content"}}]}}]}}]} as unknown as DocumentNode<RestoreWikiDocumentBackupMutation, RestoreWikiDocumentBackupMutationVariables>;
export const DeleteWikiDocumentBackupDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"DeleteWikiDocumentBackup"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"deleteWikiDocumentBackup"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}]}]}}]} as unknown as DocumentNode<DeleteWikiDocumentBackupMutation, DeleteWikiDocumentBackupMutationVariables>;
export const TrackWikiDocumentVisitDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"TrackWikiDocumentVisit"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"documentId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"trackWikiDocumentVisit"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"documentId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"documentId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"visitedAt"}}]}}]}}]} as unknown as DocumentNode<TrackWikiDocumentVisitMutation, TrackWikiDocumentVisitMutationVariables>;
export const WikiDocumentChangedDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"WikiDocumentChanged"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiDocumentChanged"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"action"}},{"kind":"Field","name":{"kind":"Name","value":"documentId"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"parentDocumentId"}},{"kind":"Field","name":{"kind":"Name","value":"previousParentDocumentId"}},{"kind":"Field","name":{"kind":"Name","value":"document"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"title"}},{"kind":"Field","name":{"kind":"Name","value":"emoji"}},{"kind":"Field","name":{"kind":"Name","value":"icon"}},{"kind":"Field","name":{"kind":"Name","value":"color"}},{"kind":"Field","name":{"kind":"Name","value":"sortOrder"}},{"kind":"Field","name":{"kind":"Name","value":"parentDocument"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]}}]}}]} as unknown as DocumentNode<WikiDocumentChangedSubscription, WikiDocumentChangedSubscriptionVariables>;
export const WikiDocumentPresenceChangedDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"WikiDocumentPresenceChanged"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"wikiDocumentPresenceChanged"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"operationId"},"value":{"kind":"Variable","name":{"kind":"Name","value":"operationId"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"documentId"}},{"kind":"Field","name":{"kind":"Name","value":"operationId"}},{"kind":"Field","name":{"kind":"Name","value":"userId"}},{"kind":"Field","name":{"kind":"Name","value":"username"}},{"kind":"Field","name":{"kind":"Name","value":"action"}}]}}]}}]} as unknown as DocumentNode<WikiDocumentPresenceChangedSubscription, WikiDocumentPresenceChangedSubscriptionVariables>;