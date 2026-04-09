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

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`GraphQL request failed (${res.status}): ${text}`)
  }

  const json = await res.json()

  if (json.errors && !json.data) {
    throw new GraphQLRequestError(json.errors)
  }

  // Partial errors (data + errors): some fields are null because a resolver
  // or directive failed. We classify these:
  //
  //   - FORBIDDEN / UNAUTHENTICATED → hard failure. Throw so React Query sees
  //     it as an error, error boundaries fire, and toasts trigger. These are
  //     from the @hasPermission directive and should never be silently
  //     swallowed: a user seeing a partially-blank page with no feedback is
  //     a worse UX than a clear "forbidden" error.
  //
  //   - Anything else → log and return partial data. Resolver-level errors
  //     on optional fields can legitimately leave nulls in the response.
  //
  // If you have a query that genuinely expects some fields to be null for
  // lower-privilege users (e.g. admin-only fields on a shared query), split
  // it into separate queries or gate the field with @include(if: $isAdmin)
  // instead of relying on partial-data fallthrough.
  if (json.errors && json.data) {
    const isHardFailure = json.errors.some((e: GraphQLError) => {
      const code = e.extensions?.code
      return code === "FORBIDDEN" || code === "UNAUTHENTICATED"
    })
    if (isHardFailure) {
      throw new GraphQLRequestError(json.errors)
    }
    console.warn("[GraphQL] Partial errors:", json.errors)
  }

  return json.data as TResult
}
