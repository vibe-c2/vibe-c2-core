import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { TypedDocumentNode } from "@graphql-typed-document-node/core"

// The registry opens subscriptions on the singleton graphql-ws client. Stub it
// so these tests exercise the registry's own lifecycle bookkeeping and nothing
// else — no socket, no auth, no reconnect logic.
const subscribeCalls: string[] = []
const disposed: string[] = []

vi.mock("@/lib/graphql-ws-client", () => ({
  getGraphQLWSClient: () => ({
    subscribe: (payload: { operationName?: string }) => {
      const name = payload.operationName ?? "(anonymous)"
      subscribeCalls.push(name)
      return () => {
        disposed.push(name)
      }
    },
  }),
}))

const {
  subscribe,
  pauseSubscriptions,
  resumeSubscriptions,
  onSubscriptionsResumed,
} = await import("@/lib/subscription-registry")

// Minimal stand-in for a codegen document. The registry only reads
// `definitions` (for the operation name) and prints it, so a hand-built AST
// fragment is enough and avoids pulling a generated document into a unit test.
function fakeDocument(name: string): TypedDocumentNode<unknown, unknown> {
  return {
    kind: "Document",
    definitions: [
      {
        kind: "OperationDefinition",
        operation: "subscription",
        name: { kind: "Name", value: name },
        selectionSet: {
          kind: "SelectionSet",
          selections: [{ kind: "Field", name: { kind: "Name", value: "ping" } }],
        },
      },
    ],
  } as unknown as TypedDocumentNode<unknown, unknown>
}

describe("subscription registry visibility gap", () => {
  // The registry is module state shared by every test here. A failed
  // assertion aborts before its own cleanup line would run, so cleanup is
  // collected and drained centrally — otherwise one failure cascades into
  // unrelated ones and hides which test actually broke.
  const cleanups: Array<() => void> = []

  function track<T extends () => void>(cleanup: T): T {
    cleanups.push(cleanup)
    return cleanup
  }

  beforeEach(() => {
    subscribeCalls.length = 0
    disposed.length = 0
  })

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()!()
  })

  it("announces a resume after subscriptions were torn down", () => {
    const resumed = vi.fn()
    track(onSubscriptionsResumed(resumed))
    track(subscribe(fakeDocument("WikiDocumentChanged"), {}, () => {}))

    pauseSubscriptions()
    expect(disposed).toEqual(["WikiDocumentChanged"])
    expect(resumed).not.toHaveBeenCalled()

    resumeSubscriptions()
    expect(resumed).toHaveBeenCalledTimes(1)
  })

  it("re-opens the subscription it tore down", () => {
    track(subscribe(fakeDocument("TaskChanged"), {}, () => {}))
    expect(subscribeCalls).toEqual(["TaskChanged"])

    pauseSubscriptions()
    resumeSubscriptions()

    expect(subscribeCalls).toEqual(["TaskChanged", "TaskChanged"])
  })

  // An alt-tab with nothing subscribed loses no events, so catching up would
  // be pure cost. This is what keeps the blanket invalidation on the other end
  // from firing on every idle tab switch.
  it("stays quiet when nothing was subscribed", () => {
    const resumed = vi.fn()
    track(onSubscriptionsResumed(resumed))

    pauseSubscriptions()
    resumeSubscriptions()

    expect(resumed).not.toHaveBeenCalled()
  })

  // The gap is announced once per gap, not once per tab switch: a second
  // return with no intervening teardown has nothing new to report.
  it("announces once per gap", () => {
    const resumed = vi.fn()
    track(onSubscriptionsResumed(resumed))
    track(subscribe(fakeDocument("HostChanged"), {}, () => {}))

    pauseSubscriptions()
    resumeSubscriptions()
    resumeSubscriptions()

    expect(resumed).toHaveBeenCalledTimes(1)
  })

  it("stops notifying after the listener unregisters", () => {
    const resumed = vi.fn()
    onSubscriptionsResumed(resumed)()
    track(subscribe(fakeDocument("CredentialChanged"), {}, () => {}))

    pauseSubscriptions()
    resumeSubscriptions()

    expect(resumed).not.toHaveBeenCalled()
  })
})
