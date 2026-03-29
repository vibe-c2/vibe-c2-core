import type { TypedDocumentNode } from "@graphql-typed-document-node/core"
import { print } from "graphql"
import { apiFetch } from "@/services/api-client"

export interface GraphQLError {
  message: string
  path?: string[]
  extensions?: Record<string, unknown>
}

export class GraphQLRequestError extends Error {
  errors: GraphQLError[]

  constructor(errors: GraphQLError[]) {
    super(errors.map((e) => e.message).join("; "))
    this.name = "GraphQLRequestError"
    this.errors = errors
  }
}

export async function graphqlClient<TResult, TVariables>(
  document: TypedDocumentNode<TResult, TVariables>,
  ...[variables]: TVariables extends Record<string, never> ? [] : [TVariables]
): Promise<TResult> {
  const res = await apiFetch("/graphql", {
    method: "POST",
    body: JSON.stringify({
      query: print(document),
      variables,
    }),
  })

  const json = await res.json()

  if (json.errors && !json.data) {
    throw new GraphQLRequestError(json.errors)
  }

  // Partial errors: data is usable but some fields may be null due to
  // authorization failures or resolver errors. Surface them in dev so
  // they don't go unnoticed.
  if (json.errors && json.data) {
    if (import.meta.env.DEV) {
      console.warn("[GraphQL] Partial errors:", json.errors)
    }
  }

  return json.data as TResult
}
