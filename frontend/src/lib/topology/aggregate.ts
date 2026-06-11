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

// Lone-source aggregation — the users-lens analog of collapseLeafSubnets.
// Motivating case: an identity logged in from a dozen unknown machines, each
// seen only for that one account. As-is the lens renders a dozen ghost-host
// pills fanning off one identity — pure noise. A phantom host tied to exactly
// one identity links nothing to anything, so all such lone sources of an
// identity collapse into a single "lone-sources" list node hanging off it.
// Real hosts and phantom hosts that feed two or more identities stay as nodes
// (those genuinely relate accounts) and are never touched.
//
// Same Topology → Topology contract as collapseLeafSubnets: pure, stats pass
// through, deterministic for a given input order.

// A single lone source stays a normal pill — merging one into one saves nothing.
export const MIN_LONE_SOURCES = 2

const loneSourcesNodeId = (identityId: string) => `sources:${identityId}`

export function collapsePhantomHosts(t: Topology): Topology {
  // Edge degree of each phantom host. Exactly one logged-from edge means it
  // points at exactly one identity (phantom hosts have no other edge kind).
  const phantomLabel = new Map<string, string>()
  for (const n of t.nodes) {
    if (n.kind === "phantom-host") phantomLabel.set(n.id, n.label)
  }
  const degree = new Map<string, number>()
  for (const e of t.edges) {
    if (e.kind !== "logged-from" || !phantomLabel.has(e.source)) continue
    degree.set(e.source, (degree.get(e.source) ?? 0) + 1)
  }

  // Lone phantom sources grouped by the one identity they feed. Built in edge
  // order (which follows node/derivation order) for a deterministic result.
  const loneByIdentity = new Map<string, string[]>() // identityId -> phantom ids
  for (const e of t.edges) {
    if (e.kind !== "logged-from" || !phantomLabel.has(e.source)) continue
    if (degree.get(e.source) !== 1) continue
    const ids = loneByIdentity.get(e.target) ?? []
    ids.push(e.source)
    loneByIdentity.set(e.target, ids)
  }

  const collapsible = new Map<string, string[]>()
  const collapsed = new Set<string>()
  for (const [identityId, ids] of loneByIdentity) {
    if (ids.length < MIN_LONE_SOURCES) continue
    collapsible.set(identityId, ids)
    for (const id of ids) collapsed.add(id)
  }
  if (collapsed.size === 0) return t

  const nodes: TopoNode[] = t.nodes.filter((n) => !collapsed.has(n.id))
  const edges: TopoEdge[] = t.edges.filter(
    (e) => !(e.kind === "logged-from" && collapsed.has(e.source)),
  )

  for (const [identityId, ids] of collapsible) {
    const labels = ids.map((id) => phantomLabel.get(id) ?? "")
    labels.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    const id = loneSourcesNodeId(identityId)
    nodes.push({ kind: "lone-sources", id, identityId, labels })
    edges.push({
      kind: "logged-from-group",
      id: `lfg:${identityId}`,
      source: id,
      target: identityId,
    })
  }

  return { ...t, nodes, edges }
}
