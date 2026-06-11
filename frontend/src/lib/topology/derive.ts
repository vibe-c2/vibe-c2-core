import type { HostFieldsFragment } from "@/graphql/gql/graphql"
import { hostAddr, isValidCidr, networkKey } from "@/lib/topology/cidr"

// Pure network-topology derivation. Given the operation's full host set, it
// computes a graph purely from the structured interface/route data — no manual
// input, no backend call. The table is the source of truth; this is a view of
// it. The function is deliberately framework-free (returns a plain domain
// model, no React Flow types) so it can be unit-tested in isolation; the layout
// layer maps this model onto the canvas.
//
// Why each derived piece matters on an engagement:
//   - subnet nodes      group hosts onto the segments they actually share.
//   - membership edges   "host X sits on segment Y via interface Z".
//   - pivot edges        "host A reaches elsewhere THROUGH host B" — pivots.
//   - phantom gateways   a router referenced by a route but not yet enumerated
//                        — a lead worth chasing.
//   - phantom subnets    a network reachable through a known pivot but with no
//                        known hosts — where to look next.

// IPv4 / IPv6 default routes — these are egress, not a destination subnet.
const DEFAULT_ROUTES = new Set(["0.0.0.0/0", "::/0"])

const subnetId = (net: string) => `subnet:${net}`
const phantomSubnetId = (net: string) => `ps:${net}`
const phantomGatewayId = (ip: string) => `pg:${ip}`

// One row of an aggregated leaf-subnets node: which interface puts the host
// on which subnet. Carries the ip so the detail the merged membership-edge
// labels used to show survives the merge.
export type LeafSubnetEntry = { cidr: string; iface: string; ip: string }

export type TopoNode =
  | { kind: "host"; id: string; host: HostFieldsFragment }
  | { kind: "subnet"; id: string; cidr: string; hostIds: string[] }
  | { kind: "phantom-gateway"; id: string; ip: string }
  | { kind: "phantom-subnet"; id: string; cidr: string }
  // Produced only by collapseLeafSubnets (aggregate.ts), never by the raw
  // derivation: a host's single-member subnets folded into one list node.
  | { kind: "leaf-subnets"; id: string; hostId: string; entries: LeafSubnetEntry[] }

// All edges carry source/target node ids so the layout maps them onto React
// Flow edges with no translation.
export type TopoEdge =
  | {
      kind: "membership"
      id: string
      source: string // host id
      target: string // subnet id
      iface: string
      ip: string
    }
  | {
      kind: "pivot"
      id: string
      source: string // host id (route owner)
      target: string // gateway host id
      isDefault: boolean
      destLabel: string | null
    }
  | {
      kind: "pivot-unknown"
      id: string
      source: string // host id (route owner)
      target: string // phantom-gateway id
      isDefault: boolean
      destLabel: string | null
    }
  | {
      kind: "reaches"
      id: string
      source: string // gateway host id
      target: string // phantom-subnet id
    }
  | {
      // Produced only by collapseLeafSubnets: replaces the per-interface
      // membership edges of the merged subnets. Unlabeled — the iface/cidr
      // detail lives inside the leaf-subnets node it points at.
      kind: "membership-group"
      id: string
      source: string // host id
      target: string // leaf-subnets node id
    }

export type TopologyStats = {
  hosts: number
  subnets: number
  pivots: number
  phantomGateways: number
  phantomSubnets: number
}

export type Topology = {
  nodes: TopoNode[]
  edges: TopoEdge[]
  stats: TopologyStats
}

export function deriveTopology(hosts: HostFieldsFragment[]): Topology {
  // 1. IP index: every interface IP -> its owning host. First writer wins so
  //    duplicate IPs across hosts (bad data) resolve deterministically by input
  //    order rather than crashing or flapping.
  const ipOwner = new Map<string, string>()
  for (const h of hosts) {
    for (const iface of h.interfaces) {
      for (const a of iface.addresses) {
        const ip = hostAddr(a)
        if (ip && !ipOwner.has(ip)) ipOwner.set(ip, h.id)
      }
    }
  }

  // 2. Subnets + membership edges. A subnet is the masked network of an
  //    interface CIDR; hosts sharing it collapse onto one node.
  const subnets = new Map<string, { cidr: string; hostIds: string[] }>()
  // Keyed by host+subnet+iface so a host listing two addresses in one subnet on
  // one interface yields a single edge (and never a duplicate React Flow id).
  const membership = new Map<string, TopoEdge>()

  for (const h of hosts) {
    for (const iface of h.interfaces) {
      for (const a of iface.addresses) {
        const net = networkKey(a)
        if (!net) continue // skip malformed legacy rows, never throw
        const sid = subnetId(net)
        const entry = subnets.get(sid) ?? { cidr: net, hostIds: [] }
        if (!entry.hostIds.includes(h.id)) entry.hostIds.push(h.id)
        subnets.set(sid, entry)

        const key = `${h.id}|${sid}|${iface.name}`
        if (!membership.has(key)) {
          membership.set(key, {
            kind: "membership",
            id: `m:${key}`,
            source: h.id,
            target: sid,
            iface: iface.name,
            ip: hostAddr(a) ?? a.trim(),
          })
        }
      }
    }
  }

  // 3. Pivot edges + phantom nodes from gatewayed routes. A route without a
  //    gateway is on-link (membership already covers it) — skip.
  const phantomGateways = new Map<string, string>()
  const phantomSubnets = new Map<string, string>()
  const pivots: TopoEdge[] = []

  for (const h of hosts) {
    for (const r of h.routes) {
      const gw = r.gateway.trim()
      if (!gw) continue

      const dest = r.destination.trim()
      const isDefault = DEFAULT_ROUTES.has(dest)
      const destNet =
        !isDefault && isValidCidr(dest) ? networkKey(dest) : null
      const destLabel = isDefault ? "default" : destNet ?? (dest || null)

      const gwIp = hostAddr(gw) ?? gw
      const ownerId = ipOwner.get(gwIp)

      if (ownerId && ownerId !== h.id) {
        // Known pivot: this host reaches `dest` THROUGH ownerId.
        pivots.push({
          kind: "pivot",
          id: `p:${h.id}:${ownerId}:${dest}`,
          source: h.id,
          target: ownerId,
          isDefault,
          destLabel,
        })
        // If the destination is a real network we've never enumerated, surface
        // it as a phantom hanging off the gateway host — "this known pivot can
        // reach this unmapped subnet".
        if (destNet && !subnets.has(subnetId(destNet))) {
          const psid = phantomSubnetId(destNet)
          phantomSubnets.set(psid, destNet)
          pivots.push({
            kind: "reaches",
            id: `r:${ownerId}:${psid}`,
            source: ownerId,
            target: psid,
          })
        }
      } else if (!ownerId) {
        // Unknown gateway: the router itself is the lead. Don't also spawn a
        // dangling phantom subnet — the ghost gateway is what to enumerate.
        const pgid = phantomGatewayId(gwIp)
        phantomGateways.set(pgid, gwIp)
        pivots.push({
          kind: "pivot-unknown",
          id: `pu:${h.id}:${pgid}:${dest}`,
          source: h.id,
          target: pgid,
          isDefault,
          destLabel,
        })
      }
      // ownerId === h.id: host is its own gateway (odd data) — skip self-loop.
    }
  }

  const nodes: TopoNode[] = [
    ...hosts.map<TopoNode>((h) => ({ kind: "host", id: h.id, host: h })),
    ...[...subnets].map<TopoNode>(([id, v]) => ({
      kind: "subnet",
      id,
      cidr: v.cidr,
      hostIds: v.hostIds,
    })),
    ...[...phantomGateways].map<TopoNode>(([id, ip]) => ({
      kind: "phantom-gateway",
      id,
      ip,
    })),
    ...[...phantomSubnets].map<TopoNode>(([id, cidr]) => ({
      kind: "phantom-subnet",
      id,
      cidr,
    })),
  ]

  const edges: TopoEdge[] = [...membership.values(), ...pivots]

  return {
    nodes,
    edges,
    stats: {
      hosts: hosts.length,
      subnets: subnets.size,
      pivots: pivots.filter((e) => e.kind === "pivot").length,
      phantomGateways: phantomGateways.size,
      phantomSubnets: phantomSubnets.size,
    },
  }
}
