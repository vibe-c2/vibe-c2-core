import { describe, expect, it } from "vitest"
import type { HostFieldsFragment } from "@/graphql/gql/graphql"
import { collapseLeafSubnets } from "@/lib/topology/aggregate"
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
