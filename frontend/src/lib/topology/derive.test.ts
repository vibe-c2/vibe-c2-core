import { describe, expect, it } from "vitest"
import type { HostFieldsFragment } from "@/graphql/gql/graphql"
import { hostAddr, isValidCidr, networkKey } from "@/lib/topology/cidr"
import {
  deriveTopology,
  withoutHiddenIdentities,
  type TopoEdge,
  type TopoNode,
} from "@/lib/topology/derive"

// --- builders ----------------------------------------------------------------

type IfaceInput = { name?: string; mac?: string; addresses: string[] }
type RouteInput = { destination?: string; gateway?: string; interface?: string }
type LoginInput = {
  user: string
  from?: string
  tty?: string
  lastSeen?: string
  count?: number
}

function host(
  id: string,
  hostname: string,
  interfaces: IfaceInput[],
  routes: RouteInput[] = [],
  logins: LoginInput[] = [],
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
    interfaces: interfaces.map((i) => ({
      name: i.name ?? "eth0",
      mac: i.mac ?? "",
      addresses: i.addresses,
    })),
    routes: routes.map((r) => ({
      destination: r.destination ?? "",
      gateway: r.gateway ?? "",
      interface: r.interface ?? "",
    })),
    logins: logins.map((l) => ({
      user: l.user,
      from: l.from ?? "",
      tty: l.tty ?? "",
      lastSeen: l.lastSeen ?? "",
      count: l.count ?? 1,
    })),
  }
}

const byKind = <K extends TopoNode["kind"]>(nodes: TopoNode[], kind: K) =>
  nodes.filter((n) => n.kind === kind) as Extract<TopoNode, { kind: K }>[]
const edgesOf = <K extends TopoEdge["kind"]>(edges: TopoEdge[], kind: K) =>
  edges.filter((e) => e.kind === kind) as Extract<TopoEdge, { kind: K }>[]

// --- cidr helpers ------------------------------------------------------------

describe("cidr helpers", () => {
  it("normalizes a CIDR to its network address", () => {
    expect(networkKey("10.0.5.12/24")).toBe("10.0.5.0/24")
    expect(networkKey("192.168.1.130/25")).toBe("192.168.1.128/25")
    expect(networkKey("10.1.142.65/24")).toBe("10.1.142.0/24")
  })

  it("handles IPv6 networks", () => {
    expect(networkKey("fe80::1234/64")).toBe("fe80::/64")
  })

  it("returns null for malformed input instead of throwing", () => {
    expect(networkKey("not-an-ip")).toBeNull()
    expect(networkKey("10.0.0.1")).toBeNull() // no prefix
    expect(hostAddr("garbage")).toBeNull()
  })

  it("strips prefixes to the host address", () => {
    expect(hostAddr("10.0.5.12/24")).toBe("10.0.5.12")
    expect(hostAddr("10.0.5.12")).toBe("10.0.5.12")
  })

  it("validates CIDR shape", () => {
    expect(isValidCidr("10.0.0.0/24")).toBe(true)
    expect(isValidCidr("10.0.0.1")).toBe(false)
    expect(isValidCidr("0.0.0.0/0")).toBe(true)
  })
})

// --- derivation --------------------------------------------------------------

describe("deriveTopology", () => {
  it("returns an empty graph for no hosts", () => {
    const t = deriveTopology([])
    expect(t.nodes).toHaveLength(0)
    expect(t.edges).toHaveLength(0)
    expect(t.stats.hosts).toBe(0)
  })

  it("groups two hosts on a shared subnet with no pivots", () => {
    const t = deriveTopology([
      host("a", "alpha", [{ addresses: ["10.0.5.10/24"] }]),
      host("b", "bravo", [{ addresses: ["10.0.5.11/24"] }]),
    ])
    const subnets = byKind(t.nodes, "subnet")
    expect(subnets).toHaveLength(1)
    expect(subnets[0].cidr).toBe("10.0.5.0/24")
    expect(subnets[0].hostIds.sort()).toEqual(["a", "b"])
    expect(edgesOf(t.edges, "membership")).toHaveLength(2)
    expect(edgesOf(t.edges, "pivot")).toHaveLength(0)
    expect(t.stats.phantomGateways).toBe(0)
  })

  it("draws a pivot to the host that owns the gateway, with a phantom dest subnet", () => {
    const t = deriveTopology([
      host("a", "alpha", [{ addresses: ["10.0.5.10/24"] }], [
        { destination: "10.0.8.0/24", gateway: "10.0.5.1" },
      ]),
      host("b", "router", [{ addresses: ["10.0.5.1/24"] }]),
    ])
    const pivots = edgesOf(t.edges, "pivot")
    expect(pivots).toHaveLength(1)
    expect(pivots[0].source).toBe("a")
    expect(pivots[0].target).toBe("b")
    expect(pivots[0].destLabel).toBe("10.0.8.0/24")
    // 10.0.8.0/24 has no known hosts -> phantom subnet reachable via the router.
    const ps = byKind(t.nodes, "phantom-subnet")
    expect(ps).toHaveLength(1)
    expect(ps[0].cidr).toBe("10.0.8.0/24")
    const reaches = edgesOf(t.edges, "reaches")
    expect(reaches).toHaveLength(1)
    expect(reaches[0].source).toBe("b")
    expect(reaches[0].target).toBe(ps[0].id)
  })

  it("does not phantom a destination subnet that has known hosts", () => {
    const t = deriveTopology([
      host("a", "alpha", [{ addresses: ["10.0.5.10/24"] }], [
        { destination: "10.0.8.0/24", gateway: "10.0.5.1" },
      ]),
      host("b", "router", [{ addresses: ["10.0.5.1/24", "10.0.8.1/24"] }]),
      host("c", "charlie", [{ addresses: ["10.0.8.50/24"] }]),
    ])
    expect(byKind(t.nodes, "phantom-subnet")).toHaveLength(0)
    expect(edgesOf(t.edges, "reaches")).toHaveLength(0)
    expect(edgesOf(t.edges, "pivot")).toHaveLength(1)
  })

  it("creates a phantom gateway for an unowned gateway IP", () => {
    const t = deriveTopology([
      host("a", "alpha", [{ addresses: ["10.0.5.10/24"] }], [
        { destination: "10.0.9.0/24", gateway: "10.0.5.254" },
      ]),
    ])
    const pg = byKind(t.nodes, "phantom-gateway")
    expect(pg).toHaveLength(1)
    expect(pg[0].ip).toBe("10.0.5.254")
    const unknown = edgesOf(t.edges, "pivot-unknown")
    expect(unknown).toHaveLength(1)
    expect(unknown[0].source).toBe("a")
    expect(unknown[0].target).toBe(pg[0].id)
    // No dangling phantom subnet for unknown-gateway routes.
    expect(byKind(t.nodes, "phantom-subnet")).toHaveLength(0)
  })

  it("flags default routes distinctly", () => {
    const t = deriveTopology([
      host("a", "alpha", [{ addresses: ["10.0.5.10/24"] }], [
        { destination: "0.0.0.0/0", gateway: "10.0.5.1" },
      ]),
      host("b", "gw", [{ addresses: ["10.0.5.1/24"] }]),
    ])
    const pivots = edgesOf(t.edges, "pivot")
    expect(pivots).toHaveLength(1)
    expect(pivots[0].isDefault).toBe(true)
    expect(pivots[0].destLabel).toBe("default")
    // Default route's dest is not a subnet, so no phantom subnet.
    expect(byKind(t.nodes, "phantom-subnet")).toHaveLength(0)
  })

  it("places a multi-homed host once, with an edge per subnet", () => {
    const t = deriveTopology([
      host("a", "multi", [
        { name: "eth0", addresses: ["10.0.5.10/24"] },
        { name: "eth1", addresses: ["10.0.6.10/24"] },
      ]),
    ])
    expect(byKind(t.nodes, "host")).toHaveLength(1)
    expect(byKind(t.nodes, "subnet")).toHaveLength(2)
    const memberships = edgesOf(t.edges, "membership")
    expect(memberships.every((e) => e.source === "a")).toBe(true)
    expect(memberships.map((e) => e.target).sort()).toEqual([
      "subnet:10.0.5.0/24",
      "subnet:10.0.6.0/24",
    ])
  })

  it("resolves a duplicate IP across hosts deterministically by input order", () => {
    const t = deriveTopology([
      host("first", "f", [{ addresses: ["10.0.5.1/24"] }]),
      host("second", "s", [{ addresses: ["10.0.5.1/24"] }]),
      host("c", "client", [{ addresses: ["10.0.5.9/24"] }], [
        { destination: "10.0.8.0/24", gateway: "10.0.5.1" },
      ]),
    ])
    const pivots = edgesOf(t.edges, "pivot")
    expect(pivots).toHaveLength(1)
    expect(pivots[0].target).toBe("first") // first writer won the IP index
  })

  it("skips malformed addresses without throwing", () => {
    const t = deriveTopology([
      host("a", "alpha", [{ addresses: ["not-a-cidr", "10.0.5.10/24", ""] }], [
        { destination: "garbage", gateway: "also-garbage" },
      ]),
    ])
    expect(byKind(t.nodes, "subnet")).toHaveLength(1)
    expect(edgesOf(t.edges, "membership")).toHaveLength(1)
    // Garbage gateway is not a known IP -> treated as a phantom gateway lead.
    expect(byKind(t.nodes, "phantom-gateway")).toHaveLength(1)
  })

  it("handles IPv6 interfaces and routes", () => {
    const t = deriveTopology([
      host("a", "alpha", [{ addresses: ["fe80::10/64"] }], [
        { destination: "2001:db8::/32", gateway: "fe80::1" },
      ]),
      host("b", "router", [{ addresses: ["fe80::1/64"] }]),
    ])
    expect(byKind(t.nodes, "subnet").some((s) => s.cidr === "fe80::/64")).toBe(
      true,
    )
    expect(edgesOf(t.edges, "pivot")).toHaveLength(1)
  })

  it("skips on-link routes that have no gateway", () => {
    const t = deriveTopology([
      host("a", "alpha", [{ addresses: ["10.0.5.10/24"] }], [
        { destination: "10.0.5.0/24", gateway: "" },
      ]),
    ])
    expect(edgesOf(t.edges, "pivot")).toHaveLength(0)
    expect(edgesOf(t.edges, "pivot-unknown")).toHaveLength(0)
    expect(byKind(t.nodes, "phantom-gateway")).toHaveLength(0)
  })
})

describe("deriveTopology — identity layer (logins)", () => {
  it("shares one identity node across hosts and links them via logged-into", () => {
    const t = deriveTopology([
      host("h1", "alpha", [{ addresses: ["10.0.0.1/24"] }], [], [{ user: "alice" }]),
      host("h2", "beta", [{ addresses: ["10.0.0.2/24"] }], [], [{ user: "alice" }]),
    ])
    const ids = byKind(t.nodes, "identity")
    expect(ids).toHaveLength(1)
    expect(ids[0].user).toBe("alice")
    expect(ids[0].wellKnown).toBe(false)
    // One logged-into edge per host, both from the shared identity.
    const into = edgesOf(t.edges, "logged-into")
    expect(into).toHaveLength(2)
    expect(into.every((e) => e.source === ids[0].id)).toBe(true)
    expect(new Set(into.map((e) => e.target))).toEqual(new Set(["h1", "h2"]))
    expect(t.stats.identities).toBe(1)
  })

  it("flags well-known accounts", () => {
    const t = deriveTopology([
      host("h1", "alpha", [{ addresses: ["10.0.0.1/24"] }], [], [{ user: "root" }]),
    ])
    expect(byKind(t.nodes, "identity")[0].wellKnown).toBe(true)
  })

  it("resolves a from-IP to a known host as the source (logged-from)", () => {
    // alice logged into h2 FROM 10.0.0.1, which is h1's interface IP.
    const t = deriveTopology([
      host("h1", "alpha", [{ addresses: ["10.0.0.1/24"] }]),
      host("h2", "beta", [{ addresses: ["10.0.0.2/24"] }], [], [
        { user: "alice", from: "10.0.0.1" },
      ]),
    ])
    const from = edgesOf(t.edges, "logged-from")
    expect(from).toHaveLength(1)
    expect(from[0].source).toBe("h1") // resolved to the real host
    const identity = byKind(t.nodes, "identity")[0]
    expect(from[0].target).toBe(identity.id)
    expect(byKind(t.nodes, "phantom-host")).toHaveLength(0)
  })

  it("resolves a from-hostname to a known host", () => {
    const t = deriveTopology([
      host("h1", "jumpbox", [{ addresses: ["10.0.0.1/24"] }]),
      host("h2", "beta", [{ addresses: ["10.0.0.2/24"] }], [], [
        { user: "alice", from: "jumpbox" },
      ]),
    ])
    expect(edgesOf(t.edges, "logged-from")[0].source).toBe("h1")
  })

  it("spawns a phantom host for an unresolved login source", () => {
    const t = deriveTopology([
      host("h1", "beta", [{ addresses: ["10.0.0.2/24"] }], [], [
        { user: "alice", from: "10.9.9.9" },
      ]),
    ])
    const phantoms = byKind(t.nodes, "phantom-host")
    expect(phantoms).toHaveLength(1)
    expect(phantoms[0].label).toBe("10.9.9.9")
    expect(t.stats.phantomHosts).toBe(1)
    expect(edgesOf(t.edges, "logged-from")[0].source).toBe(phantoms[0].id)
  })

  it("deduplicates repeated footprints into single edges", () => {
    const t = deriveTopology([
      host("h1", "beta", [{ addresses: ["10.0.0.2/24"] }], [], [
        { user: "alice", from: "10.9.9.9", count: 5 },
        { user: "alice", from: "10.9.9.9", count: 2 },
      ]),
    ])
    const into = edgesOf(t.edges, "logged-into")
    const from = edgesOf(t.edges, "logged-from")
    expect(into).toHaveLength(1)
    expect(from).toHaveLength(1)
    expect(byKind(t.nodes, "identity")).toHaveLength(1)
    // The pairing arrays dedupe alongside the edges themselves.
    expect(into[0].sourceIds).toHaveLength(1)
    expect(from[0].targetIds).toEqual(["h1"])
  })

  it("preserves the per-footprint source↔destination pairing on login edges", () => {
    // From jump, alice reached h2 and h3; from elsewhere (10.9.9.9) she only
    // reached h3. The deduped graph alone can't tell which source led where —
    // the pairing arrays must.
    const t = deriveTopology([
      host("jump", "jumpbox", [{ addresses: ["10.0.0.1/24"] }]),
      host("h2", "beta", [{ addresses: ["10.0.0.2/24"] }], [], [
        { user: "alice", from: "10.0.0.1" },
      ]),
      host("h3", "gamma", [{ addresses: ["10.0.0.3/24"] }], [], [
        { user: "alice", from: "10.0.0.1" },
        { user: "alice", from: "10.9.9.9" },
      ]),
    ])
    const from = edgesOf(t.edges, "logged-from")
    const fromJump = from.find((e) => e.source === "jump")
    const fromGhost = from.find((e) => e.source !== "jump")
    expect(fromJump?.targetIds).toEqual(["h2", "h3"])
    expect(fromGhost?.targetIds).toEqual(["h3"])

    const into = edgesOf(t.edges, "logged-into")
    const intoH2 = into.find((e) => e.target === "h2")
    const intoH3 = into.find((e) => e.target === "h3")
    expect(intoH2?.sourceIds).toEqual(["jump"])
    expect(intoH3?.sourceIds).toEqual(["jump", fromGhost?.source])
  })

  it("leaves sourceIds empty for a login with no from", () => {
    const t = deriveTopology([
      host("h1", "beta", [{ addresses: ["10.0.0.2/24"] }], [], [{ user: "alice" }]),
    ])
    expect(edgesOf(t.edges, "logged-into")[0].sourceIds).toEqual([])
    expect(edgesOf(t.edges, "logged-from")).toHaveLength(0)
  })

  it("emits no identity nodes or edges when there are no logins", () => {
    const t = deriveTopology([host("h1", "alpha", [{ addresses: ["10.0.0.1/24"] }])])
    expect(byKind(t.nodes, "identity")).toHaveLength(0)
    expect(edgesOf(t.edges, "logged-into")).toHaveLength(0)
    expect(t.stats.identities).toBe(0)
  })
})

describe("withoutHiddenIdentities", () => {
  it("removes a hidden identity node and the edges touching it", () => {
    const t = deriveTopology([
      host("h1", "alpha", [{ addresses: ["10.0.0.1/24"] }], [], [
        { user: "alice" },
        { user: "default" },
      ]),
    ])
    const out = withoutHiddenIdentities(t, new Set(["default"]))

    const ids = byKind(out.nodes, "identity")
    expect(ids).toHaveLength(1)
    expect(ids[0].user).toBe("alice")
    // No edge may reference the removed identity node.
    const goneId = byKind(t.nodes, "identity").find((n) => n.user === "default")!.id
    expect(out.edges.some((e) => e.source === goneId || e.target === goneId)).toBe(
      false,
    )
  })

  it("matches case-insensitively", () => {
    const t = deriveTopology([
      host("h1", "alpha", [{ addresses: ["10.0.0.1/24"] }], [], [{ user: "Default" }]),
    ])
    const out = withoutHiddenIdentities(t, new Set(["default"]))
    expect(byKind(out.nodes, "identity")).toHaveLength(0)
  })

  it("prunes a phantom host orphaned by hiding its only identity", () => {
    // svc logged into h1 FROM an unmapped source -> spawns a phantom host whose
    // only edge is to svc. Hiding svc should drop the phantom too.
    const t = deriveTopology([
      host("h1", "alpha", [{ addresses: ["10.0.0.1/24"] }], [], [
        { user: "svc", from: "10.9.9.9" },
      ]),
    ])
    expect(byKind(t.nodes, "phantom-host")).toHaveLength(1)

    const out = withoutHiddenIdentities(t, new Set(["svc"]))
    expect(byKind(out.nodes, "identity")).toHaveLength(0)
    expect(byKind(out.nodes, "phantom-host")).toHaveLength(0)
  })

  it("keeps real hosts as anchors even when isolated by hiding", () => {
    const t = deriveTopology([
      host("h1", "alpha", [{ addresses: ["10.0.0.1/24"] }], [], [{ user: "default" }]),
    ])
    const out = withoutHiddenIdentities(t, new Set(["default"]))
    expect(byKind(out.nodes, "host").map((n) => n.id)).toContain("h1")
  })

  it("is a no-op (returns the input) for an empty hidden set", () => {
    const t = deriveTopology([
      host("h1", "alpha", [{ addresses: ["10.0.0.1/24"] }], [], [{ user: "alice" }]),
    ])
    expect(withoutHiddenIdentities(t, new Set())).toBe(t)
  })

  it("is a no-op when no identity matches the hidden set", () => {
    const t = deriveTopology([
      host("h1", "alpha", [{ addresses: ["10.0.0.1/24"] }], [], [{ user: "alice" }]),
    ])
    expect(withoutHiddenIdentities(t, new Set(["nobody-here"]))).toBe(t)
  })
})
