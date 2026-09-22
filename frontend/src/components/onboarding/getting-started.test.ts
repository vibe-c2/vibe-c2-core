import { describe, expect, test } from "vitest"

import { gettingStartedVariant } from "./getting-started"

describe("gettingStartedVariant", () => {
  test("offers the operations an operator can already see", () => {
    expect(
      gettingStartedVariant({ operationCount: 3, canCreateOperation: false }),
    ).toBe("choose")
  })

  // Membership beats permission: an admin who already belongs somewhere should
  // be shown the way in, not pushed to create a second operation.
  test("prefers choosing over creating when both are possible", () => {
    expect(
      gettingStartedVariant({ operationCount: 1, canCreateOperation: true }),
    ).toBe("choose")
  })

  test("offers creation to an admin with nowhere to go", () => {
    expect(
      gettingStartedVariant({ operationCount: 0, canCreateOperation: true }),
    ).toBe("create")
  })

  // The case the old empty state got wrong. `operation:create` is admin-only
  // and non-admins only see operations they belong to, so this operator cannot
  // act on "pick an operation" at all — they need to be added by someone.
  test("sends an operator with no operations and no permission to an admin", () => {
    expect(
      gettingStartedVariant({ operationCount: 0, canCreateOperation: false }),
    ).toBe("request")
  })
})
