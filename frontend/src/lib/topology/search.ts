import type { TopoNode, Topology } from "@/lib/topology/derive"

// Text search over the topology the user is currently looking at. Pure and
// framework-free like the rest of lib/topology: the view feeds it the
// post-lens graph and gets back node ids to highlight/fly to, in node order
// (stable for cycling with Enter).
//
// Case-insensitive substring across everything an operator might paste:
// hostnames, OS strings, interface names, addresses, CIDRs, gateway IPs.
// Substring (not prefix) so "0.5." finds 10.0.5.x without anchoring games.
//
// Wrapping the query in double quotes opts into whole-token matching — the
// same syntax the server-side searches (credentials, hosts, users, hashes)
// understand, see core/pkg/repository/search_pattern.go. "10.0.5.1" matches
// 10.0.5.1 but not 10.0.5.13.

export function matchTopology(t: Topology, query: string): string[] {
  const q = query.trim()
  if (!q) return []
  const matches = buildMatcher(q)
  return t.nodes
    .filter((n) => haystack(n).some(matches))
    .map((n) => n.id)
}

function buildMatcher(q: string): (s: string) => boolean {
  const quoted = q.length >= 3 && q.startsWith('"') && q.endsWith('"')
  if (quoted) {
    const rx = wordBoundedRegex(q.slice(1, -1))
    return (s) => rx.test(s)
  }
  const lower = q.toLowerCase()
  return (s) => s.toLowerCase().includes(lower)
}

// Anchors the term with \b only next to word characters — against a non-word
// edge (e.g. a term ending in ".") \b would invert its meaning, so that side
// stays unanchored. Mirrors wordBounded() on the Go side.
function wordBoundedRegex(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const lead = /^\w/.test(term) ? "\\b" : ""
  const trail = /\w$/.test(term) ? "\\b" : ""
  return new RegExp(lead + escaped + trail, "i")
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
    case "local-identities":
      return n.users
  }
}
