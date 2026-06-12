import { describe, expect, it } from "vitest"
import type { HostFieldsFragment } from "@/graphql/gql/graphql"
import { collapseLeafSubnets } from "@/lib/topology/aggregate"
import { deriveTopology } from "@/lib/topology/derive"
import { matchTopology } from "@/lib/topology/search"

function host(
  id: string,
  hostname: string,
  os: string,
  interfaces: { name?: string; addresses: string[] }[],
  routes: { destination?: string; gateway?: string }[] = [],
): HostFieldsFragment {
  return {
    id,
    operationId: "op1",
    hostname,
    os,
    emoji: "",
    icon: "",
    color: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    createdBy: null,
    interfaces: interfaces.map((i) => ({
      name: i.name ?? "eth0",
      mac: "",
      addresses: i.addresses,
    })),
    routes: routes.map((r) => ({
      destination: r.destination ?? "",
      gateway: r.gateway ?? "",
      interface: "",
    })),
    logins: [],
  }
}

const fixture = deriveTopology([
  host("a", "web-prod-01", "Ubuntu 22.04", [{ addresses: ["10.0.5.10/24"] }]),
  host("b", "dc01", "Windows Server 2022", [
    { name: "eth0", addresses: ["10.0.5.20/24"] },
  ]),
  host("c", "edge", "", [{ addresses: ["10.0.5.30/24"] }], [
    { destination: "172.16.0.0/16", gateway: "10.0.5.254" },
  ]),
])

describe("matchTopology", () => {
  it("matches hostnames case-insensitively", () => {
    expect(matchTopology(fixture, "WEB-PROD")).toEqual(["a"])
  })

  it("matches OS substrings", () => {
    expect(matchTopology(fixture, "windows")).toEqual(["b"])
  })

  it("matches interface IPs and subnet CIDRs", () => {
    expect(matchTopology(fixture, "10.0.5.20")).toEqual(["b"])
    // The /24 subnet node, every host on it, and the phantom gateway at
    // 10.0.5.254 all carry the prefix.
    expect(matchTopology(fixture, "10.0.5.")).toEqual([
      "a",
      "b",
      "c",
      "subnet:10.0.5.0/24",
      "pg:10.0.5.254",
    ])
  })

  it("matches phantom gateways and phantom subnets", () => {
    expect(matchTopology(fixture, "10.0.5.254")).toContain("pg:10.0.5.254")
  })

  it("matches inside aggregated leaf-subnet nodes", () => {
    const t = collapseLeafSubnets(
      deriveTopology([
        host("vpn", "openvpn", "", [
          { name: "tun0", addresses: ["10.8.0.1/24"] },
          { name: "tun7", addresses: ["10.8.7.1/24"] },
        ]),
      ]),
    )
    // The host matches too (it owns tun7) — both are valid jump targets.
    expect(matchTopology(t, "tun7")).toEqual(["vpn", "leaf:vpn"])
    expect(matchTopology(t, "10.8.7")).toEqual(["vpn", "leaf:vpn"])
  })

  it("returns nothing for a blank or whitespace query", () => {
    expect(matchTopology(fixture, "")).toEqual([])
    expect(matchTopology(fixture, "   ")).toEqual([])
  })

  it("returns ids in stable node order for cycling", () => {
    const first = matchTopology(fixture, "10.0.5.")
    const second = matchTopology(fixture, "10.0.5.")
    expect(first).toEqual(second)
  })
})
