import type {
  LeafSubnetEntry,
  TopoEdge,
  TopoNode,
  Topology,
} from "@/lib/topology/derive"

// Leaf-subnet aggregation. Motivating case: a VPN concentrator with ten tun
// interfaces, each on its own /24 with no other known hosts. As-is the
// subnets lens renders ten subnet pills orbiting one host — pure noise. A
// subnet with exactly one member host carries no *relational* information
// (it connects nothing to anything), so all such subnets of a host collapse
// into a single "leaf-subnets" list node hanging off that host.
//
// Pure Topology → Topology transform, same contract as the view lenses: the
// raw derivation is untouched, stats pass through (the legend keeps counting
// real subnets), and the result is deterministic for a given input order.

// A lone leaf subnet is left as a normal pill: merging one node into one node
// saves nothing and would just make that host render differently from the
// rest of the map.
export const MIN_LEAF_SUBNETS = 2

const leafNodeId = (hostId: string) => `leaf:${hostId}`

export function collapseLeafSubnets(t: Topology): Topology {
  // Subnets with exactly one member host, grouped by that host.
  const leafIdsByHost = new Map<string, string[]>()
  for (const n of t.nodes) {
    if (n.kind !== "subnet" || n.hostIds.length !== 1) continue
    const hostId = n.hostIds[0]
    const ids = leafIdsByHost.get(hostId) ?? []
    ids.push(n.id)
    leafIdsByHost.set(hostId, ids)
  }

  // Only hosts that crossed the threshold actually collapse. Built in
  // leafIdsByHost order, which follows node input order — so the appended
  // leaf nodes come out in a stable, deterministic order.
  const collapsible = new Map<string, string[]>()
  const collapsed = new Set<string>()
  for (const [hostId, ids] of leafIdsByHost) {
    if (ids.length < MIN_LEAF_SUBNETS) continue
    collapsible.set(hostId, ids)
    for (const id of ids) collapsed.add(id)
  }
  if (collapsed.size === 0) return t

  const cidrBySubnetId = new Map<string, string>()
  for (const n of t.nodes) {
    if (n.kind === "subnet") cidrBySubnetId.set(n.id, n.cidr)
  }

  // The merged node's rows come from the membership edges being replaced, so
  // the iface/ip detail those edge labels carried survives the merge. A host
  // with two interfaces on one leaf subnet contributes one row per edge.
  const entriesByHost = new Map<string, LeafSubnetEntry[]>()
  for (const e of t.edges) {
    if (e.kind !== "membership" || !collapsed.has(e.target)) continue
    const entries = entriesByHost.get(e.source) ?? []
    entries.push({
      cidr: cidrBySubnetId.get(e.target) ?? "",
      iface: e.iface,
      ip: e.ip,
    })
    entriesByHost.set(e.source, entries)
  }

  const nodes: TopoNode[] = t.nodes.filter((n) => !collapsed.has(n.id))
  const edges: TopoEdge[] = t.edges.filter(
    (e) => !(e.kind === "membership" && collapsed.has(e.target)),
  )

  for (const [hostId] of collapsible) {
    const entries = entriesByHost.get(hostId) ?? []
    // tun2 before tun10: numeric-aware sort keeps long interface lists sane.
    entries.sort(
      (a, b) =>
        a.iface.localeCompare(b.iface, undefined, { numeric: true }) ||
        a.cidr.localeCompare(b.cidr, undefined, { numeric: true }),
    )
    const id = leafNodeId(hostId)
    nodes.push({ kind: "leaf-subnets", id, hostId, entries })
    edges.push({ kind: "membership-group", id: `mg:${hostId}`, source: hostId, target: id })
  }

  return { ...t, nodes, edges }
}
