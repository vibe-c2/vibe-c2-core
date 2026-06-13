import { isValidCidr, isValidIp } from "@/lib/topology/cidr"
import { parseIpconfig } from "@/lib/host-import/ipconfig"
import {
  demoteToSkipped,
  isNoiseAddress,
  segmentLine,
  skippedLine,
  tokenize,
  type ParsedInterface,
  type ParsedLine,
  type ParsedLogin,
  type ParsedRoute,
  type Span,
  type SubParse,
} from "@/lib/host-import/model"

// Pure parser for the host form's "Magic" import step. The operator pastes the
// raw output of a recon command (command on line 1, its output below); this
// turns it into prefilled interface/route data PLUS a per-line, per-token
// highlight model so the UI can show exactly what will be used, what's noise
// (skipped), and what's malformed (error, blocks the import). No React, never
// throws — every address goes through the defensive cidr.ts helpers.
//
// Supported commands: `ip a` (interfaces), `ip ro` (routes), `last` (user
// footprints — the identity layer of the topology), and `ipconfig /all`
// (Windows, in ipconfig.ts: interfaces + default-gateway routes + host name).
//
// The line/highlight model and shared helpers live in model.ts; this module
// re-exports the public surface so consumers import from one place.

export type {
  ParsedInterface,
  ParsedLine,
  ParsedLogin,
  ParsedRoute,
  Segment,
  SegRole,
  SubParse,
} from "@/lib/host-import/model"

export type CommandKind = "ip-addr" | "ip-route" | "last" | "ipconfig"

export interface ParseResult extends SubParse {
  command: CommandKind | null
  commandError: string | null
}

const SUPPORTED_HINT = "Supported commands: ip a, ip ro, last, ipconfig /all"

export function parseCommandOutput(text: string): ParseResult {
  const rawLines = text.replace(/\r/g, "").split("\n")
  const cmdIdx = rawLines.findIndex((l) => l.trim().length > 0)

  // Nothing typed yet.
  if (cmdIdx === -1) {
    return emptyResult(rawLines.map((raw) => skippedLine(raw)))
  }

  const command = detectCommand(rawLines[cmdIdx])
  const lines: ParsedLine[] = []

  // Blank lines that precede the command are pure noise.
  for (let i = 0; i < cmdIdx; i++) lines.push(skippedLine(rawLines[i]))

  if (!command) {
    const message = `Unsupported command. ${SUPPORTED_HINT}`
    lines.push({
      raw: rawLines[cmdIdx],
      segments: [{ text: rawLines[cmdIdx], role: "error" }],
      error: message,
    })
    for (let i = cmdIdx + 1; i < rawLines.length; i++) {
      lines.push(skippedLine(rawLines[i]))
    }
    return {
      command: null,
      commandError: message,
      lines,
      interfaces: [],
      routes: [],
      logins: [],
      hostname: "",
      errorCount: 1,
      usedCount: 0,
      skippedCount: 0,
    }
  }

  // The command line itself is recognized — show it as used context.
  lines.push({
    raw: rawLines[cmdIdx],
    segments: [{ text: rawLines[cmdIdx], role: "used" }],
  })

  const output = rawLines.slice(cmdIdx + 1)
  const parsed =
    command === "ip-addr"
      ? parseIpAddr(output)
      : command === "ip-route"
        ? parseIpRoute(output)
        : command === "ipconfig"
          ? parseIpconfig(output)
          : parseLast(output)
  lines.push(...parsed.lines)

  // `lines` (with the command line prepended) overrides parsed.lines.
  return { command, commandError: null, ...parsed, lines }
}

// --- command detection -------------------------------------------------------

// Normalizes the first line (drops a leading `sudo`, collapses whitespace) and
// matches the iproute2 object word, tolerating flags (`ip -4 a`) and verbose
// forms (`ip address show`).
function detectCommand(line: string): CommandKind | null {
  const norm = line.trim().toLowerCase().replace(/\s+/g, " ").replace(/^sudo /, "")
  if (detectLastCommand(norm)) return "last"
  // Windows: tolerate a pasted cmd/PowerShell prompt ("C:\Users\x>", "PS C:\>"),
  // an explicit .exe suffix (script/log captures), and the space-less
  // `ipconfig/all` cmd.exe accepts. Plain `ipconfig` (no /all) prints the same
  // shape minus MAC/host name, so it parses too.
  const win = norm.replace(/^(?:ps )?[a-z]:[^>]*> ?/, "")
  if (/^ipconfig(?:\.exe)?(?: |\/|$)/.test(win)) return "ipconfig"
  const m = /^ip(?:\s+-\S+)*\s+(\S+)/.exec(norm)
  if (!m) return null
  const obj = m[1]
  if (/^a(ddr(ess)?)?$/.test(obj)) return "ip-addr"
  if (/^r(o(ute)?)?$/.test(obj)) return "ip-route"
  return null
}

// `last` (and its read-only twin `lastb`) is its own top-level command, not an
// `ip` object — matched separately. Tolerates a leading sudo and any flags
// (`last -i`, `last -F -a`, `last -n 50`).
function detectLastCommand(norm: string): boolean {
  return /^lastb?(\s|$)/.test(norm)
}

// --- shared helpers ------------------------------------------------------------

function emptyResult(lines: ParsedLine[]): ParseResult {
  return {
    command: null,
    commandError: null,
    lines,
    interfaces: [],
    routes: [],
    logins: [],
    hostname: "",
    errorCount: 0,
    usedCount: 0,
    skippedCount: 0,
  }
}

// Host-local virtual interfaces: Docker bridges/veth pairs, libvirt/KVM
// bridges, and k8s CNI interfaces. Their addresses are host-local and collide
// across hosts (every Docker host's docker0 is 172.17.0.0/16), so importing
// them as subnets merges unrelated hosts into one fake network. Recognized but
// never imported — shown as skipped, like loopback.
const VIRTUAL_IFACE_NAME_RE =
  /^(?:docker|br-[0-9a-f]{12}|veth|virbr|cni\d*|cali|flannel|cbr\d+|tunl\d+|kube-ipvs|nodelocaldns)/i

// Docker assigns this locally-administered OUI to its bridge/veth interfaces —
// a backstop for virtual interfaces whose names don't match the list above.
const VIRTUAL_MAC_PREFIX = "02:42:"

function isVirtualInterfaceName(name: string): boolean {
  return VIRTUAL_IFACE_NAME_RE.test(name)
}

function isVirtualMac(mac: string): boolean {
  return mac.toLowerCase().startsWith(VIRTUAL_MAC_PREFIX)
}

// --- ip a --------------------------------------------------------------------

const HEADER_RE = /^(\s*)(\d+):\s+([^\s:@]+)(@\S+)?:/
const LINK_RE = /^(\s*)link\/(ether|loopback)\s+(\S+)/
const INET_RE = /^(\s*)(inet6?)\s+(\S+)/

function parseIpAddr(output: string[]): SubParse {
  const lines: ParsedLine[] = []
  const interfaces: ParsedInterface[] = []
  let errorCount = 0
  let skippedCount = 0

  // The interface currently being built from successive indented lines.
  // Whether it will be imported isn't known until the next header (or EOF):
  // an address-less interface is dropped. Its name/mac segments are tagged
  // "used" optimistically, so `tentative` holds those lines for demotion on
  // drop. `excluded` covers loopback and host-local virtual interfaces (Docker,
  // libvirt, k8s CNI) — both recognized but never imported.
  let cur: {
    iface: ParsedInterface
    excluded: boolean
    tentative: ParsedLine[]
  } | null = null

  // Commit (or drop) the current interface. Anything excluded (loopback,
  // virtual) or without a usable address (down/address-less) is dropped but
  // counted as skipped, and its tentative lines are demoted.
  const flush = () => {
    if (!cur) return
    if (!cur.excluded && cur.iface.addresses.length > 0) {
      interfaces.push(cur.iface)
    } else {
      demoteToSkipped(cur.tentative)
      skippedCount++
    }
    cur = null
  }

  for (const raw of output) {
    const header = HEADER_RE.exec(raw)
    if (header) {
      flush()
      const name = header[3]
      const rest = raw.slice(header[0].length)
      const excluded =
        name === "lo" ||
        /\bLOOPBACK\b/.test(rest) ||
        isVirtualInterfaceName(name)
      cur = { iface: { name, mac: "", addresses: [] }, excluded, tentative: [] }
      const nameStart = raw.indexOf(name, header[1].length + header[2].length)
      const spans: Span[] = [
        {
          start: nameStart,
          end: nameStart + name.length,
          role: excluded ? "skipped" : "used",
        },
      ]
      const headerLine: ParsedLine = { raw, segments: segmentLine(raw, spans) }
      lines.push(headerLine)
      if (!excluded) cur.tentative.push(headerLine)
      continue
    }

    const link = LINK_RE.exec(raw)
    if (link) {
      const kind = link[2]
      const mac = link[3]
      // MAC OUI backstop: a Docker bridge/veth interface whose name didn't
      // match the list is caught here. Demote the header pushed optimistically.
      if (cur && !cur.excluded && isVirtualMac(mac)) {
        cur.excluded = true
        demoteToSkipped(cur.tentative)
        cur.tentative = []
      }
      // link/loopback addresses are all-zero placeholders — never used.
      const useMac = kind === "ether" && cur != null && !cur.excluded
      const macStart = raw.indexOf(mac, link[1].length + ("link/".length + kind.length))
      const spans: Span[] = [
        {
          start: macStart,
          end: macStart + mac.length,
          role: useMac ? "used" : "skipped",
        },
      ]
      if (useMac && cur) cur.iface.mac = mac
      const linkLine: ParsedLine = { raw, segments: segmentLine(raw, spans) }
      lines.push(linkLine)
      if (useMac && cur) cur.tentative.push(linkLine)
      continue
    }

    const inet = INET_RE.exec(raw)
    if (inet) {
      const addr = inet[3]
      const addrStart = raw.indexOf(addr, inet[1].length + inet[2].length)
      const addrSpan = { start: addrStart, end: addrStart + addr.length }

      if (!cur) {
        lines.push({
          raw,
          segments: segmentLine(raw, [{ ...addrSpan, role: "error" }]),
          error: "Address outside any interface — expected an interface header first.",
        })
        errorCount++
        continue
      }
      if (!isValidCidr(addr)) {
        lines.push({
          raw,
          segments: segmentLine(raw, [{ ...addrSpan, role: "error" }]),
          error: `Not a valid CIDR: ${addr}`,
        })
        errorCount++
        continue
      }
      if (cur.excluded || isNoiseAddress(addr)) {
        lines.push({ raw, segments: segmentLine(raw, [{ ...addrSpan, role: "skipped" }]) })
        continue
      }
      cur.iface.addresses.push(addr)
      lines.push({ raw, segments: segmentLine(raw, [{ ...addrSpan, role: "used" }]) })
      continue
    }

    // valid_lft, brd-only lines, altname, blanks — all noise.
    lines.push(skippedLine(raw))
  }
  flush()

  return {
    lines,
    interfaces,
    routes: [],
    logins: [],
    hostname: "",
    errorCount,
    usedCount: interfaces.length,
    skippedCount,
  }
}

// --- ip ro -------------------------------------------------------------------

// iproute2 route-type prefixes (`blackhole 10.0.0.0/8`, `unreachable ...`).
// These are control entries with no usable gateway, so the whole line is
// skipped rather than mistaken for a destination.
const ROUTE_TYPES = new Set([
  "blackhole",
  "unreachable",
  "prohibit",
  "throw",
  "local",
  "broadcast",
  "nat",
  "anycast",
  "multicast",
])

// Resolves a route destination token. `default` is the wildcard; a bare host IP
// (host route, no prefix) is normalized to /32 or /128 so it satisfies the
// backend's CIDR requirement.
function normalizeDestination(text: string): { destination: string; ok: boolean } {
  if (text === "default") return { destination: "0.0.0.0/0", ok: true }
  if (isValidCidr(text)) return { destination: text, ok: true }
  if (isValidIp(text)) {
    return { destination: `${text}/${text.includes(":") ? "128" : "32"}`, ok: true }
  }
  return { destination: text, ok: false }
}

function parseIpRoute(output: string[]): SubParse {
  const lines: ParsedLine[] = []
  const routes: ParsedRoute[] = []
  let errorCount = 0
  let skippedCount = 0

  for (const raw of output) {
    const toks = tokenize(raw)
    if (toks.length === 0) {
      lines.push(skippedLine(raw))
      continue
    }

    // Special route types (blackhole/unreachable/…) and on-link/connected
    // routes (no `via`) carry no pivot signal — skip the whole line. The
    // destination is only validated for genuine gatewayed routes, so a bare
    // host-route IP or a type keyword never produces a false error.
    const viaIdx = toks.findIndex((t) => t.text === "via")
    const gwTok = viaIdx >= 0 ? toks[viaIdx + 1] : undefined
    if (ROUTE_TYPES.has(toks[0].text) || !gwTok) {
      lines.push(skippedLine(raw))
      skippedCount++
      continue
    }

    const spans: Span[] = []
    let error: string | undefined

    // Destination — first token. Validated now that we know it's gatewayed.
    const dest = toks[0]
    const { destination, ok: destOk } = normalizeDestination(dest.text)
    const gwOk = isValidIp(gwTok.text)

    // Interface — `dev <name>`.
    const devIdx = toks.findIndex((t) => t.text === "dev")
    const devTok = devIdx >= 0 ? toks[devIdx + 1] : undefined

    if (destOk) {
      spans.push({ start: dest.start, end: dest.end, role: "used" })
    } else {
      error = `Not a valid destination: ${dest.text}`
      spans.push({ start: dest.start, end: dest.end, role: "error" })
    }

    spans.push({
      start: gwTok.start,
      end: gwTok.end,
      role: gwOk ? "used" : "error",
    })
    if (!gwOk) error = `Not a valid gateway IP: ${gwTok.text}`

    if (devTok) {
      spans.push({ start: devTok.start, end: devTok.end, role: "used" })
    }

    lines.push({ raw, segments: segmentLine(raw, spans), error })

    if (error) {
      errorCount++
      continue
    }
    routes.push({
      destination,
      gateway: gwTok.text,
      interface: devTok ? devTok.text : "",
    })
  }

  return {
    lines,
    interfaces: [],
    routes,
    logins: [],
    hostname: "",
    errorCount,
    usedCount: routes.length,
    skippedCount,
  }
}

// --- last --------------------------------------------------------------------

// Pseudo-users `last` emits for power events plus the wtmp/btmp footer markers
// ("wtmp begins <date>") — not real logins, never imported.
const LAST_PSEUDO_USERS = new Set([
  "reboot",
  "shutdown",
  "runlevel",
  "wtmp",
  "btmp",
])

// The login-time column always starts with an abbreviated weekday, both in the
// default locale and under `last -F`. That anchor is what separates an optional
// `from` host (column 3) from the date: if column 3 IS a weekday there was no
// from. Robust against hostnames that look like anything else.
const WEEKDAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])

const isWeekday = (text: string) => WEEKDAYS.has(text.toLowerCase())

// A `from` value that names no remote origin: a local console/display session
// (":0", "::1" both start with ":"), the all-zero placeholder `last -i` prints
// for local logins, or the loopback host some `last` builds record for a local
// session (localhost / localhost.localdomain / 127.x). Treated as "no source
// host" so it never spawns a bogus phantom-host node.
function isLocalOrigin(from: string): boolean {
  const f = from.toLowerCase()
  return (
    from === "" ||
    from === "0.0.0.0" ||
    from.startsWith(":") ||
    f === "localhost" ||
    f === "localhost.localdomain" ||
    from.startsWith("127.")
  )
}

// `last` reports login sessions from wtmp: one line per session, most-recent
// first, columns `USER TTY [FROM] WEEKDAY MON DAY TIME ...`. We keep the user
// (the identity), the optional FROM (the source host — an observed access
// path), and the first login time for context, then collapse repeated sessions
// of the same (user, from) pair into a single footprint with a count. Reboot/
// shutdown pseudo-users and the trailing "wtmp begins …" footer are dropped as
// noise, the same way loopback/veth interfaces are.
function parseLast(output: string[]): SubParse {
  const lines: ParsedLine[] = []
  let skippedCount = 0

  // Keyed by `user|from` so repeated sessions collapse; insertion order (the
  // first, most-recent occurrence) is preserved for a stable, useful display.
  const byKey = new Map<string, ParsedLogin>()

  for (const raw of output) {
    const toks = tokenize(raw)
    if (toks.length === 0) {
      lines.push(skippedLine(raw))
      continue
    }

    const user = toks[0].text
    const weekdayIdx = toks.findIndex((t) => isWeekday(t.text))

    // No date column (the "wtmp begins …" footer, a header, or a truncated
    // line) or a power-event pseudo-user → pure noise, like a skipped iface.
    if (weekdayIdx < 2 || LAST_PSEUDO_USERS.has(user.toLowerCase())) {
      lines.push(skippedLine(raw))
      skippedCount++
      continue
    }

    // Column 3 is the source host only when it sits before the date column;
    // when weekdayIdx === 2 the third token IS the date, so there's no from.
    const fromTok = weekdayIdx > 2 ? toks[2] : undefined
    const from =
      fromTok && !isLocalOrigin(fromTok.text) ? fromTok.text : ""
    const tty = toks[1]?.text ?? ""
    // The login-time column is 4 tokens: weekday, month, day, time
    // ("Tue Jun 10 14:02"). What follows (- logout / still logged in) is churn.
    const lastSeen = toks
      .slice(weekdayIdx, weekdayIdx + 4)
      .map((t) => t.text)
      .join(" ")

    const spans: Span[] = [{ start: toks[0].start, end: toks[0].end, role: "used" }]
    if (from && fromTok) {
      spans.push({ start: fromTok.start, end: fromTok.end, role: "used" })
    }
    lines.push({ raw, segments: segmentLine(raw, spans) })

    const key = `${user}|${from}`
    const existing = byKey.get(key)
    if (existing) {
      existing.count++
    } else {
      byKey.set(key, { user, from, tty, lastSeen, count: 1 })
    }
  }

  const logins = [...byKey.values()]
  return {
    lines,
    interfaces: [],
    routes: [],
    logins,
    hostname: "",
    errorCount: 0,
    usedCount: logins.length,
    skippedCount,
  }
}
