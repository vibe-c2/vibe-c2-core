// Which getting-started story a given operator should be told.
//
// Pure so the branching can be tested without a router, a query client or a
// DOM. The component below it only renders what this decides.
//
// The branch exists because "pick an operation" is not universal advice.
// `operation:create` is admin-only and non-admins only see operations they
// belong to, so a new regular operator frequently has none and nothing they
// can do about it. Telling them to pick one would be a dead end; the honest
// answer is who to ask, plus somewhere real to go in the meantime.

export type GettingStartedVariant =
  /** Has operations to choose from. The guide can actually run. */
  | "choose"
  /** No operations, but may create one. */
  | "create"
  /** No operations and cannot create any — needs an operation admin. */
  | "request"

export interface GettingStartedInput {
  /** How many operations this operator can see. */
  operationCount: number
  /** Whether they hold `operation:create`. */
  canCreateOperation: boolean
}

export function gettingStartedVariant({
  operationCount,
  canCreateOperation,
}: GettingStartedInput): GettingStartedVariant {
  if (operationCount > 0) return "choose"
  return canCreateOperation ? "create" : "request"
}
