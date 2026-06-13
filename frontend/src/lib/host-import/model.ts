import { hostAddr } from "@/lib/topology/cidr"

// Shared line/highlight model for the host form's "Magic" import parsers
// (parse.ts and ipconfig.ts). Each pasted line becomes a ParsedLine whose
// segments reconstruct the raw text verbatim, tagged with how the parser
// treated every run of characters.

export type SegRole = "used" | "skipped" | "error"

// One run of characters of a source line, tagged with how the parser treats it.
// Concatenating every segment's text reconstructs the original line verbatim.
export interface Segment {
  text: string
  role: SegRole
}

export interface ParsedLine {
  raw: string
  segments: Segment[]
  error?: string
}

export interface ParsedInterface {
  name: string
  mac: string
  addresses: string[]
}

export interface ParsedRoute {
  destination: string
  gateway: string
  interface: string
}

// One user footprint, deduplicated to a distinct (user, from) pair. `from` is
// the source host/IP the session originated from, "" for a local login.
export interface ParsedLogin {
  user: string
  from: string
  tty: string
  lastSeen: string
  count: number
}

// Shared shape produced by each command sub-parser; parseCommandOutput returns
// it with the command metadata added (see ParseResult in parse.ts).
export interface SubParse {
  lines: ParsedLine[]
  interfaces: ParsedInterface[]
  routes: ParsedRoute[]
  logins: ParsedLogin[]
  // Machine name, when the command reveals it (`ipconfig /all` Host Name).
  hostname: string
  errorCount: number
  usedCount: number
  skippedCount: number
}

export interface Span {
  start: number
  end: number
  role: SegRole
}

// Stitches tagged spans together with the untagged gaps between them (skipped),
// so the rendered segments reproduce the whole raw line in order.
export function segmentLine(raw: string, spans: Span[]): Segment[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  const segs: Segment[] = []
  let cursor = 0
  for (const s of sorted) {
    if (s.start > cursor) {
      segs.push({ text: raw.slice(cursor, s.start), role: "skipped" })
    }
    segs.push({ text: raw.slice(s.start, s.end), role: s.role })
    cursor = s.end
  }
  if (cursor < raw.length) segs.push({ text: raw.slice(cursor), role: "skipped" })
  if (segs.length === 0) segs.push({ text: raw, role: "skipped" })
  return segs
}

export function skippedLine(raw: string): ParsedLine {
  return { raw, segments: [{ text: raw, role: "skipped" }] }
}

// Demote optimistic "used" highlights back to skipped, so the rendered
// segments never show green on lines that won't be imported. Shared by the
// interface parsers (`ip a`, `ipconfig`), which only learn whether an
// interface survives once its whole section has been read.
export function demoteToSkipped(toDemote: ParsedLine[]): void {
  for (const line of toDemote) {
    line.segments = line.segments.map((s) =>
      s.role === "used" ? { ...s, role: "skipped" } : s,
    )
  }
}

// Loopback (127/8, ::1) and link-local (fe80::/10, 169.254/16) addresses are
// recognized but never useful for topology — treated as skipped, not imported.
export function isNoiseAddress(cidrOrIp: string): boolean {
  const host = hostAddr(cidrOrIp)
  if (!host) return false
  return (
    host.startsWith("127.") ||
    host === "::1" ||
    host.toLowerCase().startsWith("fe80") ||
    host.startsWith("169.254.")
  )
}

// Tokens with their character offsets, for span-based highlighting.
export function tokenize(raw: string): { text: string; start: number; end: number }[] {
  const out: { text: string; start: number; end: number }[] = []
  const re = /\S+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length })
  }
  return out
}
