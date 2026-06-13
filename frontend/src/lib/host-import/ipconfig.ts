import { isValidIp, maskToPrefix } from "@/lib/topology/cidr"
import {
  demoteToSkipped,
  isNoiseAddress,
  segmentLine,
  skippedLine,
  type ParsedInterface,
  type ParsedLine,
  type ParsedRoute,
  type SegRole,
  type SubParse,
} from "@/lib/host-import/model"
import {
  ADAPTER_KEYWORDS,
  IPCONFIG_KEY_ALIASES,
  MEDIA_DISCONNECTED_KEYWORDS,
  TUNNEL_KEYWORDS,
} from "@/lib/host-import/ipconfig-locales"

// Sub-parser for Windows `ipconfig` / `ipconfig /all` output. Plugged into
// parseCommandOutput (parse.ts), which owns command detection and dispatch.

// A non-indented section header, ending in ":" — "Ethernet adapter X:" in
// English, "Адаптер Ethernet X:" in Russian. The localized "adapter" keyword
// (ipconfig-locales.ts) splits type from name; the global banner ("Windows IP
// Configuration") has no trailing colon, so it never matches.
const ADAPTER_HEADER_RE = /^(\S[^:]*):\s*$/

// `   Key . . . . : value` — an indented field line. The dotted leader and the
// colon separate key from value; the value (and the colon's trailing space) is
// optional ("Default Gateway . . . :" with no gateway). Lazy key + the [ .]*
// leader keep colons inside the value (timestamps, IPv6) out of the key.
const FIELD_RE = /^(\s+)(\S[^:]*?)[ .]*:(?:\s(.*))?$/

// Host-side virtual adapters, the Windows analogue of docker0/virbr0: Hyper-V
// vSwitch/WSL (vEthernet ...), VMware/VirtualBox host-only NICs, OpenVPN TAP,
// Npcap/Microsoft loopback. Their subnets are host-local and collide across
// hosts, so they're recognized but never imported — same policy as `ip a`.
// `vEthernet` is matched anywhere (not anchored): a localized header keeps the
// type word, so the name reads "Ethernet vEthernet (...)" on a Russian host.
const VIRTUAL_ADAPTER_NAME_RE = /\bvEthernet\b/i
// NIC driver descriptions stay in vendor English even on a localized Windows,
// so this match survives translation.
const VIRTUAL_ADAPTER_DESC_RE =
  /hyper-v virtual|vmware virtual|virtualbox host-only|tap-windows|loopback adapter/i

// Translate a localized field label to its canonical English key (identity for
// English and any unrecognized label, which then falls through as noise).
function canonicalKey(rawKey: string): string {
  const norm = rawKey.trim().toLowerCase().replace(/\s+/g, " ")
  return IPCONFIG_KEY_ALIASES[norm] ?? norm
}

// Parse an adapter-section header into its display name and whether it's an
// excluded (tunnel / host-virtual) section. Splits at the localized "adapter"
// keyword: text before it is the type part (English "Ethernet adapter", Russian
// "Адаптер" leads), text after it is the section name. Falls back to the whole
// header as the name for an unrecognized display language, so an unknown locale
// still segments into sections rather than collapsing fields together.
function parseAdapterHeader(raw: string): { name: string; excluded: boolean } | null {
  const m = ADAPTER_HEADER_RE.exec(raw)
  if (!m) return null
  const head = m[1].trim()
  const lower = head.toLowerCase()

  let kwIdx = -1
  let kwLen = 0
  for (const kw of ADAPTER_KEYWORDS) {
    const i = lower.indexOf(kw)
    if (i >= 0) {
      kwIdx = i
      kwLen = kw.length
      break
    }
  }

  if (kwIdx < 0) return { name: head, excluded: false }

  const before = lower.slice(0, kwIdx)
  const after = head.slice(kwIdx + kwLen).trim()
  const name = after || head
  const isTunnel = TUNNEL_KEYWORDS.some((kw) => before.includes(kw))
  return { name, excluded: isTunnel || VIRTUAL_ADAPTER_NAME_RE.test(name) }
}

// A locally-significant MAC after normalization: 6 colon-separated octets.
// Tunnel adapters print 8-octet pseudo-MACs (00-00-00-00-00-00-00-E0) that
// must never reach the form.
const MAC_RE = /^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/

// Strips ipconfig's parenthesized state suffix ("10.0.0.5(Preferred)",
// "(Deprecated)", "(Duplicate)") and an IPv6 zone index ("fe80::1%12").
function cleanWinAddress(value: string): string {
  return value.replace(/\([^)]*\)\s*$/, "").replace(/%\w+$/, "")
}

// `ipconfig /all` is key-value per adapter section, which makes it the one
// command that yields several categories at once: interfaces, their
// default-gateway routes (the pivot signal), and the machine's host name.
// Structural quirks handled here, in contrast to `ip a`:
//   - The IPv4 address and its subnet mask are SEPARATE lines; they're paired
//     statefully (`pendingV4`) and glued into a CIDR via maskToPrefix.
//   - Multi-value fields (Default Gateway with IPv6+IPv4, DNS Servers)
//     continue on key-less indented lines; `currentKey` carries the context.
//   - Field labels are localized: each is translated to a canonical key via
//     ipconfig-locales.ts (English + Russian today). An unknown display
//     language degrades gracefully — sections still segment, every field
//     renders as skipped, and nothing imports (0 used) rather than erroring.
export function parseIpconfig(output: string[]): SubParse {
  const lines: ParsedLine[] = []
  const interfaces: ParsedInterface[] = []
  const routes: ParsedRoute[] = []
  let hostname = ""
  let errorCount = 0
  let skippedCount = 0

  // The adapter section currently being read. Like `ip a`'s accumulator, its
  // name/mac/address lines are tagged "used" optimistically (`tentative`) and
  // demoted if the adapter is dropped. Route lines are tracked separately:
  // a real gateway survives even when the adapter itself ends up address-less.
  let cur: {
    iface: ParsedInterface
    excluded: boolean
    tentative: ParsedLine[]
    routes: ParsedRoute[]
    routeLines: ParsedLine[]
  } | null = null

  // IPv4 address waiting for the Subnet Mask line that follows it. `noise`
  // (excluded adapter or APIPA/loopback address) keeps the pair renderable as
  // skipped while still consuming the mask line.
  let pendingV4: { addr: string; noise: boolean; line: ParsedLine } | null = null

  // Last field key seen, so key-less continuation lines inherit its meaning.
  let currentKey = ""

  // A pending IPv4 that never met its mask can't become a CIDR — retroactively
  // flag the address line as the error (mirrors ip a's blocking semantics).
  const failPendingV4 = () => {
    if (!pendingV4) return
    if (!pendingV4.noise) {
      pendingV4.line.error = "IPv4 address has no Subnet Mask line below it."
      pendingV4.line.segments = pendingV4.line.segments.map((s) =>
        s.role === "used" ? { ...s, role: "error" } : s,
      )
      errorCount++
    }
    pendingV4 = null
  }

  // Flip the current adapter to excluded mid-section (Media disconnected, or a
  // virtual Description arriving after the header) and un-green its lines.
  const exclude = () => {
    if (!cur || cur.excluded) return
    cur.excluded = true
    demoteToSkipped(cur.tentative)
    demoteToSkipped(cur.routeLines)
    cur.tentative = []
    cur.routes = []
    cur.routeLines = []
  }

  // Commit (or drop) the current adapter, exactly like ip a's flush: excluded
  // or address-less adapters are dropped and demoted, counted as skipped.
  // Routes are kept for any non-excluded adapter.
  const flush = () => {
    failPendingV4()
    if (!cur) return
    if (!cur.excluded && cur.iface.addresses.length > 0) {
      interfaces.push(cur.iface)
    } else {
      demoteToSkipped(cur.tentative)
      skippedCount++
    }
    if (!cur.excluded) routes.push(...cur.routes)
    cur = null
  }

  // Build a line whose only highlighted span is `text` (a substring of raw,
  // located from the end — values always trail the dotted key).
  const valueLine = (
    raw: string,
    text: string,
    role: SegRole,
    error?: string,
  ): ParsedLine => {
    const start = raw.lastIndexOf(text)
    if (text.length === 0 || start === -1) return skippedLine(raw)
    return {
      raw,
      segments: segmentLine(raw, [{ start, end: start + text.length, role }]),
      error,
    }
  }

  // A Default Gateway value (keyed or continuation). Empty / unspecified
  // (0.0.0.0, ::) means "no gateway"; link-local IPv6 gateways carry no pivot
  // signal (same policy as fe80 addresses); anything else becomes a default
  // route through this adapter.
  const handleGateway = (raw: string, value: string) => {
    // Error/skipped spans cover the original token; the used span covers only
    // the cleaned IP so a trailing state suffix never renders green.
    const gw = cleanWinAddress(value)
    if (!isValidIp(gw)) {
      lines.push(valueLine(raw, value, "error", `Not a valid gateway IP: ${value}`))
      errorCount++
      return
    }
    const unusable =
      !cur || cur.excluded || gw === "0.0.0.0" || gw === "::" || isNoiseAddress(gw)
    if (unusable) {
      lines.push(valueLine(raw, value, "skipped"))
      return
    }
    const line = valueLine(raw, gw, "used")
    lines.push(line)
    cur!.routes.push({
      destination: gw.includes(":") ? "::/0" : "0.0.0.0/0",
      gateway: gw,
      interface: cur!.iface.name,
    })
    cur!.routeLines.push(line)
  }

  for (const raw of output) {
    if (raw.trim().length === 0) {
      currentKey = ""
      lines.push(skippedLine(raw))
      continue
    }

    // Non-indented lines: adapter headers or prose banners ("Windows IP
    // Configuration") — fields are always indented.
    if (!/^\s/.test(raw)) {
      const header = parseAdapterHeader(raw)
      if (header) {
        flush()
        currentKey = ""
        cur = {
          iface: { name: header.name, mac: "", addresses: [] },
          excluded: header.excluded,
          tentative: [],
          routes: [],
          routeLines: [],
        }
        const headerLine = valueLine(raw, header.name, header.excluded ? "skipped" : "used")
        lines.push(headerLine)
        if (!header.excluded) cur.tentative.push(headerLine)
      } else {
        lines.push(skippedLine(raw))
      }
      continue
    }

    const field = FIELD_RE.exec(raw)
    if (!field) {
      // Indented, key-less: a continuation of the previous multi-value field.
      // Only Default Gateway continuations carry signal (IPv6 line first, IPv4
      // below it); DNS servers, suffix lists etc. are noise.
      const value = raw.trim()
      if (currentKey === "default gateway") {
        handleGateway(raw, value)
      } else {
        lines.push(skippedLine(raw))
      }
      continue
    }

    const key = canonicalKey(field[2])
    const value = (field[3] ?? "").trim()
    currentKey = key

    // Host Name lives in the global section, before any adapter header.
    if (key === "host name" && !cur && value) {
      hostname = hostname || value
      lines.push(valueLine(raw, value, "used"))
      continue
    }

    if (key === "physical address" && cur) {
      const mac = value.toLowerCase().replace(/-/g, ":")
      const useMac = !cur.excluded && MAC_RE.test(mac)
      const line = valueLine(raw, value, useMac ? "used" : "skipped")
      lines.push(line)
      if (useMac) {
        cur.iface.mac = mac
        cur.tentative.push(line)
      }
      continue
    }

    if (key === "media state") {
      // "Media disconnected" — adapter is down, drop it like a DOWN `ip a`
      // interface. An unrecognized language still drops it via the address-less
      // fallback in flush.
      const v = value.toLowerCase()
      if (MEDIA_DISCONNECTED_KEYWORDS.some((kw) => v.includes(kw))) exclude()
      lines.push(skippedLine(raw))
      continue
    }

    if (key === "description") {
      if (VIRTUAL_ADAPTER_DESC_RE.test(value)) exclude()
      lines.push(skippedLine(raw))
      continue
    }

    // IPv4 — also "Autoconfiguration IPv4 Address" (APIPA) and the bare
    // "IP Address" of pre-Vista ipconfig. The mask arrives on the NEXT line.
    if (key.endsWith("ipv4 address") || key.endsWith("ip address")) {
      failPendingV4()
      const addr = cleanWinAddress(value)
      if (!isValidIp(addr) || addr.includes(":")) {
        lines.push(
          valueLine(raw, value, "error", `Not a valid IPv4 address: ${value}`),
        )
        errorCount++
        continue
      }
      if (!cur) {
        lines.push(
          valueLine(raw, value, "error", "Address outside any adapter section."),
        )
        errorCount++
        continue
      }
      const noise = cur.excluded || isNoiseAddress(addr)
      const line = valueLine(raw, addr, noise ? "skipped" : "used")
      lines.push(line)
      if (!noise) cur.tentative.push(line)
      pendingV4 = { addr, noise, line }
      continue
    }

    if (key === "subnet mask") {
      if (!pendingV4) {
        lines.push(skippedLine(raw))
        continue
      }
      const prefix = maskToPrefix(value)
      if (prefix === null) {
        lines.push(
          valueLine(raw, value, "error", `Not a valid subnet mask: ${value}`),
        )
        errorCount++
        pendingV4 = null
        continue
      }
      if (pendingV4.noise) {
        lines.push(valueLine(raw, value, "skipped"))
      } else {
        const line = valueLine(raw, value, "used")
        lines.push(line)
        cur!.tentative.push(line)
        cur!.iface.addresses.push(`${pendingV4.addr}/${prefix}`)
      }
      pendingV4 = null
      continue
    }

    if (key.endsWith("ipv6 address")) {
      // Temporary (privacy churn) and link-local addresses are noise; a global
      // IPv6 has no printed prefix, so it's recorded truthfully as /128.
      const addr = cleanWinAddress(value)
      const isMain = key === "ipv6 address"
      if (!isMain || !cur || cur.excluded) {
        lines.push(valueLine(raw, value, "skipped"))
        continue
      }
      if (!isValidIp(addr)) {
        lines.push(
          valueLine(raw, value, "error", `Not a valid IPv6 address: ${value}`),
        )
        errorCount++
        continue
      }
      if (isNoiseAddress(addr)) {
        lines.push(valueLine(raw, value, "skipped"))
        continue
      }
      const line = valueLine(raw, addr, "used")
      lines.push(line)
      cur.tentative.push(line)
      cur.iface.addresses.push(`${addr}/128`)
      continue
    }

    if (key === "default gateway") {
      if (value) handleGateway(raw, value)
      else lines.push(skippedLine(raw))
      continue
    }

    // DHCP flags, lease times, DNS servers, DUIDs, NetBIOS state — noise.
    lines.push(skippedLine(raw))
  }
  flush()

  return {
    lines,
    interfaces,
    routes,
    logins: [],
    hostname,
    errorCount,
    usedCount: interfaces.length + routes.length + (hostname ? 1 : 0),
    skippedCount,
  }
}
