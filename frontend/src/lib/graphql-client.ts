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
      variables: variables ?? undefined,
    }),
  })

  const json = await res.json()

  if (json.errors && !json.data) {
    throw new GraphQLRequestError(json.errors)
  }

  return json.data as TResult
}
