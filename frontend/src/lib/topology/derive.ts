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
export const WELL_KNOWN_ACCOUNTS = new Set([
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
  // Produced only by collapseLocalIdentities (aggregate.ts): a host's
  // single-host accounts (each seen only on this one host, relating it to
  // nothing) folded into one list node — the bipartite dual of leaf-subnets on
  // the users lens. What stays a standalone pill is exactly the shared accounts
  // that wire hosts together, which is the whole point of the lens.
  | { kind: "local-identities"; id: string; hostId: string; users: string[] }

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
      // The source node ids (host or phantom-host) this account's sessions on
      // THIS host originated from. The raw login records pair (from, user,
      // host) per footprint, but the graph splits that triple across two
      // deduped edges — these arrays preserve the pairing so edge focus can
      // light the actual travel path, not the identity's whole neighborhood.
      sourceIds: string[]
    }
  | {
      // Source host → identity: this account's session originated here. Chained
      // with logged-into, the flow reads sourceHost → user → accessedHost.
      kind: "logged-from"
      id: string
      source: string // host id or phantom-host id
      target: string // identity id
      // Host ids this account logged INTO from this source — the other half of
      // the per-footprint pairing (see logged-into.sourceIds).
      targetIds: string[]
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
  | {
      // Produced only by collapseLocalIdentities: replaces the logged-into (and
      // any same-host logged-from) edges of a host's collapsed local accounts.
      // Source is the merged local-identities node, target the host it sits on.
      kind: "local-group"
      id: string
      source: string // local-identities node id
      target: string // host id
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
  // Dedupe maps double as accumulators: a repeated footprint of the same pair
  // extends the existing edge's pairing array instead of duplicating the edge.
  const intoById = new Map<string, Extract<TopoEdge, { kind: "logged-into" }>>()
  const fromById = new Map<string, Extract<TopoEdge, { kind: "logged-from" }>>()

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
      let into = intoById.get(intoId)
      if (!into) {
        into = {
          kind: "logged-into",
          id: intoId,
          source: iid,
          target: h.id,
          sourceIds: [],
        }
        intoById.set(intoId, into)
        identityEdges.push(into)
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
      let fromEdge = fromById.get(fromId)
      if (!fromEdge) {
        fromEdge = {
          kind: "logged-from",
          id: fromId,
          source: sourceId,
          target: iid,
          targetIds: [],
        }
        fromById.set(fromId, fromEdge)
        identityEdges.push(fromEdge)
      }
      // Record the (source, user, host) triple on both halves of the pairing.
      if (!into.sourceIds.includes(sourceId)) into.sourceIds.push(sourceId)
      if (!fromEdge.targetIds.includes(h.id)) fromEdge.targetIds.push(h.id)
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

// Users lens only: drop identities whose username is in `hidden` (normalized,
// lowercased — built-in well-known set and/or the operator's custom list) and
// any edges touching them. A phantom (unknown-source) host whose only edges led
// to a hidden account is now an artifact, so prune the disconnected ones. Real
// host nodes are always kept as anchors even when isolated — consistent with
// how the routes/subnets lenses leave lone hosts on the canvas.
export function withoutHiddenIdentities(
  t: Topology,
  hidden: ReadonlySet<string>,
): Topology {
  if (hidden.size === 0) return t

  const hiddenIds = new Set(
    t.nodes
      .filter(
        (n) => n.kind === "identity" && hidden.has(n.user.trim().toLowerCase()),
      )
      .map((n) => n.id),
  )
  if (hiddenIds.size === 0) return t

  const edges = t.edges.filter(
    (e) => !hiddenIds.has(e.source) && !hiddenIds.has(e.target),
  )
  const connected = new Set(edges.flatMap((e) => [e.source, e.target]))
  const nodes = t.nodes.filter(
    (n) =>
      !hiddenIds.has(n.id) &&
      (n.kind !== "phantom-host" || connected.has(n.id)),
  )
  return { ...t, nodes, edges }
}
