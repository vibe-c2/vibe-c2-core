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
const identityId = (user: string) => `identity:${user}`
const phantomHostId = (label: string) => `ph:${label}`

// Accounts that ship on virtually every box (or every box of a given distro/
// cloud image), so "same username on two hosts" is NOT evidence of credential
// reuse for them — every Linux host trivially shares `root`. The identity lens
// still links them by default (an operator may have set a shared password), but
// a toggle hides them so the genuinely interesting accounts stand out. Matched
// case-insensitively.
const WELL_KNOWN_ACCOUNTS = new Set([
  "root",
  "admin",
  "administrator",
  "user",
  "guest",
  "ubuntu",
  "debian",
  "centos",
  "fedora",
  "ec2-user",
  "azureuser",
  "vagrant",
  "pi",
  "nobody",
  "daemon",
  "www-data",
  "postgres",
  "mysql",
  "sshd",
  "systemd-network",
])

export function isWellKnownAccount(user: string): boolean {
  return WELL_KNOWN_ACCOUNTS.has(user.trim().toLowerCase())
}

// One row of an aggregated leaf-subnets node: which interface puts the host
// on which subnet. Carries the ip so the detail the merged membership-edge
// labels used to show survives the merge.
export type LeafSubnetEntry = { cidr: string; iface: string; ip: string }

export type TopoNode =
  | { kind: "host"; id: string; host: HostFieldsFragment }
  | { kind: "subnet"; id: string; cidr: string; hostIds: string[] }
  | { kind: "phantom-gateway"; id: string; ip: string }
  | { kind: "phantom-subnet"; id: string; cidr: string }
  // Identity layer (logins). An identity is a username seen on one or more
  // hosts; wellKnown flags the ubiquitous accounts the lens can hide.
  | { kind: "identity"; id: string; user: string; wellKnown: boolean }
  // A login source (`from`) that resolves to no enumerated host — a machine
  // someone pivoted from but that isn't mapped yet. The host analog of a
  // phantom gateway.
  | { kind: "phantom-host"; id: string; label: string }
  // Produced only by collapseLeafSubnets (aggregate.ts), never by the raw
  // derivation: a host's single-member subnets folded into one list node.
  | { kind: "leaf-subnets"; id: string; hostId: string; entries: LeafSubnetEntry[] }
  // Produced only by collapsePhantomHosts (aggregate.ts): an identity's lone
  // ghost sources (each tied only to that one identity) folded into one list
  // node — the users-lens analog of leaf-subnets.
  | { kind: "lone-sources"; id: string; identityId: string; labels: string[] }

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
  | {
      // Identity → host: this account was seen logged into this host. Direction
      // (and the animation) reads "the user lands on the host".
      kind: "logged-into"
      id: string
      source: string // identity id
      target: string // host id
    }
  | {
      // Source host → identity: this account's session originated here. Chained
      // with logged-into, the flow reads sourceHost → user → accessedHost.
      kind: "logged-from"
      id: string
      source: string // host id or phantom-host id
      target: string // identity id
    }
  | {
      // Produced only by collapsePhantomHosts: replaces the per-source
      // logged-from edges of an identity's lone ghost sources. Source is the
      // merged lone-sources node, target the identity it feeds.
      kind: "logged-from-group"
      id: string
      source: string // lone-sources node id
      target: string // identity id
    }

export type TopologyStats = {
  hosts: number
  subnets: number
  pivots: number
  phantomGateways: number
  phantomSubnets: number
  identities: number
  phantomHosts: number
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

  // 4. Identity layer from login footprints. A username becomes one identity
  //    node shared across every host it appears on (that sharing is the
  //    credential-reuse signal). A login's `from` resolves to a known host
  //    (via interface IP or hostname) or, failing that, a phantom host — a
  //    source someone pivoted from that we haven't enumerated.
  const hostByName = new Map<string, string>() // lowercased hostname -> host id
  for (const h of hosts) {
    const name = h.hostname.trim().toLowerCase()
    // First writer wins, mirroring the ipOwner index: if two hosts claim the
    // same hostname the source is ambiguous anyway, so resolve by input order.
    if (name && !hostByName.has(name)) hostByName.set(name, h.id)
  }

  const identities = new Map<string, { user: string; wellKnown: boolean }>()
  const phantomHosts = new Map<string, string>() // id -> label
  const identityEdges: TopoEdge[] = []
  const edgeSeen = new Set<string>() // dedupe edge ids across repeated footprints

  for (const h of hosts) {
    for (const l of h.logins ?? []) {
      const user = l.user.trim()
      if (!user) continue
      const iid = identityId(user)
      if (!identities.has(iid)) {
        identities.set(iid, { user, wellKnown: isWellKnownAccount(user) })
      }

      // logged-into: identity -> this host.
      const intoId = `li:${iid}->${h.id}`
      if (!edgeSeen.has(intoId)) {
        edgeSeen.add(intoId)
        identityEdges.push({
          kind: "logged-into",
          id: intoId,
          source: iid,
          target: h.id,
        })
      }

      // logged-from: source host (or phantom) -> identity.
      const from = l.from.trim()
      if (!from) continue
      // Resolve the source against host IPs first, then hostnames. hostAddr
      // tolerates a CIDR (defensive — `last` emits bare IPs/hostnames), and the
      // name lookup always uses the raw `from`, never the IP-stripped form.
      const ownerId =
        ipOwner.get(hostAddr(from) ?? from) ?? hostByName.get(from.toLowerCase())
      let sourceId: string
      if (ownerId) {
        sourceId = ownerId
      } else {
        const phid = phantomHostId(from)
        phantomHosts.set(phid, from)
        sourceId = phid
      }
      const fromId = `lf:${sourceId}->${iid}`
      if (!edgeSeen.has(fromId)) {
        edgeSeen.add(fromId)
        identityEdges.push({
          kind: "logged-from",
          id: fromId,
          source: sourceId,
          target: iid,
        })
      }
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
    ...[...identities].map<TopoNode>(([id, v]) => ({
      kind: "identity",
      id,
      user: v.user,
      wellKnown: v.wellKnown,
    })),
    ...[...phantomHosts].map<TopoNode>(([id, label]) => ({
      kind: "phantom-host",
      id,
      label,
    })),
  ]

  const edges: TopoEdge[] = [...membership.values(), ...pivots, ...identityEdges]

  return {
    nodes,
    edges,
    stats: {
      hosts: hosts.length,
      subnets: subnets.size,
      pivots: pivots.filter((e) => e.kind === "pivot").length,
      phantomGateways: phantomGateways.size,
      phantomSubnets: phantomSubnets.size,
      identities: identities.size,
      phantomHosts: phantomHosts.size,
    },
  }
}
