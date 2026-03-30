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
    "\n  fragment SessionFields on Session {\n    id\n    userId\n    user {\n      id\n      username\n    }\n    ipAddress\n    userAgent\n    browser\n    os\n    device\n    status\n    terminationReason\n    lastActivityAt\n    expiresAt\n    terminatedAt\n    isCurrent\n    createdAt\n    updatedAt\n  }\n": typeof types.SessionFieldsFragmentDoc,
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
};
const documents: Documents = {
    "\n  fragment SessionFields on Session {\n    id\n    userId\n    user {\n      id\n      username\n    }\n    ipAddress\n    userAgent\n    browser\n    os\n    device\n    status\n    terminationReason\n    lastActivityAt\n    expiresAt\n    terminatedAt\n    isCurrent\n    createdAt\n    updatedAt\n  }\n": types.SessionFieldsFragmentDoc,
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
export function graphql(source: "\n  fragment SessionFields on Session {\n    id\n    userId\n    user {\n      id\n      username\n    }\n    ipAddress\n    userAgent\n    browser\n    os\n    device\n    status\n    terminationReason\n    lastActivityAt\n    expiresAt\n    terminatedAt\n    isCurrent\n    createdAt\n    updatedAt\n  }\n"): (typeof documents)["\n  fragment SessionFields on Session {\n    id\n    userId\n    user {\n      id\n      username\n    }\n    ipAddress\n    userAgent\n    browser\n    os\n    device\n    status\n    terminationReason\n    lastActivityAt\n    expiresAt\n    terminatedAt\n    isCurrent\n    createdAt\n    updatedAt\n  }\n"];
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

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;