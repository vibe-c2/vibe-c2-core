import type { TopoNode, Topology } from "@/lib/topology/derive"

// Text search over the topology the user is currently looking at. Pure and
// framework-free like the rest of lib/topology: the view feeds it the
// post-lens graph and gets back node ids to highlight/fly to, in node order
// (stable for cycling with Enter).
//
// Case-insensitive substring across everything an operator might paste:
// hostnames, OS strings, interface names, addresses, CIDRs, gateway IPs.
// Substring (not prefix) so "0.5." finds 10.0.5.x without anchoring games.

export function matchTopology(t: Topology, query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return t.nodes
    .filter((n) => haystack(n).some((s) => s.toLowerCase().includes(q)))
    .map((n) => n.id)
}

function haystack(n: TopoNode): string[] {
  switch (n.kind) {
    case "host":
      return [
        n.host.hostname,
        n.host.os ?? "",
        ...n.host.interfaces.flatMap((i) => [i.name, ...i.addresses]),
      ]
    case "subnet":
      return [n.cidr]
    case "phantom-gateway":
      return [n.ip]
    case "phantom-subnet":
      return [n.cidr]
    case "leaf-subnets":
      return n.entries.flatMap((e) => [e.cidr, e.iface, e.ip])
    case "identity":
      return [n.user]
    case "phantom-host":
      return [n.label]
    case "lone-sources":
      return n.labels
  }
}
