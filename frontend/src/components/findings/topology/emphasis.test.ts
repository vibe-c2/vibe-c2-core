import { describe, expect, it } from "vitest"
import type { HostFieldsFragment } from "@/graphql/gql/graphql"
import { deriveTopology } from "@/lib/topology/derive"
import {
  edgeFocusSets,
  applyEdgeEmphasis,
} from "@/components/findings/topology/emphasis"

// Focused on the edge-focus path (edgeFocusSets + the explicit litEdges rule
// in applyEdgeEmphasis); node focus and search emphasis are exercised through
// the view. Fixtures go through deriveTopology so they stay honest about what
// the derivation actually produces.

function loginHost(
  id: string,
  hostname: string,
  ip: string,
  logins: { user: string; from?: string }[] = [],
): HostFieldsFragment {
  return {
    id,
    operationId: "op1",
    hostname,
    os: "",
    emoji: "",
    icon: "",
    color: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    createdBy: null,
    interfaces: [{ name: "eth0", mac: "", addresses: [ip] }],
    routes: [],
    logins: logins.map((l) => ({
      user: l.user,
      from: l.from ?? "",
      tty: "",
      lastSeen: "",
      count: 1,
    })),
  }
}

// alice travelled jump → h2 and jump → h3; she also reached h3 from a ghost
// source. bob reached h2 from h3 — wiring between nodes the alice-focus
// lights, which must stay dimmed.
function fixture() {
  return deriveTopology([
    loginHost("jump", "jumpbox", "10.0.0.1/24"),
    loginHost("h2", "beta", "10.0.0.2/24", [
      { user: "alice", from: "10.0.0.1" },
      { user: "bob", from: "10.0.0.3" },
    ]),
    loginHost("h3", "gamma", "10.0.0.3/24", [
      { user: "alice", from: "10.0.0.1" },
      { user: "alice", from: "10.9.9.9" },
    ]),
  ])
}

const edge = (t: ReturnType<typeof fixture>, id: string) => {
  const found = t.edges.find((e) => e.id === id)
  if (!found) throw new Error(`fixture is missing edge ${id}`)
  return found
}

describe("edgeFocusSets", () => {
  it("host → user: lights the source, the user, and every destination of that pairing", () => {
    const t = fixture()
    const sets = edgeFocusSets(edge(t, "lf:jump->identity:alice"), t)

    expect(sets.lit).toEqual(
      new Set(["jump", "identity:alice", "h2", "h3"]),
    )
    // The focused edge plus exactly the user → destination hops of this source.
    expect(sets.litEdges).toEqual(
      new Set([
        "lf:jump->identity:alice",
        "li:identity:alice->h2",
        "li:identity:alice->h3",
      ]),
    )
    // No ring: there is no single "the" node in an edge focus.
    expect(sets.active).toBeNull()
    expect(sets.ringMatches).toBe(false)
  })

  it("host → user: a destination the user reached only from ANOTHER source stays dark", () => {
    const t = fixture()
    const sets = edgeFocusSets(edge(t, "lf:ph:10.9.9.9->identity:alice"), t)

    // The ghost source only ever led to h3 — h2 (reached from jump) is not lit.
    expect(sets.lit.has("h2")).toBe(false)
    expect(sets.lit).toEqual(
      new Set(["ph:10.9.9.9", "identity:alice", "h3"]),
    )
    expect(sets.litEdges).toEqual(
      new Set(["lf:ph:10.9.9.9->identity:alice", "li:identity:alice->h3"]),
    )
  })

  it("user → host: the mirror — lights the user, the host, and every source of that pairing", () => {
    const t = fixture()
    const sets = edgeFocusSets(edge(t, "li:identity:alice->h3"), t)

    expect(sets.lit).toEqual(
      new Set(["identity:alice", "h3", "jump", "ph:10.9.9.9"]),
    )
    expect(sets.litEdges).toEqual(
      new Set([
        "li:identity:alice->h3",
        "lf:jump->identity:alice",
        "lf:ph:10.9.9.9->identity:alice",
      ]),
    )
  })

  it("any other edge kind focuses as just its two endpoints", () => {
    const t = deriveTopology([
      loginHost("a", "alpha", "10.0.5.1/24"),
      loginHost("b", "bravo", "10.0.5.2/24"),
    ])
    const membership = t.edges.find((e) => e.kind === "membership")!
    const sets = edgeFocusSets(membership, t)
    expect(sets.lit).toEqual(new Set([membership.source, membership.target]))
    expect(sets.litEdges).toEqual(new Set([membership.id]))
  })
})

describe("applyEdgeEmphasis with explicit litEdges", () => {
  it("dims wiring between lit nodes that is not part of the focused relation", () => {
    const t = fixture()
    const sets = edgeFocusSets(edge(t, "lf:jump->identity:alice"), t)

    // Render-layer edges only need ids/endpoints for this pass.
    const rendered = applyEdgeEmphasis(
      t.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
      sets,
    )
    const byId = new Map(rendered.map((e) => [e.id, e.data]))

    expect(byId.get("lf:jump->identity:alice")).toMatchObject({ lit: true })
    expect(byId.get("li:identity:alice->h2")).toMatchObject({ lit: true })
    // bob's h3 → bob → h2 wiring runs between lit hosts, but it is not part
    // of alice's travel from jump — the endpoints rule would light it.
    expect(byId.get("lf:h3->identity:bob")).toMatchObject({ dimmed: true })
    expect(byId.get("li:identity:bob->h2")).toMatchObject({ dimmed: true })
  })
})
