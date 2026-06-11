import { describe, expect, it } from "vitest"
import type { HostFieldsFragment } from "@/graphql/gql/graphql"
import {
  collapseLeafSubnets,
  collapsePhantomHosts,
} from "@/lib/topology/aggregate"
import { deriveTopology, type TopoEdge, type TopoNode } from "@/lib/topology/derive"

// --- builders (mirrors derive.test.ts) ----------------------------------------

type IfaceInput = { name?: string; addresses: string[] }

function host(
  id: string,
  hostname: string,
  interfaces: IfaceInput[],
): HostFieldsFragment {
  return {
    id,
    operationId: "op1",
    hostname,
    os: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    createdBy: null,
    interfaces: interfaces.map((i) => ({
      name: i.name ?? "eth0",
      mac: "",
      addresses: i.addresses,
    })),
    routes: [],
    logins: [],
  }
}

const byKind = <K extends TopoNode["kind"]>(nodes: TopoNode[], kind: K) =>
  nodes.filter((n) => n.kind === kind) as Extract<TopoNode, { kind: K }>[]
const edgesOf = <K extends TopoEdge["kind"]>(edges: TopoEdge[], kind: K) =>
  edges.filter((e) => e.kind === kind) as Extract<TopoEdge, { kind: K }>[]

// --- collapseLeafSubnets -------------------------------------------------------

describe("collapseLeafSubnets", () => {
  it("merges a VPN concentrator's single-host subnets into one node", () => {
    // The production case: ten tun interfaces, each alone on its own /24.
    const tuns = Array.from({ length: 10 }, (_, i) => ({
      name: `tun${i}`,
      addresses: [`10.8.${i}.1/24`],
    }))
    const t = collapseLeafSubnets(
      deriveTopology([host("vpn", "openvpn", tuns)]),
    )

    expect(byKind(t.nodes, "subnet")).toHaveLength(0)
    const leafs = byKind(t.nodes, "leaf-subnets")
    expect(leafs).toHaveLength(1)
    expect(leafs[0].hostId).toBe("vpn")
    expect(leafs[0].entries).toHaveLength(10)
    expect(edgesOf(t.edges, "membership")).toHaveLength(0)
    const groups = edgesOf(t.edges, "membership-group")
    expect(groups).toHaveLength(1)
    expect(groups[0].source).toBe("vpn")
    expect(groups[0].target).toBe(leafs[0].id)
  })

  it("sorts entries numerically by interface name", () => {
    const t = collapseLeafSubnets(
      deriveTopology([
        host("vpn", "openvpn", [
          { name: "tun10", addresses: ["10.8.10.1/24"] },
          { name: "tun2", addresses: ["10.8.2.1/24"] },
          { name: "tun1", addresses: ["10.8.1.1/24"] },
        ]),
      ]),
    )
    const [leaf] = byKind(t.nodes, "leaf-subnets")
    expect(leaf.entries.map((e) => e.iface)).toEqual(["tun1", "tun2", "tun10"])
    expect(leaf.entries[0]).toEqual({
      cidr: "10.8.1.0/24",
      iface: "tun1",
      ip: "10.8.1.1",
    })
  })

  it("leaves a host with a single leaf subnet untouched", () => {
    const t = collapseLeafSubnets(
      deriveTopology([host("a", "alpha", [{ addresses: ["10.0.5.10/24"] }])]),
    )
    expect(byKind(t.nodes, "subnet")).toHaveLength(1)
    expect(byKind(t.nodes, "leaf-subnets")).toHaveLength(0)
    expect(edgesOf(t.edges, "membership")).toHaveLength(1)
  })

  it("never merges a subnet shared by two hosts", () => {
    const t = collapseLeafSubnets(
      deriveTopology([
        host("a", "alpha", [{ addresses: ["10.0.5.10/24"] }]),
        host("b", "bravo", [{ addresses: ["10.0.5.11/24"] }]),
      ]),
    )
    expect(byKind(t.nodes, "subnet")).toHaveLength(1)
    expect(byKind(t.nodes, "leaf-subnets")).toHaveLength(0)
  })

  it("keeps shared subnets while merging the leaf ones", () => {
    const t = collapseLeafSubnets(
      deriveTopology([
        host("vpn", "openvpn", [
          { name: "eth0", addresses: ["10.0.5.1/24"] }, // shared with bravo
          { name: "tun0", addresses: ["10.8.0.1/24"] },
          { name: "tun1", addresses: ["10.8.1.1/24"] },
        ]),
        host("b", "bravo", [{ addresses: ["10.0.5.11/24"] }]),
      ]),
    )
    const subnets = byKind(t.nodes, "subnet")
    expect(subnets).toHaveLength(1)
    expect(subnets[0].cidr).toBe("10.0.5.0/24")
    const [leaf] = byKind(t.nodes, "leaf-subnets")
    expect(leaf.entries.map((e) => e.cidr)).toEqual([
      "10.8.0.0/24",
      "10.8.1.0/24",
    ])
    // The shared subnet's membership edges survive: vpn + bravo.
    expect(edgesOf(t.edges, "membership")).toHaveLength(2)
  })

  it("collapses independently per host", () => {
    const t = collapseLeafSubnets(
      deriveTopology([
        host("v1", "vpn1", [
          { name: "tun0", addresses: ["10.8.0.1/24"] },
          { name: "tun1", addresses: ["10.8.1.1/24"] },
        ]),
        host("v2", "vpn2", [
          { name: "tun0", addresses: ["10.9.0.1/24"] },
          { name: "tun1", addresses: ["10.9.1.1/24"] },
        ]),
      ]),
    )
    const leafs = byKind(t.nodes, "leaf-subnets")
    expect(leafs.map((l) => l.hostId).sort()).toEqual(["v1", "v2"])
    expect(edgesOf(t.edges, "membership-group")).toHaveLength(2)
  })

  it("keeps one row per interface when two interfaces share a leaf subnet", () => {
    const t = collapseLeafSubnets(
      deriveTopology([
        host("a", "alpha", [
          { name: "eth0", addresses: ["10.0.5.10/24"] },
          { name: "eth1", addresses: ["10.0.5.11/24"] },
          { name: "tun0", addresses: ["10.8.0.1/24"] },
        ]),
      ]),
    )
    // 10.0.5.0/24 (via eth0+eth1) and 10.8.0.0/24 are both single-host leafs.
    const [leaf] = byKind(t.nodes, "leaf-subnets")
    expect(leaf.entries.map((e) => `${e.iface} ${e.cidr}`)).toEqual([
      "eth0 10.0.5.0/24",
      "eth1 10.0.5.0/24",
      "tun0 10.8.0.0/24",
    ])
    // Still exactly one group edge regardless of entry count.
    expect(edgesOf(t.edges, "membership-group")).toHaveLength(1)
  })

  it("passes stats through unchanged — the legend keeps counting real subnets", () => {
    const raw = deriveTopology([
      host("vpn", "openvpn", [
        { name: "tun0", addresses: ["10.8.0.1/24"] },
        { name: "tun1", addresses: ["10.8.1.1/24"] },
      ]),
    ])
    const t = collapseLeafSubnets(raw)
    expect(t.stats).toEqual(raw.stats)
    expect(t.stats.subnets).toBe(2)
  })

  it("returns the topology unchanged when nothing collapses", () => {
    const raw = deriveTopology([
      host("a", "alpha", [{ addresses: ["10.0.5.10/24"] }]),
      host("b", "bravo", [{ addresses: ["10.0.5.11/24"] }]),
    ])
    expect(collapseLeafSubnets(raw)).toBe(raw)
  })
})

// --- collapsePhantomHosts ------------------------------------------------------

// Host carrying login footprints, for building identity-layer fixtures.
function loginHost(
  id: string,
  hostname: string,
  ip: string,
  logins: { user: string; from?: string }[],
): HostFieldsFragment {
  return {
    id,
    operationId: "op1",
    hostname,
    os: "",
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

describe("collapsePhantomHosts", () => {
  it("folds an identity's many lone unknown sources into one node", () => {
    // alice logged in from five unmapped machines, each seen only for alice.
    const froms = ["10.9.0.1", "10.9.0.2", "10.9.0.3", "10.9.0.4", "10.9.0.5"]
    const t = collapsePhantomHosts(
      deriveTopology([
        loginHost("h1", "target", "10.0.0.1/24", froms.map((from) => ({ user: "alice", from }))),
      ]),
    )
    expect(byKind(t.nodes, "phantom-host")).toHaveLength(0)
    const lone = byKind(t.nodes, "lone-sources")
    expect(lone).toHaveLength(1)
    expect(lone[0].labels).toHaveLength(5)
    expect(lone[0].labels).toContain("10.9.0.3")
    // One group edge replaces the five logged-from edges; it feeds the identity.
    expect(edgesOf(t.edges, "logged-from")).toHaveLength(0)
    const grouped = edgesOf(t.edges, "logged-from-group")
    expect(grouped).toHaveLength(1)
    expect(grouped[0].source).toBe(lone[0].id)
    expect(grouped[0].target).toBe(lone[0].identityId)
  })

  it("leaves a single lone source as a normal phantom host", () => {
    const t = collapsePhantomHosts(
      deriveTopology([
        loginHost("h1", "target", "10.0.0.1/24", [{ user: "alice", from: "10.9.0.1" }]),
      ]),
    )
    expect(byKind(t.nodes, "lone-sources")).toHaveLength(0)
    expect(byKind(t.nodes, "phantom-host")).toHaveLength(1)
  })

  it("never collapses a source that feeds two identities", () => {
    // 10.9.0.1 is the origin for BOTH alice and bob — it relates the two
    // accounts, so it stays a node even though each tie is otherwise lone.
    const t = collapsePhantomHosts(
      deriveTopology([
        loginHost("h1", "target", "10.0.0.1/24", [
          { user: "alice", from: "10.9.0.1" },
          { user: "bob", from: "10.9.0.1" },
        ]),
      ]),
    )
    expect(byKind(t.nodes, "lone-sources")).toHaveLength(0)
    expect(byKind(t.nodes, "phantom-host")).toHaveLength(1)
    expect(edgesOf(t.edges, "logged-from")).toHaveLength(2)
  })

  it("never collapses a known host used as a source", () => {
    // jumpbox is a real enumerated host, not a phantom — leave it alone even
    // when it's the lone source for one account.
    const t = collapsePhantomHosts(
      deriveTopology([
        loginHost("h1", "jumpbox", "10.0.0.1/24", []),
        loginHost("h2", "target", "10.0.0.2/24", [
          { user: "alice", from: "10.0.0.1" },
          { user: "alice", from: "10.0.0.1" },
        ]),
      ]),
    )
    expect(byKind(t.nodes, "lone-sources")).toHaveLength(0)
    expect(byKind(t.nodes, "phantom-host")).toHaveLength(0)
  })

  it("collapses independently per identity", () => {
    const t = collapsePhantomHosts(
      deriveTopology([
        loginHost("h1", "target", "10.0.0.1/24", [
          { user: "alice", from: "10.9.0.1" },
          { user: "alice", from: "10.9.0.2" },
          { user: "bob", from: "10.9.1.1" },
          { user: "bob", from: "10.9.1.2" },
        ]),
      ]),
    )
    const lone = byKind(t.nodes, "lone-sources")
    expect(lone).toHaveLength(2)
    expect(lone.every((n) => n.labels.length === 2)).toBe(true)
  })

  it("returns the topology unchanged when nothing collapses", () => {
    const t = deriveTopology([
      loginHost("h1", "target", "10.0.0.1/24", [{ user: "alice", from: "10.9.0.1" }]),
    ])
    expect(collapsePhantomHosts(t)).toBe(t)
  })
})
