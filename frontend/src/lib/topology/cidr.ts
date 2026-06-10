import ipaddr from "ipaddr.js"

// Thin, defensive wrappers over ipaddr.js. The backend (net.ParseCIDR) is the
// authoritative validator — these exist only so the topology derivation can
// group addresses into subnets and resolve gateways without crashing on the
// occasional malformed legacy row. Every function returns null/false rather
// than throwing, so a single bad address can never blow up the graph.

export function isValidCidr(value: string): boolean {
  try {
    ipaddr.parseCIDR(value.trim())
    return true
  } catch {
    return false
  }
}

// True if `value` is a bare IPv4/IPv6 address (no prefix). Used to validate
// route gateways pasted from `ip ro` output before they reach the form.
export function isValidIp(value: string): boolean {
  try {
    ipaddr.parse(value.trim())
    return true
  } catch {
    return false
  }
}

// Normalizes a CIDR to its canonical network identity:
//   "10.0.5.12/24" -> "10.0.5.0/24"
// This string is the subnet node's stable id, so every host on a segment
// collapses onto one subnet regardless of its own host bits. Returns null on
// malformed input. Works for IPv4 and IPv6 (backend allows both).
export function networkKey(cidr: string): string | null {
  try {
    const [addr, prefix] = ipaddr.parseCIDR(cidr.trim())
    const masked = maskBytes(addr.toByteArray(), prefix)
    return `${ipaddr.fromByteArray(masked).toString()}/${prefix}`
  } catch {
    return null
  }
}

// Strips the prefix off an address, returning the canonical host string:
//   "10.0.5.12/24" -> "10.0.5.12"   |   "10.0.5.12" -> "10.0.5.12"
// Used to index interface IPs and normalize route gateways. Null on bad input.
export function hostAddr(value: string): string | null {
  const v = value.trim()
  try {
    if (v.includes("/")) return ipaddr.parseCIDR(v)[0].toString()
    return ipaddr.parse(v).toString()
  } catch {
    return null
  }
}

// Zero every bit past `prefix`, byte by byte — the network mask. Bytes wholly
// inside the prefix pass through; bytes wholly outside become 0; the straddling
// byte is masked at the bit boundary.
function maskBytes(bytes: number[], prefix: number): number[] {
  return bytes.map((b, i) => {
    const bitsBefore = i * 8
    if (prefix >= bitsBefore + 8) return b
    if (prefix <= bitsBefore) return 0
    const keep = prefix - bitsBefore
    return b & ((0xff << (8 - keep)) & 0xff)
  })
}
